import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { CampaignService } from '../campaign/campaign.service';
import { Contact } from '../conversation/entities/contact.entity';
import { Conversation, ConversationStatus } from '../conversation/entities/conversation.entity';
import { Deal, DealStage } from '../conversation/entities/deal.entity';
import { Feedback } from '../conversation/entities/feedback.entity';
import { notDndSql } from '../conversation/dnd';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { MessageService } from '../message/message.service';
import { fence, UNTRUSTED_RULE } from '../sales-agent/sales-rules';
import { Session } from '../session/entities/session.entity';
import { isReachablePersonalChat } from '../workflow/inbound-message-filter';
import { Lead, LeadStatus, LeadTemperature } from '../workflow/entities/lead.entity';
import { GreetingKind, GrowthGreetingLog, GrowthSettings } from './entities/growth.entity';
import { fillName, formatSummaryFallback, localDay, localDayBounds, nextDaily, SummaryFacts } from './growth-rules';

const TICK_MS = 60_000;
/** Gap between greeting sends so a batch does not look like a spam burst to WhatsApp. */
const SEND_GAP_MS = 1500;
/** Win-back only reaches chats that went quiet within this window after `winbackDays`, never ancient ones. */
const WINBACK_WINDOW_DAYS = 30;

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const contactChatId = (c: Contact) =>
  c.waContactId.includes('@') ? c.waContactId : `${c.phone ?? c.waContactId}@c.us`;

interface Recipient {
  chatId: string;
  name: string | null;
  kind: GreetingKind;
  periodKey: string;
  text: string;
}

@Injectable()
export class GrowthSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GrowthSchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    @InjectRepository(GrowthSettings, 'data') private readonly settingsRepo: Repository<GrowthSettings>,
    @InjectRepository(GrowthGreetingLog, 'data') private readonly greetingLog: Repository<GrowthGreetingLog>,
    @InjectRepository(Contact, 'data') private readonly contacts: Repository<Contact>,
    @InjectRepository(Conversation, 'data') private readonly conversations: Repository<Conversation>,
    @InjectRepository(Lead, 'data') private readonly leads: Repository<Lead>,
    @InjectRepository(Deal, 'data') private readonly deals: Repository<Deal>,
    @InjectRepository(Feedback, 'data') private readonly feedback: Repository<Feedback>,
    @InjectRepository(Message, 'data') private readonly messages: Repository<Message>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    private readonly messageService: MessageService,
    private readonly campaigns: CampaignService,
    private readonly ai: AiService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Fires due summaries and greetings. The next run is claimed BEFORE sending, so a slow send never doubles. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      // shortcut: one in-process scheduler (same as Library); with several API replicas add a DB lock.
      const dueSummaries = await this.settingsRepo.find({
        where: { summaryEnabled: true, summaryNextRunAt: LessThanOrEqual(now) },
        take: 20,
      });
      for (const s of dueSummaries) {
        await this.settingsRepo.update(s.id, { summaryNextRunAt: nextDaily(s.summaryTime, s.timezone, now) });
        try {
          await this.sendSummary(s, now);
          await this.settingsRepo.update(s.id, { summaryLastError: null });
        } catch (err) {
          this.logger.error(`Daily summary for ${s.businessId} failed: ${errMsg(err)}`);
          await this.settingsRepo.update(s.id, { summaryLastError: errMsg(err).slice(0, 2000) });
        }
      }

      const dueGreetings = await this.settingsRepo.find({
        where: { greetingsEnabled: true, greetingsNextRunAt: LessThanOrEqual(now) },
        take: 20,
      });
      for (const s of dueGreetings) {
        await this.settingsRepo.update(s.id, { greetingsNextRunAt: nextDaily(s.greetingTime, s.timezone, now) });
        try {
          await this.runGreetings(s, now);
          await this.settingsRepo.update(s.id, { greetingsLastError: null });
        } catch (err) {
          this.logger.error(`Greetings for ${s.businessId} failed: ${errMsg(err)}`);
          await this.settingsRepo.update(s.id, { greetingsLastError: errMsg(err).slice(0, 2000) });
        }
      }
    } catch (err) {
      this.logger.error(`Growth scheduler tick failed: ${errMsg(err)}`);
    } finally {
      this.ticking = false;
    }
  }

  // ── Greetings ──

  async runGreetings(s: GrowthSettings, now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
    if (!s.sessionId) throw new BadRequestException('Pick the WhatsApp number to send from');
    const { date, monthDay } = localDay(s.timezone, now);
    const year = date.slice(0, 4);
    const recipients: Recipient[] = [];

    const people = await this.contacts.find({
      where: [
        { businessId: s.businessId, birthday: monthDay },
        { businessId: s.businessId, anniversary: monthDay },
      ],
      take: 1000,
    });
    for (const c of people) {
      if (c.birthday === monthDay && s.birthdayText.trim()) {
        recipients.push({
          chatId: contactChatId(c),
          name: c.name,
          kind: 'birthday',
          periodKey: year,
          text: s.birthdayText,
        });
      }
      if (c.anniversary === monthDay && s.anniversaryText.trim()) {
        recipients.push({
          chatId: contactChatId(c),
          name: c.name,
          kind: 'anniversary',
          periodKey: year,
          text: s.anniversaryText,
        });
      }
    }

    if (s.winbackDays > 0 && s.winbackText.trim()) {
      const quietSince = new Date(now.getTime() - s.winbackDays * 86_400_000);
      const oldest = new Date(quietSince.getTime() - WINBACK_WINDOW_DAYS * 86_400_000);
      const quiet = await this.conversations
        .createQueryBuilder('c')
        .where('c.businessId = :businessId AND c.sessionId = :sessionId', {
          businessId: s.businessId,
          sessionId: s.sessionId,
        })
        .andWhere('c.lastMessageAt < :quietSince AND c.lastMessageAt > :oldest', { quietSince, oldest })
        .andWhere(notDndSql('c'))
        .orderBy('c.lastMessageAt', 'DESC')
        .take(s.dailySendCap * 2)
        .getMany();
      for (const c of quiet) {
        if (!isReachablePersonalChat(c.chatId) || !c.lastMessageAt) continue;
        // Keyed to the last message, so the same silence gets one nudge; a new conversation earns another later.
        const periodKey = new Date(c.lastMessageAt).toISOString().slice(0, 10);
        recipients.push({ chatId: c.chatId, name: c.chatName, kind: 'winback', periodKey, text: s.winbackText });
      }
    }

    const { start, end } = localDayBounds(s.timezone, now);
    let sentToday = await this.greetingLog.count({
      where: { businessId: s.businessId, status: 'sent', createdAt: Between(start, end) },
    });
    const result = { sent: 0, skipped: 0, failed: 0 };
    for (const r of recipients) {
      if (sentToday >= s.dailySendCap) break;
      const already = await this.greetingLog.exists({
        where: { businessId: s.businessId, chatId: r.chatId, kind: r.kind, periodKey: r.periodKey },
      });
      if (already) continue;
      const optedOut = await this.campaigns.isOptedOut(s.businessId, s.sessionId, r.chatId);
      // The log row is written before the send: its unique key is the claim, so a crash never double-sends.
      const log = await this.greetingLog
        .save(
          this.greetingLog.create({
            businessId: s.businessId,
            chatId: r.chatId,
            name: r.name,
            kind: r.kind,
            periodKey: r.periodKey,
            status: optedOut ? 'skipped' : 'sent',
            error: optedOut ? 'Opted out' : null,
          }),
        )
        .catch(() => null);
      if (!log) continue;
      if (optedOut) {
        result.skipped++;
        continue;
      }
      try {
        await this.messageService.sendText(s.sessionId, { chatId: r.chatId, text: fillName(r.text, r.name) });
        result.sent++;
        sentToday++;
      } catch (err) {
        result.failed++;
        await this.greetingLog.update(log.id, { status: 'failed', error: errMsg(err).slice(0, 1000) });
      }
      await sleep(SEND_GAP_MS);
    }
    return result;
  }

  // ── Daily summary ──

  async buildFacts(s: GrowthSettings, now = new Date()): Promise<SummaryFacts> {
    const { start, end } = localDayBounds(s.timezone, now);
    const today = Between(start, end);
    const businessId = s.businessId;
    const sessionIds = (await this.sessions.find({ where: { businessId }, select: { id: true } })).map(x => x.id);

    const [newLeads, won, taggedComplaints, lowRatings, messagesIn, messagesOut, hotLeads, waiting] = await Promise.all(
      [
        this.leads.count({ where: { businessId, createdAt: today } }),
        this.deals.find({ where: { businessId, stage: DealStage.WON, updatedAt: today }, select: { amount: true } }),
        this.conversations
          .createQueryBuilder('c')
          .where('c.businessId = :businessId', { businessId })
          .andWhere('c.tags LIKE :tag', { tag: '%"complaint"%' })
          .andWhere('c.updatedAt >= :start AND c.updatedAt < :end', { start, end })
          .getCount(),
        this.feedback.count({ where: { businessId, rating: LessThanOrEqual(2), createdAt: today } }),
        sessionIds.length
          ? this.messages.count({
              where: { sessionId: In(sessionIds), direction: MessageDirection.INCOMING, createdAt: today },
            })
          : 0,
        sessionIds.length
          ? this.messages.count({
              where: { sessionId: In(sessionIds), direction: MessageDirection.OUTGOING, createdAt: today },
            })
          : 0,
        this.leads.find({
          where: {
            businessId,
            status: In([LeadStatus.NEW, LeadStatus.QUALIFIED, LeadStatus.ASSIGNED, LeadStatus.UNASSIGNED]),
            temperature: In([LeadTemperature.HOT, LeadTemperature.WARM]),
            createdAt: MoreThan(new Date(now.getTime() - 14 * 86_400_000)),
          },
          order: { updatedAt: 'ASC' },
          take: 4,
        }),
        this.conversations.find({
          where: { businessId, status: ConversationStatus.PENDING, lastInboundAt: LessThan(now) },
          order: { lastInboundAt: 'ASC' },
          take: 4,
        }),
      ],
    );

    const followUps = [
      ...hotLeads.map(l => ({
        name: l.customerName || l.customerPhone,
        reason: `${l.temperature} lead, not contacted yet`,
      })),
      ...waiting.map(c => ({ name: c.chatName || c.chatId.replace(/@.*$/, ''), reason: 'waiting for a reply' })),
    ].slice(0, 4);

    return {
      date: localDay(s.timezone, now).date,
      newLeads,
      dealsWon: won.length,
      wonAmount: won.reduce((n, d) => n + Number(d.amount || 0), 0),
      complaints: taggedComplaints + lowRatings,
      messagesIn,
      messagesOut,
      followUps,
    };
  }

  /** The owner-facing text: AI-written from the numbers, or the plain template if the AI is unavailable. */
  async composeSummary(
    s: GrowthSettings,
    now = new Date(),
  ): Promise<{ text: string; facts: SummaryFacts; ai: boolean }> {
    const facts = await this.buildFacts(s, now);
    const fallback = formatSummaryFallback(facts);
    try {
      const { content } = await this.ai.complete(
        [
          {
            role: 'system',
            content: [
              "You write a business owner's end-of-day WhatsApp summary from the numbers given.",
              'At most 90 words. Start with one line on how the day went, then the key numbers, then who to follow up tomorrow.',
              'Use only the given numbers and names; never invent any. WhatsApp *bold* sparingly, at most 2 emojis.',
              UNTRUSTED_RULE,
            ].join('\n'),
          },
          { role: 'user', content: fence(JSON.stringify(facts), 'day-facts') },
        ],
        { maxTokens: 500, temperature: 0.4, reasoningEffort: 'low' },
      );
      return { text: content.trim().slice(0, 3000), facts, ai: true };
    } catch (err) {
      this.logger.warn(`Summary AI unavailable, sending plain summary: ${errMsg(err)}`);
      return { text: fallback, facts, ai: false };
    }
  }

  async sendSummary(s: GrowthSettings, now = new Date()): Promise<{ text: string }> {
    if (!s.sessionId || !s.ownerPhone) throw new BadRequestException('Pick the sending number and owner phone first');
    const { text } = await this.composeSummary(s, now);
    await this.messageService.sendText(s.sessionId, { chatId: `${s.ownerPhone}@c.us`, text });
    return { text };
  }
}
