import { Injectable, Optional } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApiKey } from './entities/api-key.entity';
import { createLogger } from '../../common/services/logger.service';
import { isMissingTableError } from '../../common/utils/db-errors';
import { decryptSecret } from '../integrations/google/google-token-crypto';
import { readBootstrapKey } from './bootstrap-key-file';
import { SECRET_ENV, SECRET_NAMES, SecretName } from '../ai-calling/provider-settings';

export interface CredentialsExportResult {
  exportedAt: string;
  version: string;
  summary: {
    totalSessions: number;
    totalIntegrations: number;
    totalSocialAccounts: number;
    totalSystemApiKeys: number;
    hasCloudApi: boolean;
    hasTwilio: boolean;
    hasElevenLabs: boolean;
    hasSarvam: boolean;
    hasDeepgram: boolean;
    hasLlm: boolean;
    activeAiProviders: string[];
  };
  whatsapp: {
    cloudApi: {
      isConfigured: boolean;
      accessToken: string | null;
      phoneNumberId: string | null;
      wabaId: string | null;
      verifyToken: string | null;
      appSecret: string | null;
      appId: string | null;
      graphVersion: string;
    };
    sessions: Array<{
      id: string;
      name: string;
      phone: string | null;
      pushName: string | null;
      engineType: string | null;
      status: string;
      businessId: string | null;
      proxyUrl: string | null;
      proxyType: string | null;
      connectedAt: string | null;
      cloudApiConfig?: {
        accessToken?: string;
        phoneNumberId?: string;
        wabaId?: string;
        verifyToken?: string;
      } | null;
      config: Record<string, unknown>;
    }>;
  };
  aiAndCalling: {
    telephonyPublicUrl: string | null;
    twilio: {
      isConfigured: boolean;
      accountSid: string | null;
      authToken: string | null;
      phoneNumber: string | null;
      source: 'database' | 'environment' | 'none';
    };
    elevenLabs: {
      isConfigured: boolean;
      apiKey: string | null;
      voiceId: string | null;
      model: string | null;
      outputFormat: string | null;
      source: 'database' | 'environment' | 'none';
    };
    sarvam: {
      isConfigured: boolean;
      apiKey: string | null;
      defaultGujaratiVoice: string;
      defaultHindiVoice: string;
      source: 'database' | 'environment' | 'none';
    };
    deepgram: {
      isConfigured: boolean;
      apiKey: string | null;
      source: 'database' | 'environment' | 'none';
    };
    llm: {
      isConfigured: boolean;
      provider: string;
      customApiKey: string | null;
      customBaseUrl: string | null;
      customModel: string | null;
      groqModel: string;
      primaryGroqKey: string | null;
      groqKeyPool: string[];
      geminiApiKey: string | null;
      openRouterApiKey: string | null;
      openAiApiKey: string | null;
      source: 'database' | 'environment' | 'none';
    };
  };
  integrations: Array<{
    id: string;
    businessId: string;
    type: string;
    name: string;
    status: string;
    enabled: boolean;
    config: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    lastError: string | null;
    createdAt: string;
  }>;
  socialAccounts: Array<{
    id: string;
    businessId: string;
    platform: string;
    accountName: string;
    accountId: string;
    accessToken: string;
    xCredentials?: {
      apiKey: string;
      apiSecret: string;
      accessToken: string;
      accessTokenSecret: string;
    } | null;
    pageId: string | null;
    webhookVerifyToken: string | null;
    status: string;
    createdAt: string;
  }>;
  systemApiKeys: {
    bootstrapAdminKey: string | null;
    masterKeyFromEnv: string | null;
    keys: Array<{
      id: string;
      name: string;
      keyPrefix: string;
      role: string;
      allowedIps: string[] | null;
      allowedSessions: string[] | null;
      businessId: string | null;
      allowedFeatures: string[] | null;
      isActive: boolean;
      expiresAt: string | null;
      lastUsedAt: string | null;
      usageCount: number;
      createdAt: string;
    }>;
  };
  platformSecrets: {
    razorpay: {
      keyId: string | null;
      keySecret: string | null;
      isConfigured: boolean;
    };
    storageS3: {
      accessKeyId: string | null;
      secretAccessKey: string | null;
      bucket: string | null;
      region: string | null;
      endpoint: string | null;
      isConfigured: boolean;
    };
    metricsToken: string | null;
    metaAppSecret: string | null;
    encryptionConfigured: boolean;
    jwtSecretConfigured: boolean;
  };
}

@Injectable()
export class CredentialsExportService {
  private readonly logger = createLogger('CredentialsExportService');

  constructor(
    @InjectRepository(ApiKey, 'main')
    private readonly apiKeyRepo: Repository<ApiKey>,
    @InjectDataSource('data')
    private readonly dataDataSource: DataSource,
  ) {}

  /** Safe decryption that never crashes on unencrypted or corrupted data */
  private safeDecrypt(val: string | null | undefined): string | null {
    if (!val) return null;
    const trimmed = val.trim();
    if (trimmed.startsWith('v1.')) {
      try {
        return decryptSecret(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  /** Safe table query that handles missing tables cleanly */
  private async queryOptionalTable<T>(table: string): Promise<T[]> {
    try {
      return await this.dataDataSource.query<T[]>(`SELECT * FROM ${table}`);
    } catch (error) {
      if (!isMissingTableError(error)) {
        this.logger.warn(`Failed to query table ${table}`, { error: String(error) });
      }
      return [];
    }
  }

  /** Safely parse JSON or return object */
  private parseJson(val: unknown): Record<string, unknown> {
    if (!val) return {};
    if (typeof val === 'object' && val !== null) return val as Record<string, unknown>;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }

  async exportAll(): Promise<CredentialsExportResult> {
    // 1. Query Data DB tables safely
    const [sessionsRows, integrationsRows, socialRows, aiCallingRows] = await Promise.all([
      this.queryOptionalTable<Record<string, unknown>>('sessions'),
      this.queryOptionalTable<Record<string, unknown>>('integrations'),
      this.queryOptionalTable<Record<string, unknown>>('social_accounts'),
      this.queryOptionalTable<{ key: string; value: string }>('ai_calling_settings'),
    ]);

    // 2. Process AI Calling Settings
    const aiCallingMap = new Map<string, string>();
    for (const row of aiCallingRows) {
      aiCallingMap.set(row.key, row.value);
    }

    const providerConfigRaw = aiCallingMap.get('providers.config');
    const providerConfig = this.parseJson(providerConfigRaw);

    // Resolve secrets (Database first, environment fallback)
    const resolveSecret = (name: SecretName): { value: string | null; source: 'database' | 'environment' | 'none' } => {
      const dbVal = aiCallingMap.get(`secret.${name}`);
      if (dbVal) {
        const decrypted = this.safeDecrypt(dbVal);
        if (decrypted) return { value: decrypted, source: 'database' };
      }
      const envVal = process.env[SECRET_ENV[name]]?.trim();
      if (envVal) return { value: envVal, source: 'environment' };
      return { value: null, source: 'none' };
    };

    const twilioSid = resolveSecret('TWILIO_ACCOUNT_SID');
    const twilioAuth = resolveSecret('TWILIO_AUTH_TOKEN');
    const twilioPhone = resolveSecret('TWILIO_PHONE_NUMBER');
    const elevenKey = resolveSecret('ELEVENLABS_API_KEY');
    const sarvamKey = resolveSecret('SARVAM_API_KEY');
    const deepgramKey = resolveSecret('DEEPGRAM_API_KEY');
    const llmKey = resolveSecret('LLM_API_KEY');

    const telephonyPublicUrl =
      aiCallingMap.get('public_url') || process.env.AI_CALLING_PUBLIC_URL?.trim() || null;

    // Groq pool keys
    const groqPool = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4,
      process.env.GROQ_API_KEY_5,
      process.env.GROQ_API_KEY_6,
    ]
      .map(k => k?.trim())
      .filter((k): k is string => Boolean(k));

    // 3. Process WhatsApp Sessions & Cloud API
    const envCloudApiToken = process.env.CLOUD_API_ACCESS_TOKEN?.trim() || null;
    const envPhoneNumberId = process.env.CLOUD_API_PHONE_NUMBER_ID?.trim() || null;
    const envWabaId = process.env.CLOUD_API_WABA_ID?.trim() || null;
    const envVerifyToken = process.env.CLOUD_API_VERIFY_TOKEN?.trim() || null;
    const envAppSecret = process.env.CLOUD_API_APP_SECRET?.trim() || null;
    const envAppId = process.env.CLOUD_API_APP_ID?.trim() || null;
    const envGraphVersion = process.env.CLOUD_API_GRAPH_VERSION?.trim() || 'v21.0';

    const sessions = sessionsRows.map(s => {
      const config = this.parseJson(s.config);
      const cloudApiConfig = config.cloudApiConfig
        ? (config.cloudApiConfig as {
            accessToken?: string;
            phoneNumberId?: string;
            wabaId?: string;
            verifyToken?: string;
          })
        : null;

      return {
        id: String(s.id || ''),
        name: String(s.name || ''),
        phone: s.phone ? String(s.phone) : null,
        pushName: s.pushName ? String(s.pushName) : null,
        engineType: s.engineType ? String(s.engineType) : null,
        status: String(s.status || 'unknown'),
        businessId: s.businessId ? String(s.businessId) : null,
        proxyUrl: s.proxyUrl ? String(s.proxyUrl) : null,
        proxyType: s.proxyType ? String(s.proxyType) : null,
        connectedAt: s.connectedAt ? new Date(String(s.connectedAt)).toISOString() : null,
        cloudApiConfig,
        config,
      };
    });

    // 4. Process Third-Party Integrations
    const integrations = integrationsRows.map(intg => {
      const rawConfig = this.parseJson(intg.config);
      const config = { ...rawConfig };

      // Decrypt any encrypted tokens in config (e.g. Google refresh tokens)
      if (typeof config.refreshToken === 'string' && config.refreshToken.startsWith('v1.')) {
        config.refreshToken = this.safeDecrypt(config.refreshToken);
      }

      return {
        id: String(intg.id || ''),
        businessId: String(intg.businessId || ''),
        type: String(intg.type || ''),
        name: String(intg.name || ''),
        status: String(intg.status || 'unknown'),
        enabled: Boolean(intg.enabled ?? true),
        config,
        metadata: this.parseJson(intg.metadata),
        lastError: intg.lastError ? String(intg.lastError) : null,
        createdAt: intg.createdAt ? new Date(String(intg.createdAt)).toISOString() : new Date().toISOString(),
      };
    });

    // 5. Process Social Accounts (Instagram, Facebook, Telegram, X, YouTube, LinkedIn)
    const socialAccounts = socialRows.map(acc => {
      const rawToken = acc.accessToken ? String(acc.accessToken) : '';
      let xCredentials: { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string } | null = null;
      if (acc.platform === 'x' && rawToken.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawToken);
          xCredentials = {
            apiKey: String(parsed.apiKey || ''),
            apiSecret: String(parsed.apiSecret || ''),
            accessToken: String(parsed.accessToken || ''),
            accessTokenSecret: String(parsed.accessTokenSecret || ''),
          };
        } catch {
          // keep as raw token
        }
      }

      return {
        id: String(acc.id || ''),
        businessId: String(acc.businessId || ''),
        platform: String(acc.platform || ''),
        accountName: String(acc.accountName || ''),
        accountId: String(acc.accountId || ''),
        accessToken: rawToken,
        xCredentials,
        pageId: acc.pageId ? String(acc.pageId) : null,
        webhookVerifyToken: acc.webhookVerifyToken ? String(acc.webhookVerifyToken) : null,
        status: String(acc.status || 'connected'),
        createdAt: acc.createdAt ? new Date(String(acc.createdAt)).toISOString() : new Date().toISOString(),
      };
    });

    // 6. Process System API Keys from 'main' DB
    const apiKeys = await this.apiKeyRepo.find({ order: { createdAt: 'DESC' } });
    const bootstrapAdminKey = readBootstrapKey(this.logger);
    const masterKeyFromEnv = process.env.API_MASTER_KEY?.trim() || null;

    const systemKeys = apiKeys.map(k => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      role: k.role,
      allowedIps: k.allowedIps || null,
      allowedSessions: k.allowedSessions || null,
      businessId: k.businessId || null,
      allowedFeatures: k.allowedFeatures || null,
      isActive: k.isActive,
      expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      usageCount: k.usageCount,
      createdAt: k.createdAt.toISOString(),
    }));

    // 7. Active AI providers list
    const activeAiProviders: string[] = [];
    if (sarvamKey.value) activeAiProviders.push('Sarvam STT/TTS');
    if (elevenKey.value) activeAiProviders.push('ElevenLabs TTS');
    if (deepgramKey.value) activeAiProviders.push('Deepgram STT');
    if (twilioSid.value) activeAiProviders.push('Twilio Telephony');
    if (groqPool.length > 0) activeAiProviders.push(`Groq LLM (${groqPool.length} keys)`);
    if (process.env.GEMINI_API_KEY) activeAiProviders.push('Google Gemini');
    if (process.env.OPENROUTER_API_KEY) activeAiProviders.push('OpenRouter');
    if (process.env.OPENAI_API_KEY) activeAiProviders.push('OpenAI');
    if (llmKey.value) activeAiProviders.push('Custom LLM');

    // 8. Build full result
    return {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      summary: {
        totalSessions: sessions.length,
        totalIntegrations: integrations.length,
        totalSocialAccounts: socialAccounts.length,
        totalSystemApiKeys: systemKeys.length,
        hasCloudApi: Boolean(envCloudApiToken || sessions.some(s => s.cloudApiConfig?.accessToken)),
        hasTwilio: Boolean(twilioSid.value && twilioAuth.value),
        hasElevenLabs: Boolean(elevenKey.value),
        hasSarvam: Boolean(sarvamKey.value),
        hasDeepgram: Boolean(deepgramKey.value),
        hasLlm: Boolean(groqPool.length > 0 || llmKey.value || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
        activeAiProviders,
      },
      whatsapp: {
        cloudApi: {
          isConfigured: Boolean(envCloudApiToken && envPhoneNumberId),
          accessToken: envCloudApiToken,
          phoneNumberId: envPhoneNumberId,
          wabaId: envWabaId,
          verifyToken: envVerifyToken,
          appSecret: envAppSecret,
          appId: envAppId,
          graphVersion: envGraphVersion,
        },
        sessions,
      },
      aiAndCalling: {
        telephonyPublicUrl,
        twilio: {
          isConfigured: Boolean(twilioSid.value && twilioAuth.value && twilioPhone.value),
          accountSid: twilioSid.value,
          authToken: twilioAuth.value,
          phoneNumber: twilioPhone.value,
          source: twilioSid.source,
        },
        elevenLabs: {
          isConfigured: Boolean(elevenKey.value),
          apiKey: elevenKey.value,
          voiceId: typeof providerConfig.elevenVoiceId === 'string' ? providerConfig.elevenVoiceId : null,
          model: typeof providerConfig.elevenModel === 'string' ? providerConfig.elevenModel : 'eleven_turbo_v2_5',
          outputFormat:
            typeof providerConfig.elevenOutputFormat === 'string' ? providerConfig.elevenOutputFormat : 'ulaw_8000',
          source: elevenKey.source,
        },
        sarvam: {
          isConfigured: Boolean(sarvamKey.value),
          apiKey: sarvamKey.value,
          defaultGujaratiVoice:
            typeof providerConfig.sarvamGujaratiVoice === 'string'
              ? providerConfig.sarvamGujaratiVoice
              : 'pooja_gu_customer',
          defaultHindiVoice:
            typeof providerConfig.sarvamHindiVoice === 'string'
              ? providerConfig.sarvamHindiVoice
              : 'ritu_hi_customer_warm',
          source: sarvamKey.source,
        },
        deepgram: {
          isConfigured: Boolean(deepgramKey.value),
          apiKey: deepgramKey.value,
          source: deepgramKey.source,
        },
        llm: {
          isConfigured: Boolean(groqPool.length > 0 || llmKey.value),
          provider: typeof providerConfig.llm === 'string' ? providerConfig.llm : 'groq',
          customApiKey: llmKey.value,
          customBaseUrl: typeof providerConfig.llmBaseUrl === 'string' ? providerConfig.llmBaseUrl : null,
          customModel: typeof providerConfig.llmModel === 'string' ? providerConfig.llmModel : null,
          groqModel:
            typeof providerConfig.groqModel === 'string' ? providerConfig.groqModel : 'llama-3.3-70b-versatile',
          primaryGroqKey: process.env.GROQ_API_KEY?.trim() || null,
          groqKeyPool: groqPool,
          geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
          openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || null,
          openAiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
          source: llmKey.source !== 'none' ? llmKey.source : groqPool.length > 0 ? 'environment' : 'none',
        },
      },
      integrations,
      socialAccounts,
      systemApiKeys: {
        bootstrapAdminKey,
        masterKeyFromEnv,
        keys: systemKeys,
      },
      platformSecrets: {
        razorpay: {
          keyId: process.env.RAZORPAY_KEY_ID?.trim() || null,
          keySecret: process.env.RAZORPAY_KEY_SECRET?.trim() || null,
          isConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        },
        storageS3: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || process.env.S3_ACCESS_KEY?.trim() || null,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || process.env.S3_SECRET_KEY?.trim() || null,
          bucket: process.env.S3_BUCKET?.trim() || null,
          region: process.env.S3_REGION?.trim() || null,
          endpoint: process.env.S3_ENDPOINT?.trim() || null,
          isConfigured: Boolean(
            (process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY) &&
              (process.env.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY),
          ),
        },
        metricsToken: process.env.METRICS_TOKEN?.trim() || null,
        metaAppSecret: process.env.META_APP_SECRET?.trim() || null,
        encryptionConfigured: Boolean(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim()),
        jwtSecretConfigured: Boolean(process.env.JWT_SECRET?.trim()),
      },
    };
  }
}
