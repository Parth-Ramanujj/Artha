import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { createLogger } from '../../common/services/logger.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { CloudApiAdapter } from '../../engine/adapters/cloud-api.adapter';
import { WhatsAppLogsService, describeWebhook } from '../whatsapp-logs/whatsapp-logs.service';
import { WaBusinessService } from '../wa-business/wa-business.service';

@Injectable()
export class CloudApiWebhookService {
  private readonly logger = createLogger('CloudApiWebhookService');
  private readonly appSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly engineRegistry: EngineRegistry,
    @Optional() private readonly logs?: WhatsAppLogsService,
    @Optional() private readonly waBusiness?: WaBusinessService,
  ) {
    this.appSecret = this.configService.get<string>('engine.cloudApi.appSecret') ?? '';
  }

  validateSignature(rawBody: Buffer, signature: string | undefined): boolean {
    return this.signatureProblem(rawBody, signature) === null;
  }

  /** Why Meta's X-Hub-Signature-256 does not check out, in words for the logs; null when it does. */
  signatureProblem(rawBody: Buffer, signature: string | undefined): string | null {
    if (!this.appSecret) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'CRITICAL: engine.cloudApi.appSecret is not configured in production mode. Rejecting unverified webhook.',
        );
        return 'CLOUD_API_APP_SECRET is not set on the server, so production rejects unsigned webhooks.';
      }
      return null;
    }
    if (!signature) return 'Meta sent no X-Hub-Signature-256 header.';

    const expectedSignature = 'sha256=' + crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return 'The signature does not match CLOUD_API_APP_SECRET — it is probably the secret of a different Meta app.';
    }
    return null;
  }

  get isSignatureValidationEnabled(): boolean {
    return !!this.appSecret;
  }

  /** A webhook we refused, so the logs show Meta did reach us. */
  recordRejected(reason: string, body: Record<string, unknown>): void {
    this.logs?.record({
      kind: 'webhook.rejected',
      level: 'error',
      summary: `Webhook from Meta rejected: ${reason}`,
      details: { reason, fields: describeWebhook(body).map(e => e.kind) },
    });
  }

  dispatchToAdapters(body: Record<string, unknown>): void {
    const phoneNumberId = this.extractPhoneNumberId(body);
    const matched: string[] = [];

    for (const [sessionId, engine] of this.engineRegistry.entries()) {
      if (!(engine instanceof CloudApiAdapter)) continue;
      if (phoneNumberId && engine.getPhoneNumberId() !== phoneNumberId) continue;
      matched.push(sessionId);
      engine.dispatchWebhookPayload(body);
    }

    this.recordEvents(body, phoneNumberId, matched);
    void this.waBusiness?.onWebhook(body, matched);
  }

  private recordEvents(body: Record<string, unknown>, phoneNumberId: string | undefined, matched: string[]): void {
    if (!this.logs) return;
    if (phoneNumberId && matched.length === 0) {
      const known = [...this.engineRegistry.entries()]
        .filter(([, e]) => e instanceof CloudApiAdapter)
        .map(([id, e]) => ({ sessionId: id, phoneNumberId: (e as CloudApiAdapter).getPhoneNumberId() }));
      this.logs.record({
        kind: 'webhook.unmatched',
        level: 'error',
        summary: known.length
          ? `Webhook for phone number id ${phoneNumberId}, but no connected number has that id — it was ignored.`
          : `Webhook for phone number id ${phoneNumberId}, but no official (Cloud API) number is running — it was ignored.`,
        details: { phoneNumberId, connected: known, fields: describeWebhook(body).map(e => e.kind) },
      });
    }
    for (const event of describeWebhook(body)) {
      const { phoneNumberId: _id, ...rest } = event;
      this.logs.record({ ...rest, sessionId: matched[0] ?? null });
    }
  }

  private extractPhoneNumberId(body: Record<string, unknown>): string | undefined {
    try {
      const entry = (body as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[] })
        .entry?.[0];
      return entry?.changes?.[0]?.value?.metadata?.phone_number_id;
    } catch {
      return undefined;
    }
  }
}
