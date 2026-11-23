import { EventEmitter } from 'events';
import { createLogger } from '../../common/services/logger.service';
import { DeepgramStt } from './deepgram-stt';
import { elevenTts } from './elevenlabs-tts';
import { ProviderConfig, ttsProviderFor } from './provider-settings';
import { sarvamSpeech, type SpeechFactory, type SttOptions, type TtsOptions, type TtsStream, type VoiceStyle } from './sarvam';
import { aiCallingLog } from './ai-calling-log.service';

const log = createLogger('AiCallSpeech');

export interface SpeechKeys {
  sarvam: string | null;
  deepgram: string | null;
  elevenlabs: string | null;
}

/**
 * Resilient TTS stream wrapper: if the primary TTS provider (e.g. ElevenLabs) encounters an error
 * (invalid voice ID, quota limit, socket error), it automatically logs a warning, falls back to
 * Sarvam TTS, and replays any pending spoken text so the live call or test call is never dropped.
 */
export class ResilientTtsStream extends EventEmitter implements TtsStream {
  private active: TtsStream;
  private hasFallenBack = false;
  private currentStyle?: VoiceStyle;
  private pending: string[] = [];

  constructor(
    private readonly primary: TtsStream,
    private readonly fallbackFactory: () => TtsStream,
    private readonly onFallback: (err: Error) => void,
  ) {
    super();
    this.active = primary;
    this.bind(primary, true);
  }

  private bind(stream: TtsStream, isPrimary: boolean): void {
    stream.on('audio', (chunk: Buffer) => this.emit('audio', chunk));
    stream.on('spoken', () => {
      this.pending = [];
      this.emit('spoken');
    });
    stream.on('error', (err: Error) => {
      if (isPrimary && !this.hasFallenBack) {
        this.hasFallenBack = true;
        try {
          stream.removeAllListeners();
          stream.close();
        } catch {
          // ignore
        }
        this.onFallback(err);
        try {
          const fallback = this.fallbackFactory();
          this.active = fallback;
          if (this.currentStyle) fallback.setStyle(this.currentStyle);
          this.bind(fallback, false);
          for (const text of this.pending) {
            fallback.say(text);
          }
          return;
        } catch (fErr) {
          const combined = fErr instanceof Error ? fErr : new Error(String(fErr));
          this.emit('error', combined);
          return;
        }
      }
      if (!isPrimary) {
        this.emit('error', err);
      }
    });
  }

  say(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    this.pending.push(clean);
    this.active.say(clean);
  }

  setStyle(style: VoiceStyle): void {
    this.currentStyle = style;
    this.active.setStyle(style);
  }

  reset(): void {
    this.pending = [];
    this.active.reset();
  }

  close(): void {
    this.pending = [];
    this.active.close();
  }
}

/**
 * Speech engines for one call, chosen from the saved settings. A provider with no key falls back to
 * Sarvam (the proven engine) and says so in the log, so a missing key never silently drops a call.
 */
export function speechFactoryFor(
  config: ProviderConfig,
  keys: SpeechKeys,
  onWarning?: (message: string) => void,
): SpeechFactory {
  const sarvamKey = keys.sarvam ?? '';
  return {
    stt(options: SttOptions) {
      if (config.stt === 'deepgram' && keys.deepgram) return new DeepgramStt({ ...options, apiKey: keys.deepgram });
      if (config.stt === 'deepgram') {
        const warn = 'Deepgram chosen but DEEPGRAM_API_KEY is missing; using Sarvam';
        log.warn(warn);
        aiCallingLog.warn('stt', warn);
        onWarning?.(warn);
      }
      return sarvamSpeech.stt({ ...options, apiKey: sarvamKey });
    },
    tts(options: TtsOptions) {
      const engine = ttsProviderFor(config, options.languageCode);
      if (engine === 'elevenlabs' && keys.elevenlabs && config.elevenVoiceId) {
        const primary = elevenTts(
          { ...options, apiKey: keys.elevenlabs },
          {
            voiceId: config.elevenVoiceId,
            model: config.elevenModel || 'eleven_turbo_v2_5',
            outputFormat: config.elevenOutputFormat || 'ulaw_8000',
          },
        );
        return new ResilientTtsStream(
          primary,
          () => sarvamSpeech.tts({ ...options, apiKey: sarvamKey }),
          err => {
            const warnMsg = `ElevenLabs text-to-speech failed (${err.message}); falling back to Sarvam TTS`;
            log.warn(warnMsg);
            aiCallingLog.warn(
              'tts',
              `ElevenLabs text-to-speech failed: ${err.message}. Automatically fell back to Sarvam TTS to preserve call.`,
              { details: { error: err.message, voiceId: config.elevenVoiceId, language: options.languageCode } },
            );
            onWarning?.(`ElevenLabs TTS failed (${err.message}). Using Sarvam TTS.`);
          },
        );
      }
      if (engine === 'elevenlabs') {
        const warn = `ElevenLabs chosen for ${options.languageCode} but the key or voice id is missing; using Sarvam`;
        log.warn(warn);
        aiCallingLog.warn('tts', warn, {
          details: { language: options.languageCode, voiceId: config.elevenVoiceId },
        });
        onWarning?.(warn);
      }
      return sarvamSpeech.tts({ ...options, apiKey: sarvamKey });
    },
  };
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Streams a reply from any OpenAI-compatible chat endpoint (OpenAI, Together, a self-hosted gateway, ...).
 * Groq keeps its own key pool in AiService; this is the alternative picked in the provider settings.
 */
export async function* openAiCompatibleStream(
  endpoint: { baseUrl: string; apiKey: string; model: string },
  messages: ChatTurn[],
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  let url = endpoint.baseUrl.trim().replace(/\/+$/, '');
  if (!url.endsWith('/chat/completions')) {
    url = `${url}/chat/completions`;
  }
  const model = endpoint.model || (url.includes('openai.com') ? 'gpt-4o-mini' : 'llama-3.3-70b-versatile');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${endpoint.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: options.maxTokens ?? 400,
      temperature: options.temperature ?? 0.7,
    }),
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    const errText = `The language model refused the request (HTTP ${response.status}) ${detail.slice(0, 200)}`;
    aiCallingLog.error('llm', errText, { details: { status: response.status, url, detail: detail.slice(0, 500) } });
    throw new Error(errText);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const piece = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta
          ?.content;
        if (piece) yield piece;
      } catch {
        // A malformed chunk is skipped; the stream carries on.
      }
    }
  }
}
