import { EventEmitter } from 'events';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import WebSocket from 'ws';
import { CallTransport } from './call-session';
import { wsText } from './sarvam';
import { createLogger } from '../../common/services/logger.service';

// Twilio plays what it is sent as soon as it arrives; 200 ms frames keep "clear" (barge-in) responsive.
const TWILIO_FRAME_BYTES = 1600;

/** Signs short-lived call ids, so only calls we placed (or test sessions we issued) can open a stream. */
export class CallTokens {
  private readonly secret = randomBytes(32);

  /** A key that only this server can make for a call id; put in URLs handed to Twilio for that call. */
  callKey(callId: string): string {
    return this.sign(`key.${callId}`);
  }

  isCallKey(callId: string | undefined, key: string | undefined): boolean {
    if (!callId || !key) return false;
    const expected = Buffer.from(this.callKey(callId));
    const given = Buffer.from(key);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

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

/**
 * Twilio bidirectional Media Stream (mu-law 8 kHz). Emits 'start' ({ callSid, token }) first.
 * Each stage of the stream is logged once (connected, start, first audio in, first audio out, stop),
 * so a call that stays silent shows where it stopped.
 */
export class TwilioTransport extends EventEmitter implements CallTransport {
  private readonly logger = createLogger('AiCallTwilioStream');
  private streamSid?: string;
  private callSid?: string;
  private closed = false;
  private framesIn = 0;
  private bytesOut = 0;
  private readonly openedAt = Date.now();

  /** endCall hangs up through the Twilio API, because closing the stream would run the TwiML after it. */
  constructor(
    private readonly ws: WebSocket,
    private readonly endCall?: (callSid: string) => Promise<void>,
  ) {
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
      case 'connected':
        this.stage('connected');
        break;
      case 'start':
        this.streamSid = msg.start?.streamSid ?? msg.streamSid;
        this.callSid = msg.start?.callSid;
        this.stage('start', { hasToken: Boolean(msg.start?.customParameters?.token) });
        if (!this.streamSid) this.logger.warn('Twilio start event had no streamSid; audio cannot be sent back');
        this.emit('start', { callSid: this.callSid, token: msg.start?.customParameters?.token });
        break;
      case 'media':
        if (msg.media?.payload && (msg.media.track ?? 'inbound') === 'inbound') {
          if (++this.framesIn === 1) this.stage('first caller audio');
          this.emit('audio', Buffer.from(msg.media.payload, 'base64'));
        }
        break;
      case 'mark':
        if (msg.mark?.name) this.emit('mark', msg.mark.name);
        break;
      case 'stop':
        this.stage('stop', { framesIn: this.framesIn, secondsOut: Math.round(this.bytesOut / 800) / 10 });
        this.onClose();
        break;
    }
  }

  private stage(name: string, extra: Record<string, unknown> = {}): void {
    this.logger.log(`Twilio stream ${name}`, {
      callSid: this.callSid,
      streamSid: this.streamSid,
      msSinceOpen: Date.now() - this.openedAt,
      ...extra,
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.closed && this.streamSid && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...payload, streamSid: this.streamSid }));
    }
  }

  playAudio(mulaw: Buffer): void {
    if (mulaw.length === 0) return;
    if (this.bytesOut === 0) this.stage('first agent audio');
    this.bytesOut += mulaw.length;
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

  hangup(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.callSid && this.endCall) {
      this.endCall(this.callSid).catch(err =>
        this.logger.warn(`Could not hang up call ${this.callSid}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
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
