import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { CloudApiAdapter } from '../../engine/adapters/cloud-api.adapter';
import { WhatsAppLogsService } from './whatsapp-logs.service';
import { scalarToString } from '../../common/utils/scalar-string';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessService } from '../business/business.service';
import { Session } from '../session/entities/session.entity';
import { AiConfig, AiProvider } from '../ai/entities/ai-config.entity';

/** How many Groq keys the server has (the assistant's default provider). */
const groqKeyCount = () =>
  ['', '_1', '_2', '_3', '_4', '_5', '_6'].filter(s => process.env[`GROQ_API_KEY${s}`]?.trim()).length;

export interface HealthCheck {
  id: string;
  /** true = fine, false = broken, null = could not tell */
  ok: boolean | null;
  title: string;
  detail: string;
  fix?: string;
  /** A button the dashboard can offer to fix it. */
  action?: 'subscribe_app' | 'enable_ai';
}

const ago = (d: Date | null) => {
  if (!d) return 'never';
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return min < 1
    ? 'just now'
    : min < 60
      ? `${min} min ago`
      : min < 1440
        ? `${Math.round(min / 60)} h ago`
        : `${Math.round(min / 1440)} days ago`;
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Checks, for one official number, every link in the chain from "Meta accepted the message" to "we got
 * the delivery report" — and says in plain words which link is broken and how to fix it.
 */
@Injectable()
export class WhatsAppHealthService {
  constructor(
    private readonly engines: EngineRegistry,
    private readonly logs: WhatsAppLogsService,
    private readonly config: ConfigService,
    private readonly businessService: BusinessService,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(AiConfig, 'data') private readonly aiConfigs: Repository<AiConfig>,
  ) {}

  async check(sessionId: string): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const engine = this.engines.get(sessionId);
    const cloud = engine instanceof CloudApiAdapter ? engine : null;

    if (cloud) {
      const twins = [...this.engines.entries()]
        .filter(([id, e]) => id !== sessionId && e instanceof CloudApiAdapter)
        .filter(([, e]) => (e as CloudApiAdapter).getPhoneNumberId() === cloud.getPhoneNumberId())
        .map(([id]) => id);
      if (twins.length)
        checks.push({
          id: 'twin',
          ok: false,
          title: 'This number is connected more than once in Artha',
          detail: `Other sessions with the same phone number id: ${twins.join(', ')}. Each customer message reaches all of them, so a workflow in one and the AI in another can both reply.`,
          fix: 'Keep one session for this number: stop and delete the others in Sessions.',
        });
    }

    checks.push(
      cloud
        ? {
            id: 'running',
            ok: true,
            title: 'Number is connected in Artha',
            detail: `Phone number id ${cloud.getPhoneNumberId()}`,
          }
        : {
            id: 'running',
            ok: false,
            title: 'Number is not running',
            detail: 'This session is stopped or is not an official (Cloud API) number, so webhooks for it are dropped.',
            fix: 'Open Sessions and start it.',
          },
    );

    if (cloud) {
      try {
        const p = await cloud.getPhoneNumberStatus();
        const status = scalarToString(p.status, '');
        const mode = scalarToString(p.account_mode, '');
        checks.push({
          id: 'phone',
          ok: status ? status === 'CONNECTED' : null,
          title: `Meta number status: ${status || 'unknown'}${mode ? ` · ${mode}` : ''}`,
          detail: [
            p.display_phone_number && `${scalarToString(p.display_phone_number)}`,
            p.verified_name && `name “${scalarToString(p.verified_name)}” (${scalarToString(p.name_status, '?')})`,
            p.quality_rating && `quality ${scalarToString(p.quality_rating)}`,
            p.messaging_limit_tier && `limit ${scalarToString(p.messaging_limit_tier)}`,
          ]
            .filter(Boolean)
            .join(' · '),
          ...(status && status !== 'CONNECTED'
            ? {
                fix: 'Open WhatsApp Manager → Phone numbers and finish the number’s registration / display name approval.',
              }
            : mode === 'SANDBOX'
              ? { fix: 'The account is in sandbox mode: messages only reach test numbers.' }
              : {}),
        });
      } catch (e) {
        checks.push({
          id: 'phone',
          ok: null,
          title: 'Could not read the number from Meta',
          detail: errText(e),
          fix: 'Check the access token.',
        });
      }

      try {
        const apps = await cloud.getSubscribedApps();
        const appId = cloud.getAppId();
        const ours = appId ? apps.some(a => a.id === appId) : apps.length > 0;
        if (ours && apps.length > 1)
          checks.push({
            id: 'other_apps',
            ok: null,
            title: `${apps.length - 1} other app(s) also receive this account’s messages`,
            detail: `Subscribed apps: ${apps.map(a => `${a.name || '?'} (${a.id})`).join(', ')}.`,
            fix: 'If another server or bot (e.g. an old Artha site) uses one of them, customers get two replies. Remove that app in Meta Business Settings → Accounts → WhatsApp accounts → Connected apps, or stop that server.',
          });
        checks.push({
          id: 'subscribed',
          ok: ours,
          title: ours
            ? 'Your app receives this account’s webhooks'
            : 'Your app is NOT subscribed to this WhatsApp account',
          detail: apps.length
            ? `Subscribed apps: ${apps.map(a => `${a.name || '?'} (${a.id})`).join(', ')}`
            : 'No app is subscribed.',
          ...(ours
            ? {}
            : {
                fix: 'Without this Meta sends no delivery reports or incoming messages to your server. Press “Subscribe app”.',
                action: 'subscribe_app' as const,
              }),
        });
      } catch (e) {
        checks.push({
          id: 'subscribed',
          ok: null,
          title: 'Could not check the app subscription',
          detail: errText(e),
          fix: 'Check the WABA id and token permissions (whatsapp_business_management).',
        });
      }
    }

    const seen = await this.logs.lastSeen([sessionId]);
    checks.push(
      seen.lastWebhookAt
        ? {
            id: 'reaching',
            ok: true,
            title: 'Meta reaches this server',
            detail: `Last webhook ${ago(seen.lastWebhookAt)}.`,
          }
        : {
            id: 'reaching',
            ok: false,
            title: 'No webhook from Meta has reached this server (last 7 days)',
            detail: 'Delivery reports cannot arrive.',
            fix: 'In Meta: App → WhatsApp → Configuration: Callback URL must be this server’s /api/cloud-api/webhook and verified; the messages field subscribed; and the app published (Live) — unpublished apps only get test webhooks.',
          },
    );
    checks.push(
      seen.rejected24h
        ? {
            id: 'signature',
            ok: false,
            title: `${seen.rejected24h} webhooks were rejected in the last 24 h`,
            detail: 'Their signature did not match.',
            fix: 'Set CLOUD_API_APP_SECRET to the App Secret of the same Meta app whose webhook is configured (App settings → Basic), then redeploy.',
          }
        : {
            id: 'signature',
            ok: true,
            title: 'Webhook signatures are valid',
            detail: 'No rejected webhooks in the last 24 h.',
          },
    );
    if (seen.unmatched24h) {
      const d = (seen.lastUnmatched?.details ?? {}) as { phoneNumberId?: string };
      checks.push({
        id: 'unmatched',
        ok: false,
        title: `${seen.unmatched24h} webhooks were for a number that is not connected`,
        detail: `Meta sent phone number id ${d.phoneNumberId ?? '?'}${cloud ? `, this session uses ${cloud.getPhoneNumberId()}` : ''}.`,
        fix: 'Put the Phone number id from Meta (WhatsApp → API Setup) into the session / CLOUD_API_PHONE_NUMBER_ID.',
      });
    }
    checks.push(
      seen.lastStatusAt
        ? {
            id: 'status',
            ok: true,
            title: 'Delivery reports are arriving',
            detail: `Last report ${ago(seen.lastStatusAt)}.`,
          }
        : {
            id: 'status',
            ok: seen.lastWebhookAt ? null : false,
            title: 'No delivery report received for this number yet',
            detail: seen.lastWebhookAt
              ? 'Other webhooks arrive, but none with a message status.'
              : 'Nothing arrives from Meta.',
            fix: 'Make sure the “messages” webhook field is subscribed and the app is Live, then send a test message.',
          },
    );

    checks.push(await this.aiCheck(sessionId));

    const appSecret = this.config.get<string>('engine.cloudApi.appSecret');
    const verifyToken = this.config.get<string>('engine.cloudApi.verifyToken');
    checks.push({
      id: 'config',
      ok: Boolean(appSecret && verifyToken),
      title: 'Server settings',
      detail: `CLOUD_API_VERIFY_TOKEN ${verifyToken ? 'set' : 'missing'} · CLOUD_API_APP_SECRET ${appSecret ? 'set' : 'missing'}`,
      ...(appSecret && verifyToken ? {} : { fix: 'Set both on the server (Render → Environment) and redeploy.' }),
    });
    return checks;
  }

  /** AI settings belong to the business that owns the number — not to whoever is logged in. */
  private async businessOf(sessionId: string): Promise<string> {
    const session = await this.sessions.findOne({ where: { id: sessionId }, select: { id: true, businessId: true } });
    return session?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  private async aiCheck(sessionId: string): Promise<HealthCheck> {
    const ai = await this.aiConfigs.findOne({ where: { businessId: await this.businessOf(sessionId) } });
    const hasKey = groqKeyCount() > 0 || (ai?.provider === AiProvider.CUSTOM && Boolean(ai.apiEndpoint));
    if (!ai?.enabled) {
      return {
        id: 'ai',
        ok: false,
        title: 'AI auto-reply is OFF for this number',
        detail: 'Customer messages get no automatic answer. AI settings belong to the business that owns this number.',
        fix: 'Press “Turn on AI”, or open AI Assistant while logged in as that business.',
        action: 'enable_ai',
      };
    }
    if (ai.sessionScopes?.length && !ai.sessionScopes.includes(sessionId)) {
      return {
        id: 'ai',
        ok: false,
        title: 'AI is limited to other numbers',
        detail: 'Its settings list specific WhatsApp numbers and this one is not among them.',
        fix: 'Press “Turn on AI” to add this number.',
        action: 'enable_ai',
      };
    }
    if (!hasKey) {
      return {
        id: 'ai',
        ok: false,
        title: 'AI is on, but no AI key is set on the server',
        detail: 'Every answer fails, so customers get at most one “we will get back to you” message a day.',
        fix: 'Set GROQ_API_KEY on the server (Render → Environment; free key at console.groq.com) and redeploy.',
      };
    }
    return {
      id: 'ai',
      ok: true,
      title: 'AI auto-reply is on',
      detail: 'It answers messages that no workflow takes and that are not assigned to a person.',
    };
  }

  /** Switches the assistant on for the business that owns this number (and adds the number if limited). */
  async enableAi(sessionId: string): Promise<{ ok: boolean; message: string }> {
    const businessId = await this.businessOf(sessionId);
    const ai =
      (await this.aiConfigs.findOne({ where: { businessId } })) ??
      this.aiConfigs.create({
        businessId,
        provider: AiProvider.GROQ,
        model: process.env.GROQ_DEFAULT_MODEL || 'openai/gpt-oss-120b',
        systemPrompt:
          'You are a helpful and polite WhatsApp customer support assistant. Answer concisely and accurately.',
      });
    ai.enabled = true;
    if (ai.sessionScopes?.length && !ai.sessionScopes.includes(sessionId))
      ai.sessionScopes = [...ai.sessionScopes, sessionId];
    await this.aiConfigs.save(ai);
    this.logs.record({
      sessionId,
      kind: 'health.ai_enabled',
      level: 'success',
      summary: 'Turned on AI auto-reply for this number',
    });
    return {
      ok: true,
      message:
        groqKeyCount() > 0
          ? 'AI is on. Send a message from another phone to test it.'
          : 'AI is on, but GROQ_API_KEY is not set on the server yet — set it so AI can answer.',
    };
  }

  async subscribeApp(sessionId: string): Promise<{ ok: boolean; message: string }> {
    const engine = this.engines.get(sessionId);
    if (!(engine instanceof CloudApiAdapter))
      return { ok: false, message: 'This number is not a running official (Cloud API) number.' };
    try {
      const ok = await engine.subscribeApp();
      this.logs.record({
        sessionId,
        kind: 'health.subscribed',
        level: ok ? 'success' : 'warning',
        summary: ok
          ? 'Subscribed the app to the WhatsApp account (webhooks enabled)'
          : 'Meta did not confirm the subscription',
      });
      return {
        ok,
        message: ok
          ? 'Subscribed. Send a test message — delivery reports should now arrive.'
          : 'Meta did not confirm it.',
      };
    } catch (e) {
      return { ok: false, message: errText(e) };
    }
  }
}
