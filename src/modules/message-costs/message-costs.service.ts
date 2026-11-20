import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { Session } from '../session/entities/session.entity';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { Campaign } from '../campaign/entities/campaign.entity';
import { CampaignRecipient, RecipientStatus } from '../campaign/entities/campaign-recipient.entity';
import { Notification } from '../conversation/entities/notification.entity';
import { sessionScopeVisible } from '../../common/security/session-scope';
import { MessageCharge } from './entities/message-charge.entity';
import { MessageCostSetting } from './entities/message-cost-setting.entity';
import { buildCostSuggestions, estimateInr, type CostSuggestion } from './message-cost-rules';
import { explainDeliveryError } from './delivery-errors';

/** What a Cloud API status webhook says about one message's price and delivery. */
export interface AckPricing {
  billable?: boolean;
  category?: string;
  type?: string;
  errorCode?: number;
  errorTitle?: string;
}

/** Whose costs a request may see: one business, and for a session-restricted key only its numbers. */
export interface CostScope {
  businessId: string;
  defaultBusinessId: string;
  allowedSessions?: string[] | null;
}

const DAY = 24 * 60 * 60 * 1000;
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
const month = (d = new Date()) => d.toISOString().slice(0, 7);

type MetaBillEngine = {
  getPricingAnalytics?: (
    startUnix: number,
    endUnix: number,
  ) => Promise<Array<{ category: string; type: string; volume: number; cost: number }>>;
};

/** Records what each outgoing message costs and turns it into totals, a budget and saving advice. */
@Injectable()
export class MessageCostsService {
  private readonly logger = createLogger('MessageCostsService');

  constructor(
    @InjectRepository(MessageCharge, 'data') private readonly charges: Repository<MessageCharge>,
    @InjectRepository(MessageCostSetting, 'data') private readonly settings: Repository<MessageCostSetting>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(Message, 'data') private readonly messages: Repository<Message>,
    @InjectRepository(Campaign, 'data') private readonly campaigns: Repository<Campaign>,
    @InjectRepository(CampaignRecipient, 'data') private readonly recipients: Repository<CampaignRecipient>,
    @InjectRepository(Notification, 'data') private readonly notifications: Repository<Notification>,
    @Optional() private readonly engines?: EngineRegistry,
  ) {}

  /** A send whose cost we want to attribute (campaign, one-off template). Never throws. */
  async recordSend(input: {
    sessionId: string;
    waMessageId: string;
    chatId: string;
    campaignId?: string;
    source: string;
  }) {
    try {
      const existing = await this.charges.findOne({
        where: { sessionId: input.sessionId, waMessageId: input.waMessageId },
      });
      if (existing) {
        await this.charges.update(existing.id, {
          campaignId: input.campaignId ?? existing.campaignId,
          source: input.source,
        });
      } else {
        await this.charges.insert({ ...input, campaignId: input.campaignId ?? null, status: 'sent' });
      }
    } catch (err) {
      this.logger.warn(`Could not record send ${input.waMessageId}: ${String(err)}`);
    }
  }

  /** A Cloud API status webhook: store Meta's pricing, advance delivery, update the campaign. Never throws. */
  async recordStatus(
    sessionId: string,
    waMessageId: string,
    status: string,
    chatId: string | undefined,
    info: AckPricing,
  ) {
    try {
      let row = await this.charges.findOne({ where: { sessionId, waMessageId } });
      if (!row) {
        // Only Cloud API sends carry pricing; other acks (no pricing, no error) are not ours to track.
        if (info.billable === undefined && !info.category && !info.errorCode && !info.errorTitle) return;
        row = this.charges.create({ sessionId, waMessageId, chatId: chatId ?? null, source: 'other', status: 'sent' });
      }
      const before = row.status;
      if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[row.status] ?? 0)) row.status = status;
      if (info.category) row.category = info.category.toLowerCase();
      if (info.type) row.pricingType = info.type.toLowerCase();
      if (info.billable !== undefined) row.billable = info.billable;
      if (info.errorCode) row.errorCode = info.errorCode;
      if (info.errorTitle) row.errorTitle = info.errorTitle;
      if (!row.chatId && chatId) row.chatId = chatId;
      row.estimatedInr = row.status === 'failed' ? 0 : estimateInr(row.category, row.billable);
      await this.charges.save(row);

      if (row.campaignId && row.chatId && row.status !== before)
        await this.advanceCampaign(row.campaignId, row.chatId, before, row.status, row);
      if (row.estimatedInr > 0 && before === 'sent' && status !== 'sent') await this.checkBudget(sessionId);
    } catch (err) {
      this.logger.warn(`Could not record status for ${waMessageId}: ${String(err)}`);
    }
  }

  /** Campaign delivery counters were never fed by acks; this keeps recipients and totals honest. */
  private async advanceCampaign(
    campaignId: string,
    chatId: string,
    before: string,
    after: string,
    row: Pick<MessageCharge, 'errorCode' | 'errorTitle'>,
  ) {
    const recipientStatus =
      after === 'read'
        ? RecipientStatus.READ
        : after === 'delivered'
          ? RecipientStatus.DELIVERED
          : after === 'failed'
            ? RecipientStatus.FAILED
            : null;
    if (!recipientStatus) return;
    await this.recipients.update(
      { campaignId, chatId },
      after === 'failed'
        ? { status: recipientStatus, errorMessage: explainDeliveryError(row.errorCode, row.errorTitle).why }
        : { status: recipientStatus, deliveredAt: new Date() },
    );
    const wasDelivered = before === 'delivered' || before === 'read';
    if ((after === 'delivered' || after === 'read') && !wasDelivered) {
      await this.campaigns.increment({ id: campaignId }, 'deliveredCount', 1);
    } else if (after === 'failed' && !wasDelivered) {
      await this.campaigns.increment({ id: campaignId }, 'failedCount', 1);
    }
  }

  /** The business's numbers, narrowed to the ones a session-restricted API key may see. */
  private async sessionIdsFor(scope: CostScope): Promise<string[]> {
    const rows = await this.sessions.find({ select: { id: true, businessId: true } });
    return rows
      .filter(s => (s.businessId ?? scope.defaultBusinessId) === scope.businessId)
      .filter(s => sessionScopeVisible(scope.allowedSessions, s.id))
      .map(s => s.id);
  }

  async summary(scope: CostScope, days: number) {
    const businessId = scope.businessId;
    const sessionIds = await this.sessionIdsFor(scope);
    const since = new Date(Date.now() - days * DAY);
    const rows = sessionIds.length
      ? await this.charges.find({ where: { sessionId: In(sessionIds), createdAt: MoreThanOrEqual(since) } })
      : [];

    const byCategory: Record<string, { messages: number; paid: number; free: number; inr: number }> = {};
    const byDay: Record<string, { messages: number; inr: number }> = {};
    const byCampaign = new Map<
      string,
      { messages: number; delivered: number; failed: number; inr: number; chats: Set<string> }
    >();
    let inr = 0;
    let free = 0;
    for (const r of rows) {
      const cat = r.category ?? 'unknown';
      const c = (byCategory[cat] ??= { messages: 0, paid: 0, free: 0, inr: 0 });
      c.messages++;
      c.inr += r.estimatedInr;
      if (r.estimatedInr > 0) c.paid++;
      else if (r.billable === false) c.free++;
      if (r.billable === false) free++;
      inr += r.estimatedInr;
      const day = r.createdAt.toISOString().slice(0, 10);
      const d = (byDay[day] ??= { messages: 0, inr: 0 });
      d.messages++;
      d.inr += r.estimatedInr;
      if (r.campaignId) {
        const k = byCampaign.get(r.campaignId) ?? {
          messages: 0,
          delivered: 0,
          failed: 0,
          inr: 0,
          chats: new Set<string>(),
        };
        k.messages++;
        k.inr += r.estimatedInr;
        if (r.status === 'delivered' || r.status === 'read') k.delivered++;
        if (r.status === 'failed') k.failed++;
        if (r.chatId) k.chats.add(r.chatId);
        byCampaign.set(r.campaignId, k);
      }
    }

    const campaignIds = [...byCampaign.keys()];
    const names = campaignIds.length
      ? await this.campaigns.find({
          where: { id: In(campaignIds) },
          select: { id: true, name: true, startedAt: true, createdAt: true },
        })
      : [];
    const campaigns = await Promise.all(
      names.map(async c => {
        const k = byCampaign.get(c.id)!;
        const replies = await this.countRepliers(sessionIds, [...k.chats], c.startedAt ?? c.createdAt);
        return {
          id: c.id,
          name: c.name,
          messages: k.messages,
          delivered: k.delivered,
          failed: k.failed,
          inr: round(k.inr),
          replies,
          costPerReply: replies ? round(k.inr / replies) : null,
        };
      }),
    );

    const settings = await this.getSettings(businessId);
    const monthSpend = await this.monthSpend(sessionIds);
    return {
      days,
      totals: { messages: rows.length, inr: round(inr), free, paid: rows.filter(r => r.estimatedInr > 0).length },
      byCategory: Object.entries(byCategory).map(([category, v]) => ({ category, ...v, inr: round(v.inr) })),
      byDay: Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v, inr: round(v.inr) })),
      campaigns: campaigns.sort((a, b) => b.inr - a.inr),
      budget: { monthlyBudgetInr: settings.monthlyBudgetInr, monthSpendInr: round(monthSpend) },
    };
  }

  /** People among `chatIds` who wrote to us after `since` (a campaign reply). */
  private async countRepliers(sessionIds: string[], chatIds: string[], since: Date): Promise<number> {
    if (!chatIds.length || !sessionIds.length) return 0;
    const rows = await this.messages
      .createQueryBuilder('m')
      .select('DISTINCT m.chatId', 'chatId')
      .where('m.sessionId IN (:...sessionIds)', { sessionIds })
      .andWhere('m.direction = :dir', { dir: MessageDirection.INCOMING })
      .andWhere('m.chatId IN (:...chatIds)', { chatIds: chatIds.slice(0, 5000) })
      .andWhere('m.createdAt >= :since', { since })
      .getRawMany<{ chatId: string }>();
    return rows.length;
  }

  private async monthSpend(sessionIds: string[]): Promise<number> {
    if (!sessionIds.length) return 0;
    const start = new Date(`${month()}-01T00:00:00Z`);
    const rows = await this.charges.find({
      where: { sessionId: In(sessionIds), createdAt: Between(start, new Date()) },
      select: { estimatedInr: true },
    });
    return rows.reduce((s, r) => s + r.estimatedInr, 0);
  }

  async suggestions(scope: CostScope, days: number): Promise<CostSuggestion[]> {
    const sessionIds = await this.sessionIdsFor(scope);
    if (!sessionIds.length) return [];
    const since = new Date(Date.now() - days * DAY);
    // shortcut: newest 20k charges per period; enough for small businesses, aggregate in SQL beyond that.
    const charges = await this.charges.find({
      where: { sessionId: In(sessionIds), createdAt: MoreThanOrEqual(since) },
      order: { createdAt: 'DESC' },
      take: 20_000,
    });
    const chatIds = [...new Set(charges.map(c => c.chatId).filter((c): c is string => Boolean(c)))];
    const incoming = new Map<string, number[]>();
    for (let i = 0; i < chatIds.length; i += 500) {
      const rows = await this.messages.find({
        where: {
          sessionId: In(sessionIds),
          chatId: In(chatIds.slice(i, i + 500)),
          direction: MessageDirection.INCOMING,
          createdAt: MoreThanOrEqual(new Date(since.getTime() - DAY)),
        },
        select: { chatId: true, createdAt: true },
      });
      for (const r of rows) incoming.set(r.chatId, [...(incoming.get(r.chatId) ?? []), r.createdAt.getTime()]);
    }
    return buildCostSuggestions(charges, incoming);
  }

  /**
   * For a campaign about to go out: how many of these numbers are inside their free 24h window right
   * now, and how many failed before.
   */
  async precheck(scope: CostScope, chatIds: string[]) {
    const sessionIds = await this.sessionIdsFor(scope);
    if (!sessionIds.length || !chatIds.length) return { inWindow: 0, failedBefore: 0 };
    const ids = chatIds.slice(0, 5000);
    const open = await this.messages
      .createQueryBuilder('m')
      .select('DISTINCT m.chatId', 'chatId')
      .where('m.sessionId IN (:...sessionIds)', { sessionIds })
      .andWhere('m.direction = :dir', { dir: MessageDirection.INCOMING })
      .andWhere('m.chatId IN (:...ids)', { ids })
      .andWhere('m.createdAt >= :since', { since: new Date(Date.now() - DAY) })
      .getRawMany<{ chatId: string }>();
    const failed = await this.charges
      .createQueryBuilder('c')
      .select('DISTINCT c.chatId', 'chatId')
      .where('c.sessionId IN (:...sessionIds)', { sessionIds })
      .andWhere('c.status = :failed', { failed: 'failed' })
      .andWhere('c.chatId IN (:...ids)', { ids })
      .getRawMany<{ chatId: string }>();
    return { inWindow: open.length, failedBefore: failed.length };
  }

  /**
   * What WhatsApp reported for one sent message: accepted only (no webhook yet), delivered, read or
   * failed — with Meta's reason and what to do. Only for numbers in the caller's scope.
   */
  async deliveryStatus(scope: CostScope, sessionId: string, waMessageId: string) {
    if (!(await this.sessionIdsFor(scope)).includes(sessionId)) return { status: 'unknown' as const };
    const row = await this.charges.findOne({ where: { sessionId, waMessageId } });
    if (!row) return { status: 'unknown' as const };
    const base = {
      status: row.status as 'sent' | 'delivered' | 'read' | 'failed',
      category: row.category,
      billable: row.billable,
      estimatedInr: row.estimatedInr,
      // Meta sends pricing with the first status webhook; none yet means the webhook may not reach us.
      webhookSeen: row.category !== null || row.billable !== null || row.status !== 'sent',
      updatedAt: row.updatedAt,
    };
    if (row.status !== 'failed') return base;
    return {
      ...base,
      errorCode: row.errorCode,
      errorTitle: row.errorTitle,
      ...explainDeliveryError(row.errorCode, row.errorTitle),
    };
  }

  /** Meta's own bill for a Cloud API number (pricing_analytics), when Meta returns it. */
  async metaBill(scope: CostScope, sessionId: string, days: number) {
    if (!(await this.sessionIdsFor(scope)).includes(sessionId)) {
      return { available: false, reason: 'That WhatsApp number is not available to you.' };
    }
    const engine = this.engines?.get(sessionId) as MetaBillEngine | undefined;
    if (!engine?.getPricingAnalytics)
      return { available: false, reason: 'Only connected Cloud API numbers have a Meta bill.' };
    const end = Math.floor(Date.now() / 1000);
    try {
      const rows = await engine.getPricingAnalytics(end - days * 86_400, end);
      return {
        available: true,
        rows,
        totalCost: round(rows.reduce((s, r) => s + r.cost, 0)),
        totalVolume: rows.reduce((s, r) => s + r.volume, 0),
      };
    } catch (err) {
      return {
        available: false,
        reason: `Meta did not return the bill: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getSettings(businessId: string): Promise<{ monthlyBudgetInr: number | null }> {
    const row = await this.settings.findOne({ where: { businessId } });
    return { monthlyBudgetInr: row?.monthlyBudgetInr ?? null };
  }

  async updateSettings(businessId: string, monthlyBudgetInr: number | null) {
    const row = (await this.settings.findOne({ where: { businessId } })) ?? this.settings.create({ businessId });
    row.monthlyBudgetInr = monthlyBudgetInr;
    row.alertedMonth = null; // a new budget may warrant a fresh alert this month
    await this.settings.save(row);
    return { monthlyBudgetInr: row.monthlyBudgetInr };
  }

  /** Sends one in-app notification per month once spend passes 80% of the budget. */
  private async checkBudget(sessionId: string) {
    const session = await this.sessions.findOne({ where: { id: sessionId }, select: { id: true, businessId: true } });
    if (!session?.businessId) return;
    const setting = await this.settings.findOne({ where: { businessId: session.businessId } });
    if (!setting?.monthlyBudgetInr || setting.alertedMonth === month()) return;
    const spend = await this.monthSpend(
      await this.sessionIdsFor({ businessId: session.businessId, defaultBusinessId: session.businessId }),
    );
    if (spend < setting.monthlyBudgetInr * 0.8) return;
    setting.alertedMonth = month();
    await this.settings.save(setting);
    await this.notifications.insert({
      businessId: session.businessId,
      recipientId: null,
      type: 'budget_alert',
      title: `WhatsApp spend reached ${Math.round((spend / setting.monthlyBudgetInr) * 100)}% of your budget`,
      message: `≈ ₹${round(spend)} of ₹${setting.monthlyBudgetInr} this month.`,
      data: { route: '/message-costs' },
      read: false,
      readAt: null,
    });
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
