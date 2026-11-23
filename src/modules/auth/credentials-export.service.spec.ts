import { CredentialsExportService } from './credentials-export.service';
import type { Repository, DataSource } from 'typeorm';
import type { ApiKey } from './entities/api-key.entity';

describe('CredentialsExportService', () => {
  let service: CredentialsExportService;
  let mockApiKeyRepo: Partial<Repository<ApiKey>>;
  let mockDataDataSource: Partial<DataSource>;

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLOUD_API_ACCESS_TOKEN: 'meta-system-token-123',
      CLOUD_API_PHONE_NUMBER_ID: '100234567890',
      CLOUD_API_WABA_ID: '9988776655',
      CLOUD_API_VERIFY_TOKEN: 'my-verify-token',
      GROQ_API_KEY: 'test_groq_1',
      GROQ_API_KEY_1: 'test_groq_2',
      GEMINI_API_KEY: 'test_gemini_key',
      RAZORPAY_KEY_ID: 'test_rzp_key',
      RAZORPAY_KEY_SECRET: 'test_rzp_sec',
    };

    mockApiKeyRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'key-1',
          name: 'Master Admin Key',
          keyPrefix: 'owa_k1_abcdef',
          role: 'admin',
          allowedIps: null,
          allowedSessions: null,
          businessId: null,
          allowedFeatures: null,
          isActive: true,
          expiresAt: null,
          lastUsedAt: new Date('2026-11-20T10:00:00Z'),
          usageCount: 42,
          createdAt: new Date('2026-11-01T10:00:00Z'),
        },
      ]),
    };

    mockDataDataSource = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM sessions')) {
          return Promise.resolve([
            {
              id: 'sess-1',
              name: 'Support Line',
              phone: '919876543210',
              pushName: 'Support',
              engineType: 'cloud-api',
              status: 'ready',
              businessId: 'biz-1',
              config: JSON.stringify({
                cloudApiConfig: {
                  accessToken: 'sess-token-456',
                  phoneNumberId: '100999',
                },
              }),
            },
          ]);
        }
        if (sql.includes('FROM integrations')) {
          return Promise.resolve([
            {
              id: 'intg-1',
              businessId: 'biz-1',
              type: 'google_sheets',
              name: 'Google Sheets (crm@example.com)',
              status: 'connected',
              enabled: true,
              config: JSON.stringify({
                accountEmail: 'crm@example.com',
                refreshToken: 'plain-refresh-token',
              }),
            },
          ]);
        }
        if (sql.includes('FROM social_accounts')) {
          return Promise.resolve([
            {
              id: 'soc-1',
              businessId: 'biz-1',
              platform: 'x',
              accountName: 'TechCo',
              accountId: '123456',
              accessToken: JSON.stringify({
                apiKey: 'x-api-key',
                apiSecret: 'x-api-secret',
                accessToken: 'x-token',
                accessTokenSecret: 'x-token-secret',
              }),
              status: 'connected',
            },
            {
              id: 'soc-2',
              businessId: 'biz-1',
              platform: 'telegram',
              accountName: 'BotFather',
              accountId: 'bot_123',
              accessToken: 'test_telegram_bot_token',
              status: 'connected',
            },
          ]);
        }
        if (sql.includes('FROM ai_calling_settings')) {
          return Promise.resolve([
            {
              key: 'providers.config',
              value: JSON.stringify({
                stt: 'sarvam',
                ttsGujarati: 'sarvam',
                sarvamGujaratiVoice: 'pooja_gu_customer',
                elevenVoiceId: 'wS22teQFfZZKTTTGs9e5',
                llm: 'groq',
              }),
            },
            {
              key: 'secret.TWILIO_ACCOUNT_SID',
              value: 'dummy_twilio_acc_sid',
            },
            {
              key: 'secret.SARVAM_API_KEY',
              value: 'sarvam_test_key',
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    service = new CredentialsExportService(
      mockApiKeyRepo as Repository<ApiKey>,
      mockDataDataSource as DataSource,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('exports structured credentials with all categories', async () => {
    const result = await service.exportAll();

    expect(result).toBeDefined();
    expect(result.version).toBe('1.0.0');
    expect(result.exportedAt).toBeDefined();

    // Summary checks
    expect(result.summary.totalSessions).toBe(1);
    expect(result.summary.totalIntegrations).toBe(1);
    expect(result.summary.totalSocialAccounts).toBe(2);
    expect(result.summary.totalSystemApiKeys).toBe(1);
    expect(result.summary.hasCloudApi).toBe(true);

    // WhatsApp Cloud API
    expect(result.whatsapp.cloudApi.isConfigured).toBe(true);
    expect(result.whatsapp.cloudApi.accessToken).toBe('meta-system-token-123');
    expect(result.whatsapp.cloudApi.phoneNumberId).toBe('100234567890');
    expect(result.whatsapp.sessions[0].name).toBe('Support Line');
    expect(result.whatsapp.sessions[0].cloudApiConfig?.accessToken).toBe('sess-token-456');

    // AI & Calling
    expect(result.aiAndCalling.twilio.accountSid).toBe('dummy_twilio_acc_sid');
    expect(result.aiAndCalling.sarvam.apiKey).toBe('sarvam_test_key');
    expect(result.aiAndCalling.elevenLabs.voiceId).toBe('wS22teQFfZZKTTTGs9e5');
    expect(result.aiAndCalling.llm.primaryGroqKey).toBe('test_groq_1');
    expect(result.aiAndCalling.llm.groqKeyPool).toContain('test_groq_1');
    expect(result.aiAndCalling.llm.groqKeyPool).toContain('test_groq_2');
    expect(result.aiAndCalling.llm.geminiApiKey).toBe('test_gemini_key');

    // Social accounts
    const xAcc = result.socialAccounts.find(a => a.platform === 'x');
    expect(xAcc?.xCredentials?.apiKey).toBe('x-api-key');
    const tgAcc = result.socialAccounts.find(a => a.platform === 'telegram');
    expect(tgAcc?.accessToken).toBe('test_telegram_bot_token');

    // System API keys
    expect(result.systemApiKeys.keys[0].name).toBe('Master Admin Key');

    // Platform Secrets
    expect(result.platformSecrets.razorpay.isConfigured).toBe(true);
    expect(result.platformSecrets.razorpay.keyId).toBe('test_rzp_key');
  });

  it('tolerates missing tables without throwing', async () => {
    mockDataDataSource.query = jest.fn().mockRejectedValue({
      name: 'QueryFailedError',
      message: 'SQLITE_ERROR: no such table: social_accounts',
    });

    const result = await service.exportAll();
    expect(result).toBeDefined();
    expect(result.socialAccounts).toEqual([]);
    expect(result.whatsapp.sessions).toEqual([]);
  });
});
