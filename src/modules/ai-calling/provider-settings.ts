/** Which engine handles each part of an AI call. Stored in the database, changed from the dashboard. */
export type SttProvider = 'sarvam' | 'deepgram';
export type TtsProvider = 'sarvam' | 'elevenlabs';
export type LlmProvider = 'groq' | 'openai-compatible';

export interface ProviderConfig {
  /** If true, outer engine choices (STT, Voices, LLM) override individual agent settings for all calls. */
  overrideAgentSettings: boolean;
  stt: SttProvider;
  /** Text-to-speech engine per language. Sarvam is the proven default for Gujarati and Hindi. */
  ttsGujarati: TtsProvider;
  ttsHindi: TtsProvider;
  ttsEnglish: TtsProvider;
  /** Chosen Sarvam voice for Gujarati when Sarvam is used (defaults to pooja_gu_customer). */
  sarvamGujaratiVoice: string;
  /** Chosen Sarvam voice for Hindi when Sarvam is used (defaults to ritu_hi_customer_warm). */
  sarvamHindiVoice: string;
  elevenVoiceId: string;
  elevenModel: string;
  /** Telephony audio. ulaw_8000 is what Twilio plays; change only if the engine needs something else. */
  elevenOutputFormat: string;
  llm: LlmProvider;
  /** Groq model name when Groq is used (e.g. llama-3.3-70b-versatile or openai/gpt-oss-120b). */
  groqModel: string;
  /** OpenAI-compatible chat endpoint base, e.g. https://api.openai.com/v1 */
  llmBaseUrl: string;
  llmModel: string;
}

export const DEFAULT_PROVIDERS: ProviderConfig = {
  overrideAgentSettings: true,
  stt: 'sarvam',
  ttsGujarati: 'sarvam',
  ttsHindi: 'sarvam',
  ttsEnglish: 'sarvam',
  sarvamGujaratiVoice: 'pooja_gu_customer',
  sarvamHindiVoice: 'ritu_hi_customer_warm',
  elevenVoiceId: '',
  elevenModel: 'eleven_multilingual_v2',
  elevenOutputFormat: 'ulaw_8000',
  llm: 'groq',
  groqModel: 'llama-3.3-70b-versatile',
  llmBaseUrl: '',
  llmModel: '',
};

/** Secrets are encrypted at rest and never returned by the API. */
export const SECRET_NAMES = [
  'SARVAM_API_KEY',
  'DEEPGRAM_API_KEY',
  'ELEVENLABS_API_KEY',
  'LLM_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Environment fallback for each secret, so existing Render env vars keep working. */
export const SECRET_ENV: Record<SecretName, string> = {
  SARVAM_API_KEY: 'SARVAM_API_KEY',
  DEEPGRAM_API_KEY: 'DEEPGRAM_API_KEY',
  ELEVENLABS_API_KEY: 'ELEVENLABS_API_KEY',
  LLM_API_KEY: 'LLM_API_KEY',
  TWILIO_ACCOUNT_SID: 'TWILIO_ACCOUNT_SID',
  TWILIO_AUTH_TOKEN: 'TWILIO_AUTH_TOKEN',
  TWILIO_PHONE_NUMBER: 'TWILIO_PHONE_NUMBER',
};

const ENUMS: Record<'stt' | 'ttsGujarati' | 'ttsHindi' | 'ttsEnglish' | 'llm', readonly string[]> = {
  stt: ['sarvam', 'deepgram'],
  ttsGujarati: ['sarvam', 'elevenlabs'],
  ttsHindi: ['sarvam', 'elevenlabs'],
  ttsEnglish: ['sarvam', 'elevenlabs'],
  llm: ['groq', 'openai-compatible'],
};

/** Keeps only known fields with valid values; anything else falls back to the default. */
export function sanitizeProviders(input: Partial<Record<keyof ProviderConfig, unknown>>): ProviderConfig {
  const out: ProviderConfig = { ...DEFAULT_PROVIDERS };
  if (input.overrideAgentSettings !== undefined) {
    out.overrideAgentSettings =
      typeof input.overrideAgentSettings === 'boolean'
        ? input.overrideAgentSettings
        : input.overrideAgentSettings === 'true';
  }
  for (const key of Object.keys(DEFAULT_PROVIDERS) as (keyof ProviderConfig)[]) {
    if (key === 'overrideAgentSettings') continue;
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (key in ENUMS) {
      const allowed = ENUMS[key as keyof typeof ENUMS];
      if (typeof value === 'string' && allowed.includes(value))
        (out as unknown as Record<string, unknown>)[key] = value;
      continue;
    }
    if (typeof value === 'string') (out as unknown as Record<string, unknown>)[key] = value.trim().slice(0, 500);
  }
  if (!out.elevenOutputFormat) out.elevenOutputFormat = DEFAULT_PROVIDERS.elevenOutputFormat;
  if (!out.elevenModel) out.elevenModel = DEFAULT_PROVIDERS.elevenModel;
  if (!out.sarvamGujaratiVoice) out.sarvamGujaratiVoice = DEFAULT_PROVIDERS.sarvamGujaratiVoice;
  if (!out.sarvamHindiVoice) out.sarvamHindiVoice = DEFAULT_PROVIDERS.sarvamHindiVoice;
  if (!out.groqModel) out.groqModel = DEFAULT_PROVIDERS.groqModel;
  return out;
}

/** Which engine speaks a given language. Unknown languages use Sarvam. */
export function ttsProviderFor(config: ProviderConfig, languageCode: string): TtsProvider {
  if (languageCode === 'gu-IN') return config.ttsGujarati;
  if (languageCode === 'hi-IN') return config.ttsHindi;
  if (languageCode.startsWith('en')) return config.ttsEnglish;
  return 'sarvam';
}
