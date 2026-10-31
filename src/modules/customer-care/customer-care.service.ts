import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { HookManager } from '../../core/hooks';
import { EngineRegistry } from '../../engine/engine-registry.service';
import type { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { MessageService } from '../message/message.service';
import { AiCallingService } from '../ai-calling/ai-calling.service';
import { chatIdFor, toE164 } from '../ai-calling/contacts';
import { isFreshPersonalMessage, LEAD_MAX_MESSAGE_AGE_MS } from '../workflow/inbound-message-filter';
import {
  AssistantSettings,
  CustomerCareSetting,
  MissedCall,
  MissedCallSettings,
} from './entities/customer-care.entity';

const TICK_MS = 60_000;
/** One follow-up per number in this window, so a caller who rings five times gets one message. */
const REPEAT_WINDOW_MS = 12 * 60 * 60 * 1000;

export const DEFAULT_MISSED_CALL: MissedCallSettings = {
  enabled: false,
  sessionId: '',
  message:
    'નમસ્તે {name}, {owner} તરફથી. માફ કરશો, અત્યારે તમારો કોલ રિસીવ નથી થઈ શક્યો. તમને શું મદદ જોઈએ છે? અહીં WhatsApp પર જણાવો, અમે તરત જવાબ આપીશું.',
  includeWhatsappCalls: true,
  callOnNoReply: true,
  waitMinutes: 15,
  voiceAgentId: '',
  callGreeting:
    'નમસ્તે {name}, તમે WhatsApp પર જવાબ નથી આપ્યો એટલે હું {owner} વતી કોલ કરું છું. તમે અમને કોલ કર્યો હતો, બોલો હું તમારી શું મદદ કરી શકું?',
};

export const DEFAULT_ASSISTANT: AssistantSettings = {
  enabled: false,
  sessionId: '',
  message:
    'નમસ્તે! તમે અહીં WhatsApp પર વાત ચાલુ રાખી શકો છો, અથવા અમારા AI આસિસ્ટન્ટ સાથે તરત વાત કરવા નીચેની લિંક ખોલો:',
  cooldownHours: 24,
  instructions: '',
  voiceGreeting: 'નમસ્તે {name}, હું {owner} નો AI આસિસ્ટન્ટ બોલું છું. બોલો, હું તમારી શું મદદ કરી શકું?',
};

const str = (v: unknown, max: number, fallback: string) => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Fills {name} and {owner}; an unknown name drops out cleanly. */
export function fillCare(template: string, values: { name?: string | null; owner: string }): string {
  const name = values.name?.trim() ?? '';
  return template
    .replace(/\s*\{name\}/g, name ? ` ${name}` : '')
    .replace(/\{owner\}/g, values.owner)
    .replace(/\s+([,.?!।])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Best-effort E.164 of the person behind an inbound message, resolving a privacy (@lid) id via the engine. */
export async function senderE164(
  engines: EngineRegistry,
  sessionId: string,
  msg: IncomingMessage,
): Promise<string | null> {
  const direct = /^(\d+)@c\.us$/.exec(msg.chatId)?.[1] ?? msg.senderPhone ?? null;
  if (direct) return toE164(direct);
  try {
    const resolved = await engines.get(sessionId)?.resolveContactPhone(msg.chatId);
    return resolved ? toE164(resolved) : null;
  } catch {
    return null;
  }
}

/**
 * Missed-call follow-up: a missed call (reported from a phone's call log, or a WhatsApp call nobody
 * answered) gets a WhatsApp message; if the caller does not reply within the wait, the AI agent calls them.
 */
@Injectable()
export class CustomerCareService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('CustomerCare');
  private timer?: NodeJS.Timeout;
  private hookId?: string;
  /** Businesses with the missed-call follow-up on, so the inbound hook costs nothing otherwise. */
  private activeBusinesses = new Set<string>();
  /** E.164 numbers waiting for a reply; refreshed every tick. */
  private awaitingReply = new Set<string>();

  constructor(
    @InjectRepository(CustomerCareSetting, 'data') private readonly settingsRepo: Repository<CustomerCareSetting>,
    @InjectRepository(MissedCall, 'data') private readonly missedRepo: Repository<MissedCall>,
    @InjectRepository(Session, 'data') private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Message, 'data') private readonly messageRepo: Repository<Message>,
    private readonly hookManager: HookManager,
    private readonly engines: EngineRegistry,
    private readonly messages: MessageService,
    private readonly calling: AiCallingService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.refresh().catch(() => undefined);
    this.hookId = this.hookManager.register(
      'customer-care-missed-calls',
      'message:received',
      ctx => {
        const msg = ctx.data as IncomingMessage;
        if (ctx.sessionId && this.activeBusinesses.size && isFreshPersonalMessage(msg, LEAD_MAX_MESSAGE_AGE_MS)) {
          void this.onInbound(ctx.sessionId, msg).catch(err =>
            this.logger.warn(
              `Missed-call inbound handling failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
        return Promise.resolve({ continue: true });
      },
      860,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.hookId) this.hookManager.unregister(this.hookId);
  }

  // ── settings ──

  async getSettings(businessId: string): Promise<CustomerCareSetting> {
    const row = await this.settingsRepo.findOne({ where: { businessId } });
    if (row) {
      row.missedCall = { ...DEFAULT_MISSED_CALL, ...row.missedCall };
      row.assistant = { ...DEFAULT_ASSISTANT, ...row.assistant };
      return row;
    }
    return this.settingsRepo.create({
      businessId,
      ownerName: '',
      missedCall: { ...DEFAULT_MISSED_CALL },
      assistant: { ...DEFAULT_ASSISTANT },
    });
  }

  async updateSettings(
    businessId: string,
    input: { ownerName?: unknown; missedCall?: Record<string, unknown>; assistant?: Record<string, unknown> },
  ): Promise<CustomerCareSetting> {
    const row = await this.getSettings(businessId);
    const m = input.missedCall ?? {};
    const a = input.assistant ?? {};
    row.ownerName = str(input.ownerName, 120, row.ownerName);
    row.missedCall = {
      enabled: bool(m.enabled, row.missedCall.enabled),
      sessionId: str(m.sessionId, 36, row.missedCall.sessionId),
      message: str(m.message, 1000, row.missedCall.message) || DEFAULT_MISSED_CALL.message,
      includeWhatsappCalls: bool(m.includeWhatsappCalls, row.missedCall.includeWhatsappCalls),
      callOnNoReply: bool(m.callOnNoReply, row.missedCall.callOnNoReply),
      waitMinutes: num(m.waitMinutes, 1, 24 * 60, row.missedCall.waitMinutes),
      voiceAgentId: str(m.voiceAgentId, 36, row.missedCall.voiceAgentId),
      callGreeting: str(m.callGreeting, 500, row.missedCall.callGreeting) || DEFAULT_MISSED_CALL.callGreeting,
    };
    row.assistant = {
      enabled: bool(a.enabled, row.assistant.enabled),
      sessionId: str(a.sessionId, 36, row.assistant.sessionId),
      message: str(a.message, 1000, row.assistant.message) || DEFAULT_ASSISTANT.message,
      cooldownHours: num(a.cooldownHours, 1, 24 * 30, row.assistant.cooldownHours),
      instructions: str(a.instructions, 3000, row.assistant.instructions),
      voiceGreeting: str(a.voiceGreeting, 500, row.assistant.voiceGreeting) || DEFAULT_ASSISTANT.voiceGreeting,
    };
    const saved = await this.settingsRepo.save(row);
    await this.refresh();
    return saved;
  }

  // ── missed calls ──

  async list(businessId: string, limit = 50): Promise<MissedCall[]> {
    return this.missedRepo.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** A missed call from a phone's call log (Android app / automation) or a WhatsApp call. */
  async report(
    businessId: string,
    input: { phone: string; name?: string | null; source?: string; sessionId?: string | null },
  ): Promise<MissedCall> {
    const phone = toE164(input.phone);
    if (!phone) throw new BadRequestException('Enter a valid mobile number, e.g. 98765 43210');
    const settings = await this.getSettings(businessId);
    const row = this.missedRepo.create({
      businessId,
      phone,
      name: input.name?.trim().slice(0, 120) || null,
      source: input.source === 'whatsapp' ? 'whatsapp' : 'phone',
      status: 'new',
    });
    if (!settings.missedCall.enabled) {
      return this.missedRepo.save({ ...row, status: 'skipped', error: 'Missed-call follow-up is turned off' });
    }
    const recent = await this.missedRepo.findOne({
      where: {
        businessId,
        phone,
        status: In(['messaged', 'replied', 'called']),
        createdAt: MoreThan(new Date(Date.now() - REPEAT_WINDOW_MS)),
      },
    });
    if (recent) return this.missedRepo.save({ ...row, status: 'skipped', error: 'Already followed up recently' });
    if (await this.calling.isDoNotCall(businessId, phone)) {
      return this.missedRepo.save({ ...row, status: 'skipped', error: 'Contact opted out (DND)' });
    }

    const sessionId = await this.sendingSession(businessId, input.sessionId || settings.missedCall.sessionId);
    if (!sessionId) return this.missedRepo.save({ ...row, status: 'failed', error: 'No connected WhatsApp number' });
    const text = fillCare(settings.missedCall.message, { name: row.name, owner: settings.ownerName || 'અમારા' });
    try {
      await this.messages.sendText(sessionId, { chatId: chatIdFor(phone), text });
    } catch (err) {
      return this.missedRepo.save({
        ...row,
        sessionId,
        status: 'failed',
        error: `WhatsApp send failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
      });
    }
    const now = new Date();
    const saved = await this.missedRepo.save({
      ...row,
      sessionId,
      status: 'messaged',
      messagedAt: now,
      callDueAt: settings.missedCall.callOnNoReply
        ? new Date(now.getTime() + settings.missedCall.waitMinutes * 60_000)
        : null,
    });
    if (saved.callDueAt) this.awaitingReply.add(phone);
    return saved;
  }

  /** Every minute: calls whose wait is over and that got no reply go to the AI agent. */
  async tick(now = new Date()): Promise<void> {
    try {
      const due = await this.missedRepo.find({
        where: { status: 'messaged', callDueAt: LessThanOrEqual(now), aiCallId: IsNull() },
        take: 20,
      });
      for (const row of due) {
        await this.callIfNoReply(row).catch(err =>
          this.logger.warn(
            `Missed-call AI call failed for ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
      await this.refresh();
    } catch (err) {
      this.logger.warn(`Missed-call tick failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async callIfNoReply(row: MissedCall): Promise<void> {
    // The hook can miss a reply (restart, @lid chat it could not resolve); the stored messages are the backstop.
    const replied =
      row.sessionId &&
      (await this.messageRepo.exists({
        where: {
          sessionId: row.sessionId,
          chatId: chatIdFor(row.phone),
          direction: MessageDirection.INCOMING,
          createdAt: MoreThan(row.messagedAt ?? row.createdAt),
        },
      }));
    if (replied) {
      await this.missedRepo.update(row.id, { status: 'replied', repliedAt: new Date() });
      return;
    }
    const settings = await this.getSettings(row.businessId);
    if (!settings.missedCall.enabled || !settings.missedCall.callOnNoReply) {
      await this.missedRepo.update(row.id, { callDueAt: null });
      return;
    }
    const owner = settings.ownerName || 'અમારી ટીમ';
    const history = await this.recentChat(row.sessionId, row.phone);
    try {
      const call = await this.calling.queueCall(row.businessId, {
        phone: row.phone,
        name: row.name,
        agentId: settings.missedCall.voiceAgentId || null,
        greeting: fillCare(settings.missedCall.callGreeting, { name: row.name, owner }),
        briefing: [
          `This person called ${owner} and nobody could pick up. We sent them a WhatsApp message${
            row.messagedAt ? ` at ${row.messagedAt.toISOString()}` : ''
          } and they did not reply, so you are now calling them on behalf of ${owner}.`,
          `Find out why they called and solve their problem yourself if you can. If it needs ${owner} personally, take down the details and a good time, and promise that ${owner} will call back.`,
          history ? `Recent WhatsApp chat with them (oldest first):\n${history}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      await this.missedRepo.update(row.id, { status: 'called', aiCallId: call.id });
    } catch (err) {
      await this.missedRepo.update(row.id, {
        status: 'failed',
        error: `AI call not queued: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
      });
    }
  }

  private async recentChat(sessionId: string | null, phone: string): Promise<string> {
    if (!sessionId) return '';
    const rows = await this.messageRepo.find({
      where: { sessionId, chatId: chatIdFor(phone) },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    return rows
      .reverse()
      .filter(m => m.body?.trim())
      .map(m => `${m.direction === MessageDirection.OUTGOING ? 'Us' : 'Them'}: ${m.body.trim().slice(0, 300)}`)
      .join('\n');
  }

  private async onInbound(sessionId: string, msg: IncomingMessage): Promise<void> {
    const isMissedWhatsappCall = msg.type === 'call' && !!msg.call?.missed;
    if (!isMissedWhatsappCall && !this.awaitingReply.size) return;
    const phone = await senderE164(this.engines, sessionId, msg);
    if (!phone) return;

    if (isMissedWhatsappCall) {
      const session = await this.sessionRepo.findOne({
        where: { id: sessionId },
        select: { id: true, businessId: true },
      });
      if (!session?.businessId || !this.activeBusinesses.has(session.businessId)) return;
      const settings = await this.getSettings(session.businessId);
      if (!settings.missedCall.includeWhatsappCalls) return;
      await this.report(session.businessId, {
        phone,
        name: msg.contact?.name ?? null,
        source: 'whatsapp',
        sessionId,
      });
      return;
    }
    if (!this.awaitingReply.has(phone)) return;
    await this.missedRepo.update(
      { phone, sessionId, status: 'messaged' },
      { status: 'replied', repliedAt: new Date() },
    );
    this.awaitingReply.delete(phone);
  }

  private async refresh(): Promise<void> {
    const rows = await this.settingsRepo.find({ select: { businessId: true, missedCall: true } });
    this.activeBusinesses = new Set(rows.filter(r => r.missedCall?.enabled).map(r => r.businessId));
    const waiting = await this.missedRepo.find({
      where: { status: 'messaged', aiCallId: IsNull() },
      select: { id: true, phone: true },
      take: 5000,
    });
    this.awaitingReply = new Set(waiting.map(w => w.phone));
  }

  /** The chosen session when it is this business's and connected, else any connected one. */
  async sendingSession(businessId: string, preferred?: string | null): Promise<string | null> {
    const sessions = await this.sessionRepo.find({
      where: { businessId, status: SessionStatus.READY },
      select: { id: true },
      order: { updatedAt: 'DESC' },
    });
    const live = sessions.filter(s => this.engines.get(s.id));
    return (live.find(s => s.id === preferred) ?? live[0])?.id ?? null;
  }
}
