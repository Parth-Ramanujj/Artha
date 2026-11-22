import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { TtsOptions, TtsStream, VoiceStyle } from './sarvam';
import { wsText } from './sarvam';

export interface ElevenOptions {
  apiKey: string;
  voiceId: string;
  model: string;
  /** Telephony format. The docs do not list ulaw_8000 for the WebSocket: verify on the first live call. */
  outputFormat: string;
  languageCode: string;
}

/** Quiet time after the last audio chunk before a queued sentence counts as spoken. */
const SPOKEN_QUIET_MS = 700;
/** ElevenLabs closes an idle socket; keep it open across a silent customer. */
const INACTIVITY_TIMEOUT_S = 120;

/**
 * Text-to-speech over ElevenLabs' stream-input WebSocket. Same contract as the Sarvam stream: say() queues
 * a sentence, 'audio' carries the audio, 'spoken' says the queued sentences are out, 'error' reports a failure.
 *
 * shortcut: ElevenLabs does not say when a flush is fully spoken, so 'spoken' fires after a quiet period
 * (SPOKEN_QUIET_MS). Voice settings are fixed at connect time, so setStyle() applies from the next connection.
 */
export class ElevenTts extends EventEmitter implements TtsStream {
  private ws!: WebSocket;
  private open = false;
  private closed = false;
  private awaiting = 0;
  private quiet?: NodeJS.Timeout;
  private readonly queued: string[] = [];
  private speed = 1;

  constructor(private readonly options: ElevenOptions) {
    super();
    this.connect();
  }

  private connect(): void {
    const params = new URLSearchParams({
      model_id: this.options.model,
      output_format: this.options.outputFormat,
      inactivity_timeout: String(INACTIVITY_TIMEOUT_S),
    });
    const url = `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.options.voiceId)}/stream-input?${params}`;
    const ws = new WebSocket(url, { headers: { 'xi-api-key': this.options.apiKey } });
    this.ws = ws;
    this.open = false;
    ws.on('open', () => {
      this.open = true;
      ws.send(
        JSON.stringify({
          text: ' ',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: this.speed, use_speaker_boost: true },
          generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
        }),
      );
      for (const text of this.queued.splice(0)) this.sendText(text);
    });
    ws.on('message', raw => {
      if (ws !== this.ws) return; // a socket replaced by reset() or close()
      this.onMessage(wsText(raw));
    });
    ws.on('error', err => {
      if (ws === this.ws && !this.closed) this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
    ws.on('close', () => {
      if (ws !== this.ws || this.closed) return;
      this.open = false;
      this.emit('error', new Error('ElevenLabs text-to-speech connection closed'));
    });
  }

  private onMessage(raw: string): void {
    let msg: { audio?: string | null; isFinal?: boolean; error?: string; message?: string };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (msg.error || msg.message) {
      this.emit('error', new Error(`ElevenLabs text-to-speech: ${msg.error ?? msg.message}`));
      return;
    }
    if (msg.audio) {
      this.emit('audio', Buffer.from(msg.audio, 'base64'));
      this.armSpoken();
    }
  }

  private armSpoken(): void {
    if (this.awaiting === 0) return;
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = setTimeout(() => {
      this.awaiting = 0;
      this.emit('spoken');
    }, SPOKEN_QUIET_MS);
  }

  private sendText(text: string): void {
    this.ws.send(JSON.stringify({ text: `${text} `, try_trigger_generation: true }));
    this.ws.send(JSON.stringify({ text: '', flush: true }));
  }

  say(text: string): void {
    const clean = text.trim();
    if (!clean || this.closed) return;
    this.awaiting++;
    if (this.open) this.sendText(clean);
    else this.queued.push(clean);
    this.armSpoken();
  }

  setStyle(style: VoiceStyle): void {
    this.speed = Math.min(1.2, Math.max(0.7, style.pace));
  }

  /** Barge-in: drop what is queued and start a fresh connection so the old audio never plays. */
  reset(): void {
    if (this.quiet) clearTimeout(this.quiet);
    this.queued.length = 0;
    this.awaiting = 0;
    if (this.closed) return;
    const old = this.ws;
    this.connect();
    old.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.quiet) clearTimeout(this.quiet);
    if (this.open) this.ws.send(JSON.stringify({ text: '' }));
    this.ws.close();
  }
}

/** Builds a Sarvam-compatible TTS factory call for ElevenLabs (the voice is picked by the router). */
export function elevenTts(opts: TtsOptions, eleven: Omit<ElevenOptions, 'apiKey' | 'languageCode'>): TtsStream {
  return new ElevenTts({ ...eleven, apiKey: opts.apiKey, languageCode: opts.languageCode });
}
