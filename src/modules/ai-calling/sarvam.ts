import { EventEmitter } from 'events';
import WebSocket from 'ws';

const SARVAM_WS = 'wss://api.sarvam.ai';
// Sarvam closes an idle socket after about a minute; a customer may stay silent that long.
const KEEPALIVE_MS = 20_000;
// A dropped socket is reopened this many times per call before the call is given up.
const MAX_RECONNECTS = 3;

export interface FinalTranscript {
  text: string;
  language?: string;
  confidence?: number;
}

/**
 * Live speech recognition for one call. Emits 'speech_start' / 'speech_end' (voice activity),
 * 'final' (FinalTranscript, one per utterance) and 'error' (Error).
 */
export interface SttStream extends EventEmitter {
  /** 8 kHz mu-law audio from the caller. */
  send(audio: Buffer): void;
  close(): void;
}

export interface VoiceStyle {
  pace: number;
  /** Expressiveness, 0.01–1. */
  temperature: number;
}

/**
 * Speech synthesis for one call. say() queues a sentence; emits 'audio' (8 kHz mu-law Buffer) and
 * 'spoken' once the audio for every queued sentence has arrived, and 'error' (Error).
 */
export interface TtsStream extends EventEmitter {
  say(text: string): void;
  /** Changes how the next sentences sound (pace, expressiveness). */
  setStyle(style: VoiceStyle): void;
  /** Drops queued speech (barge-in); audio for it is never emitted. */
  reset(): void;
  close(): void;
}

export interface SttOptions {
  apiKey: string;
  /** 'auto' detects Gujarati/Hindi/English per utterance. */
  languageCode?: string;
  silenceMs?: number;
}

export interface TtsOptions {
  apiKey: string;
  languageCode: string;
  speaker: string;
  pace?: number;
  temperature?: number;
  model?: string;
}

/** Creates the speech streams; replaced by fakes in tests. */
export interface SpeechFactory {
  stt(options: SttOptions): SttStream;
  tts(options: TtsOptions): TtsStream;
}

/** Text of a websocket message, whichever buffer shape it arrived in. */
export function wsText(raw: WebSocket.RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf-8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf-8');
  return Buffer.from(raw).toString('utf-8');
}

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

class SarvamStt extends EventEmitter implements SttStream {
  private ws!: WebSocket;
  private readonly pending: Buffer[] = [];
  private keepalive?: NodeJS.Timeout;
  private closed = false;
  private reconnects = 0;
  private lastError?: Error;

  constructor(private readonly options: SttOptions) {
    super();
    this.connect();
  }

  private connect(): void {
    const params = new URLSearchParams({
      language_code: this.options.languageCode ?? 'auto',
      model: 'saaras:v3-realtime',
      encoding: 'mulaw',
      sample_rate: '8000',
      stream_type: 'fast',
      silence_duration_ms: String(this.options.silenceMs ?? 500),
    });
    const ws = new WebSocket(`${SARVAM_WS}/speech-to-text-realtime/ws?${params.toString()}`, {
      headers: { 'Api-Subscription-Key': this.options.apiKey },
    });
    this.ws = ws;
    ws.on('open', () => {
      for (const chunk of this.pending.splice(0)) this.write(chunk);
      this.keepalive = setInterval(() => ws.send(JSON.stringify({ event: 'ping' })), KEEPALIVE_MS);
    });
    ws.on('message', raw => this.onMessage(wsText(raw)));
    // A network error is always followed by 'close', where the socket is reopened.
    ws.on('error', err => (this.lastError = errorFrom(err)));
    ws.on('unexpected-response', (_req, res) => {
      this.closed = true;
      this.emit('error', new Error(`Sarvam speech-to-text refused the connection (HTTP ${res.statusCode})`));
    });
    ws.on('close', () => {
      if (this.keepalive) clearInterval(this.keepalive);
      if (this.closed) return;
      if (this.reconnects++ < MAX_RECONNECTS) {
        this.connect();
        return;
      }
      const reason = this.lastError ? `: ${this.lastError.message}` : '';
      this.emit('error', new Error(`Sarvam speech-to-text connection closed${reason}`));
    });
  }

  private onMessage(raw: string): void {
    let msg: {
      event?: string;
      text?: string;
      language?: string;
      language_confidence?: number;
      message?: string;
      is_fatal?: boolean;
    };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    switch (msg.event) {
      case 'vad.speech_start':
        this.emit('speech_start');
        break;
      case 'vad.speech_end':
        this.emit('speech_end');
        break;
      case 'transcript.final':
        this.emit('final', {
          text: (msg.text ?? '').trim(),
          language: msg.language,
          confidence: msg.language_confidence,
        });
        break;
      case 'error':
        if (msg.is_fatal) this.emit('error', new Error(`Sarvam speech-to-text: ${msg.message ?? 'error'}`));
        break;
    }
  }

  private write(audio: Buffer): void {
    this.ws.send(JSON.stringify({ event: 'audio_input', audio: audio.toString('base64') }));
  }

  send(audio: Buffer): void {
    if (this.closed) return;
    if (this.ws.readyState === WebSocket.OPEN) this.write(audio);
    else if (this.ws.readyState === WebSocket.CONNECTING && this.pending.length < 500) this.pending.push(audio);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.keepalive) clearInterval(this.keepalive);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event: 'end' }));
    this.ws.on('error', () => undefined);
    this.ws.close();
  }
}

/**
 * One Bulbul streaming socket. A reset (barge-in) swaps in a fresh socket, because audio for text
 * already sent would otherwise keep arriving after the customer interrupted.
 */
class SarvamTts extends EventEmitter implements TtsStream {
  private ws!: WebSocket;
  private queue: string[] = [];
  private awaitingFinals = 0;
  private closed = false;
  private keepalive?: NodeJS.Timeout;
  private style: VoiceStyle;
  /** The style changed while a sentence was still being voiced; applied before the next one. */
  private styleDirty = false;
  private reconnects = 0;
  private lastError?: Error;

  constructor(private readonly options: TtsOptions) {
    super();
    this.style = { pace: options.pace ?? 1, temperature: options.temperature ?? 0.6 };
    this.connect();
  }

  private sendConfig(): void {
    this.styleDirty = false;
    this.ws.send(
      JSON.stringify({
        type: 'config',
        data: {
          language_code: this.options.languageCode,
          speaker: this.options.speaker,
          pace: this.style.pace,
          temperature: this.style.temperature,
          speech_sample_rate: 8000,
          output_audio_codec: 'mulaw',
          min_buffer_size: 30,
          max_chunk_length: 150,
        },
      }),
    );
  }

  private connect(): void {
    const params = new URLSearchParams({
      model: this.options.model ?? 'bulbul:v4-flash',
      send_completion_event: 'true',
    });
    const ws = new WebSocket(`${SARVAM_WS}/text-to-speech/ws?${params.toString()}`, {
      headers: { 'Api-Subscription-Key': this.options.apiKey },
    });
    this.ws = ws;
    ws.on('open', () => {
      this.sendConfig();
      for (const text of this.queue.splice(0)) this.send(text);
      this.keepalive = setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), KEEPALIVE_MS);
    });
    ws.on('message', raw => {
      if (ws !== this.ws) return;
      let msg: { type?: string; data?: { audio?: string; event_type?: string; message?: string } };
      try {
        msg = JSON.parse(wsText(raw)) as typeof msg;
      } catch {
        return;
      }
      if (msg.type === 'audio' && msg.data?.audio) {
        this.emit('audio', Buffer.from(msg.data.audio, 'base64'));
      } else if (msg.type === 'event' && msg.data?.event_type === 'final') {
        if (this.awaitingFinals === 0) return;
        this.awaitingFinals--;
        if (this.awaitingFinals === 0) this.emit('spoken');
      } else if (msg.type === 'error') {
        this.emit('error', new Error(`Sarvam text-to-speech: ${msg.data?.message ?? 'error'}`));
      }
    });
    // A network error is always followed by 'close', where the socket is reopened.
    ws.on('error', err => {
      if (ws === this.ws) this.lastError = errorFrom(err);
    });
    ws.on('unexpected-response', (_req, res) => {
      if (ws !== this.ws) return;
      this.closed = true;
      this.emit('error', new Error(`Sarvam text-to-speech refused the connection (HTTP ${res.statusCode})`));
    });
    ws.on('close', () => {
      if (ws !== this.ws) return;
      if (this.keepalive) clearInterval(this.keepalive);
      if (this.closed) return;
      if (this.reconnects++ >= MAX_RECONNECTS) {
        const reason = this.lastError ? `: ${this.lastError.message}` : '';
        this.emit('error', new Error(`Sarvam text-to-speech connection closed${reason}`));
        return;
      }
      // Speech lost with the socket is skipped rather than repeated; the call carries on.
      const lost = this.awaitingFinals > 0;
      this.awaitingFinals = 0;
      this.connect();
      if (lost) this.emit('spoken');
    });
  }

  private send(text: string): void {
    if (this.styleDirty && this.awaitingFinals === 0) this.sendConfig();
    this.awaitingFinals++;
    this.ws.send(JSON.stringify({ type: 'text', data: { text } }));
    this.ws.send(JSON.stringify({ type: 'flush' }));
  }

  say(text: string): void {
    if (this.closed || !text.trim()) return;
    if (this.ws.readyState === WebSocket.OPEN) this.send(text);
    else this.queue.push(text);
  }

  setStyle(style: VoiceStyle): void {
    if (style.pace === this.style.pace && style.temperature === this.style.temperature) return;
    this.style = style;
    // Re-sending the config flushes text the engine still holds, so only do it between sentences.
    if (this.ws.readyState === WebSocket.OPEN && this.awaitingFinals === 0) this.sendConfig();
    else this.styleDirty = true;
  }

  reset(): void {
    if (this.closed) return;
    const old = this.ws;
    if (this.keepalive) clearInterval(this.keepalive);
    this.queue = [];
    this.awaitingFinals = 0;
    this.connect();
    old.removeAllListeners('message');
    old.on('error', () => undefined);
    old.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.keepalive) clearInterval(this.keepalive);
    this.ws.on('error', () => undefined);
    this.ws.close();
  }
}

export const sarvamSpeech: SpeechFactory = {
  stt: options => new SarvamStt(options),
  tts: options => new SarvamTts(options),
};
