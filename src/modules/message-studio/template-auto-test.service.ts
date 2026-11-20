import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { createLogger } from '../../common/services/logger.service';
import { scalarToString } from '../../common/utils/scalar-string';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { StudioSetting, TemplateAutoTest } from './entities/studio-setting.entity';

const CHECK_EVERY_MS = 2 * 60 * 1000;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_LAST = 30;

type MetaTemplate = {
  name: string;
  language: string;
  status: string;
  category: string;
  components: Array<Record<string, unknown>>;
  parameterFormat?: string;
};
type AutoTestEngine = {
  listMessageTemplates?: () => Promise<MetaTemplate[]>;
  sendTemplateMessage?: (
    chatId: string,
    name: string,
    lang?: string,
    comps?: Array<Record<string, unknown>>,
  ) => Promise<unknown>;
  sendTextMessage: (chatId: string, text: string) => Promise<unknown>;
};

/** Digits with country code; a bare 10-digit number is taken as Indian. */
export function normalizeTestPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '');
  // shortcut: 10 digits assumed +91 (this deployment is India-first); ask for the country code if that changes.
  const full = digits.length === 10 ? `91${digits}` : digits;
  return /^\d{11,15}$/.test(full) ? full : null;
}

export type AutoTestDecision =
  | { action: 'wait' }
  | { action: 'send_template' | 'send_preview'; note: string }
  | { action: 'done'; state: TemplateAutoTest['state']; note: string };

/**
 * What to do with a waiting test, given Meta's status. Sends only when it is free: a Utility template
 * inside the customer's open 24h window costs nothing; a Marketing template always costs money, so it
 * goes out as a plain copy (normal chat messages in the window are free).
 */
export function decideAutoTest(input: {
  status: string | undefined;
  category: string;
  hasMediaHeader: boolean;
  windowOpen: boolean;
  ageMs: number;
}): AutoTestDecision {
  const status = (input.status ?? '').toUpperCase();
  if (status === 'REJECTED')
    return { action: 'done', state: 'rejected', note: 'Meta rejected the template, so nothing was sent.' };
  if (status !== 'APPROVED') {
    return input.ageMs > GIVE_UP_MS
      ? { action: 'done', state: 'expired', note: 'Still not approved after 7 days; stopped waiting.' }
      : { action: 'wait' };
  }
  if (!input.windowOpen) {
    return {
      action: 'done',
      state: 'not_sent',
      note: 'Approved, but not sent: the test number has not messaged you in the last 24 hours, so it would cost money. Send "hi" from it, then use "Send test now".',
    };
  }
  // Since 1 Oct 2026 Meta charges for every template, Utility included, even inside the 24-hour window.
  return {
    action: 'send_preview',
    note: 'Approved. Sent a free copy as a normal message — Meta charges for every template, even inside the 24-hour window.',
  };
}

type Example = {
  body_text?: string[][];
  body_text_named_params?: Array<{ param_name: string; example: string }>;
  header_text?: string[];
  header_text_named_params?: Array<{ param_name: string; example: string }>;
};
const part = (t: MetaTemplate, type: string) => t.components.find(c => scalarToString(c.type).toUpperCase() === type);

/** Example values Meta approved, keyed by variable ("1", "2" … or a name). */
function examplesOf(component: Record<string, unknown> | undefined, kind: 'body' | 'header'): Array<[string, string]> {
  const ex = (component?.example ?? {}) as Example;
  const named = kind === 'body' ? ex.body_text_named_params : ex.header_text_named_params;
  if (named?.length) return named.map(p => [p.param_name, String(p.example)]);
  const positional = kind === 'body' ? (ex.body_text?.[0] ?? []) : (ex.header_text ?? []);
  return positional.map((v, i) => [String(i + 1), String(v)]);
}

function fillExamples(text: string, examples: Array<[string, string]>): string {
  const map = new Map(examples);
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, key: string) => map.get(key) ?? m);
}

/** Plain-text copy of a template, filled with Meta's example values. */
export function templatePreviewText(t: MetaTemplate): string {
  const header = part(t, 'HEADER');
  const body = part(t, 'BODY');
  const buttons = Array.isArray(part(t, 'BUTTONS')?.buttons)
    ? (part(t, 'BUTTONS')!.buttons as Array<Record<string, unknown>>)
    : [];
  return [
    `🧪 Approved template: ${t.name} (${t.language})`,
    header?.text ? `*${fillExamples(scalarToString(header.text), examplesOf(header, 'header'))}*` : '',
    fillExamples(scalarToString(body?.text), examplesOf(body, 'body')),
    scalarToString(part(t, 'FOOTER')?.text) ? `_${scalarToString(part(t, 'FOOTER')?.text)}_` : '',
    buttons.length ? buttons.map(b => `▫️ ${scalarToString(b.text) || 'Copy code'}`).join('\n') : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Parameters for a real template send (header text + body), taken from the examples Meta approved. */
function exampleComponents(t: MetaTemplate): Array<Record<string, unknown>> | undefined {
  const named = (t.parameterFormat ?? '').toUpperCase() === 'NAMED';
  const params = (examples: Array<[string, string]>) =>
    examples.map(([key, text]) => ({ type: 'text', text, ...(named ? { parameter_name: key } : {}) }));
  const out: Array<Record<string, unknown>> = [];
  const header = examplesOf(part(t, 'HEADER'), 'header');
  if (header.length) out.push({ type: 'header', parameters: params(header) });
  const body = examplesOf(part(t, 'BODY'), 'body');
  if (body.length) out.push({ type: 'body', parameters: params(body) });
  return out.length ? out : undefined;
}

/**
 * Watches templates submitted with a test phone and, when Meta approves one, sends it to that phone —
 * only when it is free. State lives in studio_settings so a restart (e.g. a sleeping free-tier host)
 * picks up where it left off.
 */
@Injectable()
export class TemplateAutoTestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('TemplateAutoTestService');
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @InjectRepository(StudioSetting, 'data') private readonly settings: Repository<StudioSetting>,
    @InjectRepository(Message, 'data') private readonly messages: Repository<Message>,
    private readonly engines: EngineRegistry,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), CHECK_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async watch(businessId: string, sessionId: string, name: string, language: string, phone: string): Promise<void> {
    const row = (await this.settings.findOne({ where: { businessId } })) ?? this.settings.create({ businessId });
    row.testPhone = phone;
    const others = (row.autoTests ?? []).filter(
      t => !(t.sessionId === sessionId && t.name === name && t.language === language),
    );
    row.autoTests = [
      ...others,
      { sessionId, name, language, phone, state: 'waiting' as const, createdAt: new Date().toISOString() },
    ].slice(-KEEP_LAST);
    await this.settings.save(row);
  }

  async list(businessId: string): Promise<{ testPhone: string | null; autoTests: TemplateAutoTest[] }> {
    const row = await this.settings.findOne({ where: { businessId } });
    return { testPhone: row?.testPhone ?? null, autoTests: [...(row?.autoTests ?? [])].reverse() };
  }

  /** "Send test now": re-arm one template so the next check (run right away) tries again. */
  async retry(businessId: string, sessionId: string, name: string, language: string): Promise<TemplateAutoTest | null> {
    const row = await this.settings.findOne({ where: { businessId } });
    const t = row?.autoTests?.find(x => x.sessionId === sessionId && x.name === name && x.language === language);
    if (!row || !t) return null;
    Object.assign(t, { state: 'waiting', note: undefined, doneAt: undefined, createdAt: new Date().toISOString() });
    await this.settings.save(row);
    await this.tick();
    return (
      (await this.settings.findOne({ where: { businessId } }))?.autoTests?.find(
        x => x.sessionId === sessionId && x.name === name && x.language === language,
      ) ?? null
    );
  }

  async windowOpen(sessionId: string, phone: string): Promise<boolean> {
    const count = await this.messages.count({
      where: {
        sessionId,
        chatId: In([`${phone}@c.us`, `${phone}@s.whatsapp.net`]),
        direction: MessageDirection.INCOMING,
        createdAt: MoreThanOrEqual(new Date(Date.now() - WINDOW_MS)),
      },
    });
    return count > 0;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.settings.find();
      for (const row of rows) {
        if (!row.autoTests?.some(t => t.state === 'waiting')) continue;
        await this.processRow(row);
      }
    } catch (err) {
      this.logger.warn(`Template auto-test check failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async processRow(row: StudioSetting): Promise<void> {
    const templatesBySession = new Map<string, MetaTemplate[] | null>();
    let changed = false;
    for (const test of row.autoTests ?? []) {
      if (test.state !== 'waiting') continue;
      const engine = this.engines.get(test.sessionId) as AutoTestEngine | undefined;
      if (!engine?.listMessageTemplates) continue; // number offline: try again next round
      if (!templatesBySession.has(test.sessionId)) {
        templatesBySession.set(test.sessionId, await engine.listMessageTemplates().catch(() => null));
      }
      const tpl = templatesBySession
        .get(test.sessionId)
        ?.find(t => t.name === test.name && t.language === test.language);
      const header = tpl?.components.find(c => scalarToString(c.type).toUpperCase() === 'HEADER');
      const decision = decideAutoTest({
        status: tpl?.status,
        category: tpl?.category ?? '',
        hasMediaHeader:
          Boolean(header && scalarToString(header.format, 'TEXT').toUpperCase() !== 'TEXT') ||
          JSON.stringify(tpl?.components ?? []).includes('"COPY_CODE"'),
        windowOpen:
          tpl?.status?.toUpperCase() === 'APPROVED' ? await this.windowOpen(test.sessionId, test.phone) : false,
        ageMs: Date.now() - new Date(test.createdAt).getTime(),
      });
      if (decision.action === 'wait') continue;
      changed = true;
      test.doneAt = new Date().toISOString();
      if (decision.action === 'done') {
        Object.assign(test, { state: decision.state, note: decision.note });
        continue;
      }
      try {
        const chatId = `${test.phone}@c.us`;
        if (decision.action === 'send_template' && engine.sendTemplateMessage) {
          await engine.sendTemplateMessage(chatId, tpl!.name, tpl!.language, exampleComponents(tpl!));
        } else {
          await engine.sendTextMessage(chatId, templatePreviewText(tpl!));
        }
        Object.assign(test, { state: 'sent', note: decision.note });
      } catch (err) {
        Object.assign(test, {
          state: 'not_sent',
          note: `Could not send: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    if (changed) await this.settings.save(row);
  }
}
