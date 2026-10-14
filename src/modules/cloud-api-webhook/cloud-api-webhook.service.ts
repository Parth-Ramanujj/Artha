import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { createLogger } from '../../common/services/logger.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { CloudApiAdapter } from '../../engine/adapters/cloud-api.adapter';

@Injectable()
export class CloudApiWebhookService {
  private readonly logger = createLogger('CloudApiWebhookService');
  private readonly appSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly engineRegistry: EngineRegistry,
  ) {
    this.appSecret = this.configService.get<string>('engine.cloudApi.appSecret') ?? '';
  }

  validateSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!this.appSecret) return true;
    if (!signature) return false;

    const expectedSignature = 'sha256=' + crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length) return false;

    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }

  get isSignatureValidationEnabled(): boolean {
    return !!this.appSecret;
  }

  dispatchToAdapters(body: Record<string, unknown>): void {
    const phoneNumberId = this.extractPhoneNumberId(body);

    for (const [, engine] of this.engineRegistry.entries()) {
      if (!(engine instanceof CloudApiAdapter)) continue;
      if (phoneNumberId && engine.getPhoneNumberId() !== phoneNumberId) continue;
      engine.dispatchWebhookPayload(body);
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
