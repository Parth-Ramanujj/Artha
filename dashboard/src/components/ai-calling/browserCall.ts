import type { AiCallTurn } from '../../services/api';

const PHONE_RATE = 8000;
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

/** G.711 mu-law, the same 8 kHz phone audio Twilio uses, so the agent hears the browser like a call. */
export function encodeMulaw(sample: number): number {
  let s = Math.max(-1, Math.min(1, sample)) * 32767;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  s = Math.min(s, MULAW_CLIP) + MULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function decodeMulaw(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const magnitude = (((mantissa << 3) + MULAW_BIAS) << exponent) - MULAW_BIAS;
  return (sign ? -magnitude : magnitude) / 32768;
}

/** Averages each window of input samples down to 8 kHz (a cheap low-pass that avoids aliasing hiss). */
export function downsample(input: Float32Array, fromRate: number): Float32Array {
  const ratio = fromRate / PHONE_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type BrowserCallState = 'connecting' | 'live' | 'ended' | 'error';

export interface BrowserCallHandlers {
  onState: (state: BrowserCallState, detail?: string) => void;
  onTurn: (turn: AiCallTurn) => void;
  onAgentSpeaking: (speaking: boolean) => void;
  onLevel?: (level: number) => void;
}

/**
 * A test call from the dashboard: microphone in, agent voice out, over the same protocol a phone call
 * uses on the server. Playback is scheduled back to back; a "mark" is echoed once playback reaches it.
 */
export class BrowserCall {
  private ws?: WebSocket;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private processor?: ScriptProcessorNode;
  private source?: MediaStreamAudioSourceNode;
  private playing: AudioBufferSourceNode[] = [];
  private playUntil = 0;
  private markTimers: number[] = [];
  private ended = false;

  private readonly url: string;
  private readonly token: string;
  private readonly handlers: BrowserCallHandlers;

  constructor(url: string, token: string, handlers: BrowserCallHandlers) {
    this.url = url;
    this.token = token;
    this.handlers = handlers;
  }

  async start(): Promise<void> {
    this.handlers.onState('connecting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.fail('Microphone permission was denied');
      return;
    }
    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: 'start', token: this.token }));
      this.startMic();
      this.handlers.onState('live');
    };
    this.ws.onmessage = event => this.onMessage(String(event.data));
    this.ws.onerror = () => this.fail('Could not reach the calling server');
    this.ws.onclose = () => this.finish();
  }

  private startMic(): void {
    if (!this.ctx || !this.stream) return;
    const ctx = this.ctx;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.processor = ctx.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = e => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const low = downsample(input, ctx.sampleRate);
      const bytes = new Uint8Array(low.length);
      let peak = 0;
      for (let i = 0; i < low.length; i++) {
        bytes[i] = encodeMulaw(low[i]);
        peak = Math.max(peak, Math.abs(low[i]));
      }
      this.handlers.onLevel?.(peak);
      this.ws.send(JSON.stringify({ type: 'audio', audio: toBase64(bytes) }));
    };
    this.source.connect(this.processor);
    // A ScriptProcessor only runs while connected to the output; it writes silence there.
    this.processor.connect(ctx.destination);
  }

  private onMessage(raw: string): void {
    let msg: { type?: string; audio?: string; name?: string; turn?: AiCallTurn; reason?: string };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === 'audio' && msg.audio) this.play(fromBase64(msg.audio));
    else if (msg.type === 'clear') this.clear();
    else if (msg.type === 'mark' && msg.name) this.echoMarkWhenPlayed(msg.name);
    else if (msg.type === 'turn' && msg.turn) this.handlers.onTurn(msg.turn);
    else if (msg.type === 'ended') this.handlers.onState('ended', msg.reason);
  }

  private play(mulaw: Uint8Array): void {
    if (!this.ctx || mulaw.length === 0) return;
    const buffer = this.ctx.createBuffer(1, mulaw.length, PHONE_RATE);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < mulaw.length; i++) data[i] = decodeMulaw(mulaw[i]);
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.ctx.destination);
    const startAt = Math.max(this.ctx.currentTime + 0.02, this.playUntil);
    node.start(startAt);
    this.playUntil = startAt + buffer.duration;
    this.playing.push(node);
    this.handlers.onAgentSpeaking(true);
    node.onended = () => {
      this.playing = this.playing.filter(n => n !== node);
      if (this.playing.length === 0) this.handlers.onAgentSpeaking(false);
    };
  }

  private clear(): void {
    for (const node of this.playing) {
      try {
        node.stop();
      } catch {
        // already finished
      }
    }
    this.playing = [];
    this.playUntil = 0;
    this.handlers.onAgentSpeaking(false);
  }

  private echoMarkWhenPlayed(name: string): void {
    const waitMs = this.ctx ? Math.max(0, (this.playUntil - this.ctx.currentTime) * 1000) : 0;
    const timer = window.setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'mark', name }));
    }, waitMs);
    this.markTimers.push(timer);
  }

  hangup(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'hangup' }));
    this.finish();
  }

  private fail(message: string): void {
    if (this.ended) return;
    this.handlers.onState('error', message);
    this.failed = true;
    this.finish();
  }

  private failed = false;

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    for (const t of this.markTimers) window.clearTimeout(t);
    this.clear();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    void this.ctx?.close();
    if (!this.failed) this.handlers.onState('ended');
  }
}
