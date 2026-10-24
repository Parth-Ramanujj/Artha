import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { HookManager } from '../../core/hooks';
import type { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { isFreshPersonalMessage, LEAD_MAX_MESSAGE_AGE_MS } from '../workflow/inbound-message-filter';
import {
  OutboxStatus,
  ProspectStatus,
  SalesActivity,
  SalesAgentConfig,
  SalesChannelName,
  SalesCompany,
  SalesConversation,
  SalesOutboxItem,
  SalesProspect,
} from './entities/sales-agent.entity';
import { SALES_CHANNELS, SalesChannel } from './channels/sales-channel';
import { SalesDiscoveryService } from './discovery.service';
import { SalesWriterService } from './writer.service';
import { HELD_PREFIX, SalesSenderService } from './sender.service';
import { SalesReplyHandlerService } from './reply-handler.service';
import { digitsOnly, inQuietHours, normalizePhone } from './sales-rules';
import type { DiscoverDto, ProspectInputDto, UpdateSalesAgentConfigDto } from './dto/sales-agent.dto';

const TICK_MS = 60_000;
const WRITES_PER_CYCLE = 5;
const PROFILES_PER_CYCLE = 10;

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};
const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map(x => str(x, 200))
    .filter(Boolean)
    .slice(0, 50);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function defaultConfig(businessId: string): Partial<SalesAgentConfig> {
  return {
    businessId,
    enabled: false,
    requireApproval: true,
    sendingPaused: false,
    persona: { name: '', company: '', role: '', tone: 'friendly, direct', website: '' },
    product: {
      name: '',
      description: '',
      pricing: '',
      benefits: [],
      goal: 'book a 15 minute call',
      bookingUrl: '',
      objectionResponses: {},
    },
    icp: { industries: [], titles: [], geography: [] },
    whatsapp: {
      enabled: true,
      sessionId: '',
      maxDailySends: 20,
      optOutLine: 'Reply STOP if you would rather not hear from us.',
      defaultCountryCode: '91',
    },
    email: {
      enabled: false,
      integrationId: '',
      imapHost: '',
      imapPort: 993,
      maxDailySends: 30,
      optOutLine: 'Not interested? Reply "no thanks" and I won\'t email again.',
      postalAddress: '',
    },
    schedule: {
      heartbeatMinutes: 15,
      quietStart: '21:00',
      quietEnd: '09:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    lastCycleAt: null,
  };
}

/**
 * Orchestrates the sales agent: the heartbeat (profile → write → send), inbound replies from every
 * channel, and the dashboard's reads and actions. Channels are injected, so a channel missing from
 * the build (email off) simply never appears here.
 */
@Injectable()
export class SalesAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalesAgentService.name);
  private timer?: NodeJS.Timeout;
  private hookId?: string;
  private readonly running = new Set<string>();

  constructor(
    @Inject(SALES_CHANNELS) private readonly channels: SalesChannel[],
    private readonly hookManager: HookManager,
    private readonly discovery: SalesDiscoveryService,
    private readonly writer: SalesWriterService,
    private readonly sender: SalesSenderService,
    private readonly handler: SalesReplyHandlerService,
    @InjectRepository(SalesAgentConfig, 'data') private readonly configs: Repository<SalesAgentConfig>,
    @InjectRepository(SalesCompany, 'data') private readonly companies: Repository<SalesCompany>,
    @InjectRepository(SalesProspect, 'data') private readonly prospects: Repository<SalesProspect>,
    @InjectRepository(SalesOutboxItem, 'data') private readonly outbox: Repository<SalesOutboxItem>,
    @InjectRepository(SalesConversation, 'data') private readonly conversations: Repository<SalesConversation>,
    @InjectRepository(SalesActivity, 'data') private readonly activity: Repository<SalesActivity>,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    // Before the workflow trigger (900): replies are recorded and sequences stopped first.
    this.hookId = this.hookManager.register(
      'sales-agent-replies',
      'message:received',
      ctx => {
        const msg = ctx.data as IncomingMessage;
        if (ctx.sessionId && isFreshPersonalMessage(msg, LEAD_MAX_MESSAGE_AGE_MS) && msg.body?.trim()) {
          void this.onWhatsAppMessage(ctx.sessionId, msg).catch(err =>
            this.logger.warn(`Sales reply handling failed: ${err instanceof Error ? err.message : String(err)}`),
          );
        }
        return Promise.resolve({ continue: true });
      },
      850,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.hookId) this.hookManager.unregister(this.hookId);
  }

  availableChannels(): SalesChannelName[] {
    return this.channels.map(c => c.name);
  }

  private channel(name: SalesChannelName | null): SalesChannel | undefined {
    return this.channels.find(c => c.name === name);
  }

  // ---------------------------------------------------------------- heartbeat

  async tick(now = new Date()): Promise<void> {
    const due = (await this.configs.find({ where: { enabled: true } })).filter(
      c => !c.lastCycleAt || now.getTime() - c.lastCycleAt.getTime() >= c.schedule.heartbeatMinutes * 60_000,
    );
    for (const config of due) {
      await this.runCycle(config, now).catch(err =>
        this.logger.error(
          `Sales cycle failed for ${config.businessId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  /** One heartbeat: read replies, then (outside quiet hours) profile, write and send. */
  async runCycle(config: SalesAgentConfig, now = new Date()) {
    if (this.running.has(config.businessId)) return { skipped: 'already running' };
    this.running.add(config.businessId);
    const summary = { replies: 0, profiled: 0, written: 0, sent: 0, quiet: false };
    try {
      summary.replies = await this.pollReplies(config, now);
      if (inQuietHours(config.schedule, now)) {
        summary.quiet = true;
      } else {
        summary.profiled = await this.discovery.profilePending(
          config.businessId,
          config.whatsapp.defaultCountryCode || '91',
          PROFILES_PER_CYCLE,
        );
        summary.written = await this.writePending(config);
        summary.sent = await this.sender.drain(config, this.channels, now);
      }
      await this.configs.update(config.id, { lastCycleAt: now });
      // Quiet cycles are not logged, so the activity feed only shows work.
      if (summary.replies + summary.profiled + summary.written + summary.sent > 0) {
        await this.log(config.businessId, 'cycle', summary);
      }
      return summary;
    } finally {
      this.running.delete(config.businessId);
    }
  }

  private async writePending(config: SalesAgentConfig): Promise<number> {
    const ready = this.channels.filter(c => c.isReady(config));
    if (!ready.length) return 0;
    const candidates = await this.prospects.find({
      where: { businessId: config.businessId, status: 'new' },
      order: { createdAt: 'ASC' },
      take: WRITES_PER_CYCLE * 4,
    });
    let written = 0;
    for (const prospect of candidates) {
      if (written >= WRITES_PER_CYCLE) break;
      // Order of `channels` is the preference: WhatsApp first, then email.
      const channel = ready.find(c => c.recipientFor(prospect));
      if (channel && (await this.writer.write(config, prospect, channel.name))) written++;
    }
    return written;
  }

  private async pollReplies(config: SalesAgentConfig, now: Date): Promise<number> {
    let handled = 0;
    for (const channel of this.channels) {
      if (!channel.pollReplies || !channel.isReady(config)) continue;
      const since = new Date((config.lastCycleAt ?? new Date(now.getTime() - 2 * 86_400_000)).getTime() - 3_600_000);
      const byEmail = new Map<string, SalesProspect>();
      try {
        const replies = await channel.pollReplies(config, since, async from => {
          const p = await this.prospects.findOne({ where: { businessId: config.businessId, email: from } });
          if (p && p.channel === channel.name) byEmail.set(from, p);
          return !!p && p.channel === channel.name;
        });
        for (const reply of replies) {
          const prospect = byEmail.get(reply.from);
          if (!prospect) continue;
          const outcome = await this.handler.handle(config, prospect, channel.name, reply);
          if (outcome !== 'duplicate') handled++;
        }
      } catch (err) {
        this.logger.warn(`Reading ${channel.name} replies failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return handled;
  }

  private async onWhatsAppMessage(sessionId: string, msg: IncomingMessage): Promise<void> {
    const configs = (await this.configs.find()).filter(c => c.whatsapp?.sessionId === sessionId);
    if (!configs.length) return;
    const phone = msg.chatId.endsWith('@c.us') ? digitsOnly(msg.chatId) : digitsOnly(msg.senderPhone ?? '');
    if (!phone) return;
    const whatsapp = this.channel('whatsapp');
    for (const config of configs) {
      const prospect = await this.prospects.findOne({ where: { businessId: config.businessId, phone } });
      if (!prospect || (prospect.channel && prospect.channel !== 'whatsapp')) continue;
      await this.handler.handle(config, prospect, 'whatsapp', { from: phone, text: msg.body, ref: msg.id }, () =>
        whatsapp?.onOptOut ? whatsapp.onOptOut(config, msg.chatId) : Promise.resolve(),
      );
    }
  }

  // ---------------------------------------------------------------- config

  async getConfig(businessId: string): Promise<SalesAgentConfig> {
    const existing = await this.configs.findOne({ where: { businessId } });
    if (existing) return existing;
    return this.configs.save(this.configs.create(defaultConfig(businessId)));
  }

  async updateConfig(businessId: string, dto: UpdateSalesAgentConfigDto): Promise<SalesAgentConfig> {
    const config = await this.getConfig(businessId);
    if (dto.requireApproval === false && config.requireApproval && dto.confirm !== 'autopilot') {
      throw new BadRequestException('Type "autopilot" to confirm sending without approval');
    }
    const wasApproval = config.requireApproval;
    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.requireApproval !== undefined) config.requireApproval = dto.requireApproval;
    if (dto.sendingPaused !== undefined) config.sendingPaused = dto.sendingPaused;

    const p = { ...config.persona, ...dto.persona };
    config.persona = {
      name: str(p.name, 100),
      company: str(p.company, 100),
      role: str(p.role, 100),
      tone: str(p.tone, 100),
      website: str(p.website, 200),
    };
    const pr = { ...config.product, ...dto.product };
    const objections: Record<string, unknown> =
      pr.objectionResponses && typeof pr.objectionResponses === 'object' ? pr.objectionResponses : {};
    config.product = {
      name: str(pr.name, 200),
      description: str(pr.description, 2000),
      pricing: str(pr.pricing, 500),
      benefits: list(pr.benefits),
      goal: str(pr.goal, 200),
      bookingUrl: str(pr.bookingUrl, 300),
      objectionResponses: Object.fromEntries(
        Object.entries(objections)
          .map(([k, v]): [string, string] => [str(k, 100), str(v, 1000)])
          .filter(([k, v]) => k && v)
          .slice(0, 30),
      ),
    };
    const icp = { ...config.icp, ...dto.icp };
    config.icp = { industries: list(icp.industries), titles: list(icp.titles), geography: list(icp.geography) };
    const wa = { ...config.whatsapp, ...dto.whatsapp };
    config.whatsapp = {
      enabled: bool(wa.enabled, true),
      sessionId: str(wa.sessionId, 64),
      maxDailySends: num(wa.maxDailySends, 0, 500, 20),
      optOutLine: str(wa.optOutLine, 200),
      defaultCountryCode: digitsOnly(str(wa.defaultCountryCode, 4)),
    };
    const em = { ...config.email, ...dto.email };
    config.email = {
      enabled: bool(em.enabled, false),
      integrationId: str(em.integrationId, 36),
      imapHost: str(em.imapHost, 200),
      imapPort: num(em.imapPort, 1, 65535, 993),
      maxDailySends: num(em.maxDailySends, 0, 500, 30),
      optOutLine: str(em.optOutLine, 300),
      postalAddress: str(em.postalAddress, 300),
    };
    const s = { ...config.schedule, ...dto.schedule };
    const hhmm = (v: unknown, fallback: string) => (/^\d{1,2}:\d{2}$/.test(str(v, 5)) ? str(v, 5) : fallback);
    config.schedule = {
      heartbeatMinutes: num(s.heartbeatMinutes, 5, 1440, 15),
      quietStart: hhmm(s.quietStart, '21:00'),
      quietEnd: hhmm(s.quietEnd, '09:00'),
      timezone: str(s.timezone, 64) || 'UTC',
    };

    const saved = await this.configs.save(config);
    if (!wasApproval && saved.requireApproval) {
      // Back to approval mode: anything autopilot cleared but hasn't sent waits for a person again.
      await this.outbox.update(
        { businessId, status: 'approved', approvedBy: Not('you') },
        { status: 'pending_review', error: 'approval mode was turned back on' },
      );
    }
    return saved;
  }

  async runNow(businessId: string) {
    return this.runCycle(await this.getConfig(businessId));
  }

  // ---------------------------------------------------------------- dashboard reads

  async overview(businessId: string) {
    const config = await this.getConfig(businessId);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const countBy = async <T extends string>(repo: Repository<{ status: T }>, statuses: readonly T[]) =>
      Object.fromEntries(
        await Promise.all(
          statuses.map(async s => [s, await repo.count({ where: { businessId, status: s } as never })] as const),
        ),
      );
    const sentToday = Object.fromEntries(
      await Promise.all(
        this.channels.map(
          async c =>
            [
              c.name,
              await this.outbox.count({
                where: { businessId, channel: c.name, status: 'sent', sentAt: MoreThanOrEqual(dayStart) },
              }),
            ] as const,
        ),
      ),
    );
    return {
      enabled: config.enabled,
      requireApproval: config.requireApproval,
      sendingPaused: config.sendingPaused,
      lastCycleAt: config.lastCycleAt,
      quietNow: inQuietHours(config.schedule),
      channels: this.channels.map(c => ({ name: c.name, ready: c.isReady(config), dailyCap: c.dailyCap(config) })),
      sentToday,
      companies: await this.companies.count({ where: { businessId } }),
      prospects: await countBy(
        this.prospects as unknown as Repository<{ status: ProspectStatus }>,
        ['new', 'queued', 'contacted', 'replied', 'lost', 'opted_out', 'write_failed'] as const,
      ),
      outbox: await countBy(
        this.outbox as unknown as Repository<{ status: OutboxStatus }>,
        ['pending_review', 'approved', 'sent', 'failed'] as const,
      ),
      needsHuman: await this.conversations.count({ where: { businessId, status: 'needs_human' } }),
    };
  }

  listCompanies(businessId: string) {
    return this.companies.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 500 });
  }

  listProspects(businessId: string, status?: string) {
    return this.prospects.find({
      where: status ? { businessId, status: status as ProspectStatus } : { businessId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async listOutbox(businessId: string, status?: string) {
    const rows = await this.outbox.find({
      where: status ? { businessId, status: status as OutboxStatus } : { businessId },
      order: { sendAt: 'ASC' },
      take: 500,
    });
    return this.withProspects(businessId, rows);
  }

  async listConversations(businessId: string) {
    const rows = await this.conversations.find({ where: { businessId }, order: { updatedAt: 'DESC' }, take: 200 });
    return this.withProspects(businessId, rows);
  }

  listActivity(businessId: string) {
    return this.activity.find({ where: { businessId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  private async withProspects<T extends { prospectId: string }>(businessId: string, rows: T[]) {
    const ids = [...new Set(rows.map(r => r.prospectId))];
    const prospects = ids.length ? await this.prospects.find({ where: { businessId, id: In(ids) } }) : [];
    const byId = new Map(prospects.map(p => [p.id, p]));
    return rows.map(r => {
      const p = byId.get(r.prospectId);
      return {
        ...r,
        prospect: p
          ? { name: p.name, companyName: p.companyName, phone: p.phone, email: p.email, status: p.status }
          : null,
      };
    });
  }

  // ---------------------------------------------------------------- dashboard actions

  async discover(businessId: string, dto: DiscoverDto) {
    const config = await this.getConfig(businessId);
    return this.discovery.discover(businessId, {
      ...dto,
      // Without a place in the query, the first target place from settings is used.
      location: dto.location || config.icp.geography[0],
      countryCode: config.whatsapp.defaultCountryCode || '91',
    });
  }

  async addProspects(businessId: string, input: ProspectInputDto[]) {
    const config = await this.getConfig(businessId);
    let added = 0;
    let skipped = 0;
    for (const p of input) {
      const phone = normalizePhone(p.phone ?? '', config.whatsapp.defaultCountryCode || '91').slice(0, 20);
      const email = (p.email ?? '').trim().toLowerCase();
      const dupe =
        (phone && (await this.prospects.findOne({ where: { businessId, phone } }))) ||
        (email && (await this.prospects.findOne({ where: { businessId, email } })));
      if ((!phone && !email) || dupe) {
        skipped++;
        continue;
      }
      await this.prospects.save(
        this.prospects.create({
          businessId,
          name: p.name?.trim() ?? '',
          companyName: p.companyName?.trim() ?? '',
          title: p.title?.trim() ?? '',
          phone,
          email,
          notes: p.notes?.trim() ?? '',
          source: 'manual',
          status: 'new',
        }),
      );
      added++;
    }
    return { added, skipped };
  }

  async removeProspect(businessId: string, id: string) {
    const prospect = await this.prospects.findOne({ where: { businessId, id } });
    if (!prospect) throw new NotFoundException('Prospect not found');
    await this.outbox.delete({ businessId, prospectId: id, status: In(['pending_review', 'approved']) });
    await this.prospects.remove(prospect);
  }

  private async pendingRow(businessId: string, id: string) {
    const row = await this.outbox.findOne({ where: { businessId, id } });
    if (!row) throw new NotFoundException('Outbox message not found');
    if (row.status !== 'pending_review') throw new BadRequestException(`This message is ${row.status}`);
    return row;
  }

  async approve(businessId: string, id: string) {
    const row = await this.pendingRow(businessId, id);
    await this.outbox.update(row.id, { status: 'approved', approvedBy: 'you', error: '' });
    return { approved: 1 };
  }

  /** Approves every pending message except those autopilot held: each of those needs its own look. */
  async approveAll(businessId: string) {
    const rows = await this.outbox.find({ where: { businessId, status: 'pending_review' } });
    const toApprove = rows.filter(r => !r.error.startsWith(HELD_PREFIX));
    if (toApprove.length) {
      await this.outbox.update(
        { id: In(toApprove.map(r => r.id)) },
        { status: 'approved', approvedBy: 'you', error: '' },
      );
    }
    return { approved: toApprove.length, held: rows.length - toApprove.length };
  }

  async reject(businessId: string, id: string) {
    const row = await this.pendingRow(businessId, id);
    await this.outbox.update(row.id, { status: 'rejected' });
    // A rejected first message means the prospect gets nothing from this sequence.
    if (row.kind === 'sequence') {
      await this.outbox.update(
        { prospectId: row.prospectId, kind: 'sequence', status: In(['pending_review', 'approved']) },
        { status: 'cancelled', error: 'an earlier step was rejected' },
      );
    }
    return { rejected: 1 };
  }

  async edit(businessId: string, id: string, input: { subject?: string; body: string }) {
    const row = await this.pendingRow(businessId, id);
    await this.outbox.update(row.id, { body: input.body.trim(), subject: input.subject?.trim() ?? row.subject });
    return this.outbox.findOne({ where: { id: row.id } });
  }

  async setConversationStatus(businessId: string, id: string, status: 'open' | 'needs_human' | 'closed') {
    const conv = await this.conversations.findOne({ where: { businessId, id } });
    if (!conv) throw new NotFoundException('Conversation not found');
    conv.status = status;
    return this.conversations.save(conv);
  }

  private async log(businessId: string, type: string, details: Record<string, unknown>) {
    await this.activity.save(this.activity.create({ businessId, type, details }));
  }
}
