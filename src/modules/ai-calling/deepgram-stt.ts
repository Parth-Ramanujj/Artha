import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { FinalTranscript, SttOptions, SttStream } from './sarvam';
import { wsText } from './sarvam';

const DEEPGRAM_WS = 'wss://api.deepgram.com/v1/listen';
// Deepgram drops a silent socket after about 10 s; a KeepAlive every 8 s keeps a quiet caller connected.
const KEEPALIVE_MS = 8_000;
const MAX_RECONNECTS = 3;

/**
 * Deepgram live speech recognition for phone audio (mu-law, 8 kHz). Emits the same events as the Sarvam
 * stream: speech_start, speech_end, final (one per utterance) and error.
 *
 * shortcut: "auto" language uses nova-3 multilingual (Hindi and Gujarati are in its set); a fixed language
 * code is passed through. Verify live before relying on it: the KeepAlive/CloseStream bodies come from
 * Deepgram's schema, not a published example.
 */
export class DeepgramStt extends EventEmitter implements SttStream {
  private ws!: WebSocket;
  private readonly pending: Buffer[] = [];
  private keepalive?: NodeJS.Timeout;
  private closed = false;
  private reconnects = 0;
  private lastError?: Error;
  /** Finals of one utterance, joined when Deepgram marks the utterance as done. */
  private parts: string[] = [];

  constructor(private readonly options: SttOptions) {
    super();
    this.connect();
  }

  private connect(): void {
    const language = this.options.languageCode;
    const params = new URLSearchParams({
      model: 'nova-3',
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      interim_results: 'false',
      vad_events: 'true',
      endpointing: String(this.options.silenceMs ?? 500),
      utterance_end_ms: '1000',
      smart_format: 'true',
    });
    if (!language || language === 'auto') params.set('language', 'multi');
    else params.set('language', language.split('-')[0]);

    const ws = new WebSocket(`${DEEPGRAM_WS}?${params.toString()}`, {
      headers: { Authorization: `Token ${this.options.apiKey}` },
    });
    this.ws = ws;
    ws.on('open', () => {
      for (const chunk of this.pending.splice(0)) ws.send(chunk);
      this.keepalive = setInterval(() => ws.send(JSON.stringify({ type: 'KeepAlive' })), KEEPALIVE_MS);
    });
    ws.on('message', raw => this.onMessage(wsText(raw)));
    ws.on('error', err => (this.lastError = err instanceof Error ? err : new Error(String(err))));
    ws.on('unexpected-response', (_req, res) => {
      this.closed = true;
      this.emit('error', new Error(`Deepgram speech-to-text refused the connection (HTTP ${res.statusCode})`));
    });
    ws.on('close', () => {
      if (this.keepalive) clearInterval(this.keepalive);
      if (this.closed) return;
      if (this.reconnects++ < MAX_RECONNECTS) {
        this.connect();
        return;
      }
      const reason = this.lastError ? `: ${this.lastError.message}` : '';
      this.emit('error', new Error(`Deepgram speech-to-text connection closed${reason}`));
    });
  }

  /** Handles one server message (exported for tests through onMessage). */
  onMessage(raw: string): void {
    let msg: {
      type?: string;
      is_final?: boolean;
      speech_final?: boolean;
      channel?: { alternatives?: Array<{ transcript?: string; confidence?: number }> };
      err_msg?: string;
    };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'SpeechStarted':
        this.emit('speech_start');
        return;
      case 'UtteranceEnd':
        this.flush();
        this.emit('speech_end');
        return;
      case 'Results': {
        const alt = msg.channel?.alternatives?.[0];
        const text = (alt?.transcript ?? '').trim();
        if (text && msg.is_final) this.parts.push(text);
        if (msg.speech_final) {
          this.flush(alt?.confidence);
          this.emit('speech_end');
        }
        return;
      }
      case 'Error':
        this.emit('error', new Error(`Deepgram speech-to-text: ${msg.err_msg ?? 'error'}`));
        return;
      default:
        return;
    }
  }

  private flush(confidence?: number): void {
    if (this.parts.length === 0) return;
    const text = this.parts.join(' ').trim();
    this.parts = [];
    const final: FinalTranscript = { text, language: this.options.languageCode, confidence };
    this.emit('final', final);
  }

  send(audio: Buffer): void {
    if (this.closed) return;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(audio);
    else this.pending.push(audio);
  }

  close(): void {
    this.closed = true;
    if (this.keepalive) clearInterval(this.keepalive);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    this.ws.close();
  }
}
