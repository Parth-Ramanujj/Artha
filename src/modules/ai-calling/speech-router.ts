import { createLogger } from '../../common/services/logger.service';
import { DeepgramStt } from './deepgram-stt';
import { elevenTts } from './elevenlabs-tts';
import { ProviderConfig, ttsProviderFor } from './provider-settings';
import { sarvamSpeech, type SpeechFactory, type SttOptions, type TtsOptions } from './sarvam';

const log = createLogger('AiCallSpeech');

export interface SpeechKeys {
  sarvam: string | null;
  deepgram: string | null;
  elevenlabs: string | null;
}

/**
 * Speech engines for one call, chosen from the saved settings. A provider with no key falls back to
 * Sarvam (the proven engine) and says so in the log, so a missing key never silently drops a call.
 */
export function speechFactoryFor(config: ProviderConfig, keys: SpeechKeys): SpeechFactory {
  const sarvamKey = keys.sarvam ?? '';
  return {
    stt(options: SttOptions) {
      if (config.stt === 'deepgram' && keys.deepgram) return new DeepgramStt({ ...options, apiKey: keys.deepgram });
      if (config.stt === 'deepgram') log.warn('Deepgram chosen but DEEPGRAM_API_KEY is missing; using Sarvam');
      return sarvamSpeech.stt({ ...options, apiKey: sarvamKey });
    },
    tts(options: TtsOptions) {
      const engine = ttsProviderFor(config, options.languageCode);
      if (engine === 'elevenlabs' && keys.elevenlabs && config.elevenVoiceId) {
        return elevenTts(
          { ...options, apiKey: keys.elevenlabs },
          {
            voiceId: config.elevenVoiceId,
            model: config.elevenModel || 'eleven_multilingual_v2',
            outputFormat: config.elevenOutputFormat || 'ulaw_8000',
          },
        );
      }
      if (engine === 'elevenlabs') {
        log.warn(`ElevenLabs chosen for ${options.languageCode} but the key or voice id is missing; using Sarvam`);
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
    throw new Error(`The language model refused the request (HTTP ${response.status}) ${detail.slice(0, 200)}`);
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
