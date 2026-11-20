import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Like, MoreThanOrEqual, Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { WhatsAppEvent } from './entities/whatsapp-event.entity';

export type EventLevel = 'info' | 'success' | 'warning' | 'error';

export interface NewEvent {
  sessionId?: string | null;
  kind: string;
  level?: EventLevel;
  waMessageId?: string | null;
  phone?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
}

const KEEP_DAYS = 7;
const CLEAN_EVERY = 200;
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/**
 * Turns one Meta webhook body into log lines: each status (sent/delivered/read/failed with price and
 * error), each incoming message, and other fields such as template approvals. `phoneNumberId` tells
 * which of our numbers it is for.
 */
export function describeWebhook(body: Record<string, unknown>): Array<NewEvent & { phoneNumberId?: string }> {
  const out: Array<NewEvent & { phoneNumberId?: string }> = [];
  const entries = Array.isArray(body.entry) ? (body.entry as Array<Record<string, unknown>>) : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? (entry.changes as Array<Record<string, unknown>>) : [];
    for (const change of changes) {
      const field = str(change.field);
      const value = (change.value ?? {}) as Record<string, unknown>;
      const phoneNumberId = str((value.metadata as Record<string, unknown> | undefined)?.phone_number_id) || undefined;

      if (field !== 'messages') {
        const event = str(value.event) || str(value.status);
        const name = str(value.message_template_name) || str(value.name);
        out.push({
          kind: `webhook.${field}`.slice(0, 40),
          level: /REJECT|DISABLE|PAUSE|FLAG/i.test(event) ? 'warning' : 'info',
          summary: `Meta: ${field}${event ? ` → ${event}` : ''}${name ? ` (${name})` : ''}`.slice(0, 300),
          details: { field, value },
          phoneNumberId,
        });
        continue;
      }

      for (const st of (Array.isArray(value.statuses) ? value.statuses : []) as Array<Record<string, unknown>>) {
        const status = str(st.status);
        const errors = Array.isArray(st.errors) ? (st.errors as Array<Record<string, unknown>>) : [];
        const err = errors[0];
        const pricing = st.pricing as Record<string, unknown> | undefined;
        const code = err ? str(err.code) : '';
        const reason = err
          ? [str(err.title) || str(err.message), str((err.error_data as Record<string, unknown> | undefined)?.details)]
              .filter(Boolean)
              .join(' — ')
          : '';
        out.push({
          kind: `status.${status || 'unknown'}`.slice(0, 40),
          level: status === 'failed' ? 'error' : status === 'delivered' || status === 'read' ? 'success' : 'info',
          waMessageId: str(st.id) || null,
          phone: str(st.recipient_id) || null,
          summary: (status === 'failed'
            ? `Failed for ${str(st.recipient_id)}: ${code ? `(${code}) ` : ''}${reason || 'no reason given'}`
            : `${status[0]?.toUpperCase() ?? ''}${status.slice(1)} — ${str(st.recipient_id)}${
                pricing ? ` · ${str(pricing.category)} · ${pricing.billable === false ? 'free' : 'billable'}` : ''
              }`
          ).slice(0, 300),
          details: { status, timestamp: st.timestamp, pricing, conversation: st.conversation, errors },
          phoneNumberId,
        });
      }

      for (const msg of (Array.isArray(value.messages) ? value.messages : []) as Array<Record<string, unknown>>) {
        const type = str(msg.type);
        const text =
          str((msg.text as Record<string, unknown> | undefined)?.body) ||
          str((msg.button as Record<string, unknown> | undefined)?.text) ||
          str(
            (
              (msg.interactive as Record<string, unknown> | undefined)?.button_reply as
                Record<string, unknown> | undefined
            )?.title,
          );
        out.push({
          kind: 'message.incoming',
          level: 'info',
          waMessageId: str(msg.id) || null,
          phone: str(msg.from) || null,
          summary: `Incoming ${type} from ${str(msg.from)}${text ? `: “${text.slice(0, 80)}”` : ''}`.slice(0, 300),
          details: { type, timestamp: msg.timestamp, context: msg.context },
          phoneNumberId,
        });
      }

      for (const e of (Array.isArray(value.errors) ? value.errors : []) as Array<Record<string, unknown>>) {
        out.push({
          kind: 'webhook.error',
          level: 'error',
          summary: `Meta reported an error: (${str(e.code)}) ${str(e.title) || str(e.message)}`.slice(0, 300),
          details: { error: e },
          phoneNumberId,
        });
      }
    }
  }
  return out;
}

/** Stores message/webhook log lines and reads them back. Writing never throws into the caller. */
@Injectable()
export class WhatsAppLogsService {
  private readonly logger = createLogger('WhatsAppLogsService');
  private writes = 0;

  constructor(@InjectRepository(WhatsAppEvent, 'data') private readonly events: Repository<WhatsAppEvent>) {}

  record(event: NewEvent): void {
    void this.events
      .save(
        this.events.create({
          sessionId: event.sessionId ?? null,
          kind: event.kind.slice(0, 40),
          level: event.level ?? 'info',
          waMessageId: event.waMessageId ?? null,
          phone: event.phone?.slice(0, 32) ?? null,
          summary: event.summary.slice(0, 300),
          details: event.details ?? null,
        }),
      )
      .then(() => {
        if (++this.writes % CLEAN_EVERY === 0) return this.cleanup();
      })
      .catch(err => this.logger.warn(`Could not store log event ${event.kind}: ${String(err)}`));
  }

  async cleanup(): Promise<void> {
    await this.events.delete({ createdAt: LessThan(new Date(Date.now() - KEEP_DAYS * 86_400_000)) });
  }

  async list(opts: {
    sessionIds: string[];
    includeGlobal: boolean;
    level?: string;
    kind?: string;
    search?: string;
    sinceMinutes?: number;
    limit?: number;
  }) {
    const since = new Date(Date.now() - (opts.sinceMinutes ?? KEEP_DAYS * 1440) * 60_000);
    const base = {
      createdAt: MoreThanOrEqual(since),
      ...(opts.level ? { level: opts.level } : {}),
      ...(opts.kind ? { kind: Like(`${opts.kind}%`) } : {}),
    };
    // A search is a message id or a phone number; both are exact enough to match with LIKE.
    const search = opts.search?.replace(/[%_]/g, '').trim();
    const scopes = [
      ...(opts.sessionIds.length ? [{ sessionId: In(opts.sessionIds) }] : []),
      ...(opts.includeGlobal ? [{ sessionId: IsNull() }] : []),
    ];
    if (!scopes.length) return [];
    const where = scopes.flatMap(scope =>
      search
        ? [
            { ...base, ...scope, waMessageId: Like(`%${search}%`) },
            { ...base, ...scope, phone: Like(`%${search.replace(/\D/g, '') || search}%`) },
          ]
        : [{ ...base, ...scope }],
    );
    return this.events.find({ where, order: { createdAt: 'DESC' }, take: Math.min(opts.limit ?? 200, 1000) });
  }

  /** When Meta last reached us at all, and with a status, for the health check. */
  async lastSeen(sessionIds: string[]) {
    const lastWebhook = await this.events.findOne({
      where: [{ kind: Like('status.%') }, { kind: Like('message.%') }, { kind: Like('webhook.%') }],
      order: { createdAt: 'DESC' },
    });
    const lastStatus = sessionIds.length
      ? await this.events.findOne({
          where: { sessionId: In(sessionIds), kind: Like('status.%') },
          order: { createdAt: 'DESC' },
        })
      : null;
    const dayAgo = new Date(Date.now() - 86_400_000);
    const rejected = await this.events.count({
      where: { kind: 'webhook.rejected', createdAt: MoreThanOrEqual(dayAgo) },
    });
    const unmatched = await this.events.count({
      where: { kind: 'webhook.unmatched', createdAt: MoreThanOrEqual(dayAgo) },
    });
    const lastUnmatched = unmatched
      ? await this.events.findOne({ where: { kind: 'webhook.unmatched' }, order: { createdAt: 'DESC' } })
      : null;
    return {
      lastWebhookAt: lastWebhook?.createdAt ?? null,
      lastStatusAt: lastStatus?.createdAt ?? null,
      rejected24h: rejected,
      unmatched24h: unmatched,
      lastUnmatched,
    };
  }
}
