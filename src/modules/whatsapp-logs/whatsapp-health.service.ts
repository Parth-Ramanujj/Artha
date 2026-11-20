import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { CloudApiAdapter } from '../../engine/adapters/cloud-api.adapter';
import { WhatsAppLogsService } from './whatsapp-logs.service';
import { scalarToString } from '../../common/utils/scalar-string';

export interface HealthCheck {
  id: string;
  /** true = fine, false = broken, null = could not tell */
  ok: boolean | null;
  title: string;
  detail: string;
  fix?: string;
  /** A button the dashboard can offer to fix it. */
  action?: 'subscribe_app';
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
  ) {}

  async check(sessionId: string): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const engine = this.engines.get(sessionId);
    const cloud = engine instanceof CloudApiAdapter ? engine : null;

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
