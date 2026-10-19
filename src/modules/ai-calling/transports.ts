import { EventEmitter } from 'events';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import WebSocket from 'ws';
import { CallTransport } from './call-session';
import { wsText } from './sarvam';

// Twilio plays what it is sent as soon as it arrives; 200 ms frames keep "clear" (barge-in) responsive.
const TWILIO_FRAME_BYTES = 1600;

/** Signs short-lived call ids, so only calls we placed (or test sessions we issued) can open a stream. */
export class CallTokens {
  private readonly secret = randomBytes(32);

  issue(callId: string, ttlMs = 10 * 60 * 1000): string {
    const expires = Date.now() + ttlMs;
    return `${callId}.${expires}.${this.sign(`${callId}.${expires}`)}`;
  }

  /** The call id, or null when the token is forged or expired. */
  verify(token: string | undefined): string | null {
    const [callId, expires, signature] = (token ?? '').split('.');
    if (!callId || !expires || !signature || Number(expires) < Date.now()) return null;
    const expected = Buffer.from(this.sign(`${callId}.${expires}`));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given) ? callId : null;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}

/** Twilio bidirectional Media Stream (mu-law 8 kHz). Emits 'start' ({ callSid, token }) first. */
export class TwilioTransport extends EventEmitter implements CallTransport {
  private streamSid?: string;
  private closed = false;

  constructor(private readonly ws: WebSocket) {
    super();
    ws.on('message', raw => this.onMessage(wsText(raw)));
    ws.on('close', () => this.onClose());
    ws.on('error', () => this.onClose());
  }

  private onMessage(raw: string): void {
    let msg: {
      event?: string;
      streamSid?: string;
      start?: { callSid?: string; streamSid?: string; customParameters?: Record<string, string> };
      media?: { payload?: string; track?: string };
      mark?: { name?: string };
    };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    switch (msg.event) {
      case 'start':
        this.streamSid = msg.start?.streamSid ?? msg.streamSid;
        this.emit('start', { callSid: msg.start?.callSid, token: msg.start?.customParameters?.token });
        break;
      case 'media':
        if (msg.media?.payload && (msg.media.track ?? 'inbound') === 'inbound') {
          this.emit('audio', Buffer.from(msg.media.payload, 'base64'));
        }
        break;
      case 'mark':
        if (msg.mark?.name) this.emit('mark', msg.mark.name);
        break;
      case 'stop':
        this.onClose();
        break;
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.closed && this.streamSid && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...payload, streamSid: this.streamSid }));
    }
  }

  playAudio(mulaw: Buffer): void {
    for (let i = 0; i < mulaw.length; i += TWILIO_FRAME_BYTES) {
      this.send({ event: 'media', media: { payload: mulaw.subarray(i, i + TWILIO_FRAME_BYTES).toString('base64') } });
    }
  }

  clearAudio(): void {
    this.send({ event: 'clear' });
  }

  mark(name: string): void {
    this.send({ event: 'mark', mark: { name } });
  }

  /** Closing the stream ends the <Connect> verb; with nothing after it, Twilio hangs up the call. */
  hangup(): void {
    if (this.closed) return;
    this.closed = true;
    this.ws.close();
  }

  private onClose(): void {
    const wasOpen = !this.closed;
    this.closed = true;
    if (wasOpen) this.emit('close');
  }
}

/**
 * Dashboard "test call": the browser sends mic audio already encoded as 8 kHz mu-law and plays what
 * it gets back, echoing marks when playback reaches them, so the same session code runs unchanged.
 * Messages are JSON: {type:'start',token} | {type:'audio',audio} | {type:'mark',name} | {type:'hangup'}.
 */
export class BrowserTransport extends EventEmitter implements CallTransport {
  private closed = false;

  constructor(private readonly ws: WebSocket) {
    super();
    ws.on('message', raw => this.onMessage(wsText(raw)));
    ws.on('close', () => this.onClose());
    ws.on('error', () => this.onClose());
  }

  private onMessage(raw: string): void {
    let msg: { type?: string; token?: string; audio?: string; name?: string };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === 'start') this.emit('start', { token: msg.token });
    else if (msg.type === 'audio' && msg.audio) this.emit('audio', Buffer.from(msg.audio, 'base64'));
    else if (msg.type === 'mark' && msg.name) this.emit('mark', msg.name);
    else if (msg.type === 'hangup') this.onClose();
  }

  notify(event: Record<string, unknown>): void {
    if (!this.closed && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }

  playAudio(mulaw: Buffer): void {
    this.notify({ type: 'audio', audio: mulaw.toString('base64') });
  }

  clearAudio(): void {
    this.notify({ type: 'clear' });
  }

  mark(name: string): void {
    this.notify({ type: 'mark', name });
  }

  hangup(): void {
    if (this.closed) return;
    this.notify({ type: 'hangup' });
    this.closed = true;
    this.ws.close();
  }

  private onClose(): void {
    const wasOpen = !this.closed;
    this.closed = true;
    if (wasOpen) this.emit('close');
  }
}
