import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCallingSetting } from './entities/ai-calling-setting.entity';
import {
  DEFAULT_PROVIDERS,
  ProviderConfig,
  SECRET_ENV,
  SECRET_NAMES,
  SecretName,
  sanitizeProviders,
} from './provider-settings';
import { decryptSecret, encryptSecret } from '../integrations/google/google-token-crypto';
import type { TwilioConfig } from './twilio.client';

const CONFIG_KEY = 'providers.config';
const secretKey = (name: SecretName) => `secret.${name}`;

export interface ResolvedProviders {
  config: ProviderConfig;
  secrets: Record<SecretName, string | null>;
}

/**
 * Runtime provider choice and API keys. Changes take effect on the next call, with no redeploy.
 * Keys are encrypted with GOOGLE_TOKEN_ENCRYPTION_KEY (the app's existing secret key) and never returned.
 */
@Injectable()
export class ProviderSettingsService {
  constructor(@InjectRepository(AiCallingSetting, 'data') private readonly settings: Repository<AiCallingSetting>) {}

  async config(): Promise<ProviderConfig> {
    const row = await this.settings.findOne({ where: { key: CONFIG_KEY } });
    if (!row) return { ...DEFAULT_PROVIDERS };
    try {
      return sanitizeProviders(JSON.parse(row.value) as Record<string, unknown>);
    } catch {
      return { ...DEFAULT_PROVIDERS };
    }
  }

  async saveConfig(patch: Record<string, unknown>): Promise<ProviderConfig> {
    const merged = sanitizeProviders({ ...(await this.config()), ...patch });
    if (merged.elevenOutputFormat && !/^[a-z]+_\d+$/.test(merged.elevenOutputFormat)) {
      throw new BadRequestException('Output format looks wrong (example: ulaw_8000)');
    }
    if (merged.llm === 'openai-compatible' && !/^https:\/\/[^\s]+$/i.test(merged.llmBaseUrl)) {
      throw new BadRequestException('The LLM base address must be an https:// address');
    }
    await this.settings.save({ key: CONFIG_KEY, value: JSON.stringify(merged) });
    return merged;
  }

  /** `value` null removes the saved key (the environment value, if any, still applies). */
  async saveSecret(name: SecretName, value: string | null): Promise<void> {
    if (!SECRET_NAMES.includes(name)) throw new BadRequestException('Unknown key name');
    if (value === null || value.trim() === '') {
      await this.settings.delete({ key: secretKey(name) });
      return;
    }
    const clean = value.trim();
    if (name === 'TWILIO_ACCOUNT_SID' && !/^AC[0-9a-fA-F]{32}$/.test(clean)) {
      throw new BadRequestException('Twilio Account SID starts with AC and has 34 characters');
    }
    if (name === 'TWILIO_PHONE_NUMBER' && !/^\+\d{8,15}$/.test(clean)) {
      throw new BadRequestException('Twilio number must include the country code, e.g. +15551234567');
    }
    await this.settings.save({ key: secretKey(name), value: encryptSecret(clean) });
  }

  /** Whether each key is set, and where it comes from. The key values are never returned. */
  async secretStatus(): Promise<Record<SecretName, 'saved' | 'environment' | 'missing'>> {
    const out = {} as Record<SecretName, 'saved' | 'environment' | 'missing'>;
    for (const name of SECRET_NAMES) {
      const saved = await this.settings.findOne({ where: { key: secretKey(name) } });
      out[name] = saved ? 'saved' : process.env[SECRET_ENV[name]]?.trim() ? 'environment' : 'missing';
    }
    return out;
  }

  /** Twilio credentials: the saved values, else the environment. Null until all three are set. */
  async twilio(): Promise<TwilioConfig | null> {
    const { secrets } = await this.resolve();
    const accountSid = secrets.TWILIO_ACCOUNT_SID;
    const authToken = secrets.TWILIO_AUTH_TOKEN;
    const fromNumber = secrets.TWILIO_PHONE_NUMBER;
    return accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : null;
  }

  async resolve(): Promise<ResolvedProviders> {
    const secrets = {} as Record<SecretName, string | null>;
    for (const name of SECRET_NAMES) {
      const saved = await this.settings.findOne({ where: { key: secretKey(name) } });
      const fromEnv = process.env[SECRET_ENV[name]]?.trim() || null;
      secrets[name] = saved ? decryptSecret(saved.value) : fromEnv;
    }
    return { config: await this.config(), secrets };
  }
}
