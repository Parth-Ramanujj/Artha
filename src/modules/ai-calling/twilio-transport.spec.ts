import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { TwilioTransport } from './transports';
import { streamTwiml } from './twilio.client';

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
    this.readyState = WebSocket.CLOSED;
  }
  twilio(message: Record<string, unknown> | string): void {
    this.emit('message', Buffer.from(typeof message === 'string' ? message : JSON.stringify(message)));
  }
}

const start = (extra: Record<string, unknown> = {}) => ({
  event: 'start',
  start: { streamSid: 'MZ1', callSid: 'CA1', customParameters: { token: 'tok' }, ...extra },
});

describe('TwilioTransport', () => {
  it('reads connected, start, inbound media, marks and stop', () => {
    const ws = new FakeSocket();
    const transport = new TwilioTransport(ws as unknown as WebSocket);
    const events: unknown[] = [];
    transport.on('start', e => events.push(['start', e]));
    transport.on('audio', (a: Buffer) => events.push(['audio', a.length]));
    transport.on('mark', n => events.push(['mark', n]));
    transport.on('close', () => events.push(['close']));

    ws.twilio({ event: 'connected', protocol: 'Call' });
    ws.twilio(start());
    ws.twilio({ event: 'media', media: { track: 'inbound', payload: Buffer.alloc(160).toString('base64') } });
    ws.twilio({ event: 'media', media: { track: 'outbound', payload: Buffer.alloc(160).toString('base64') } });
    ws.twilio({ event: 'mark', mark: { name: 'm1' } });
    ws.twilio({ event: 'stop' });
    ws.twilio({ event: 'stop' });

    expect(events).toEqual([['start', { callSid: 'CA1', token: 'tok' }], ['audio', 160], ['mark', 'm1'], ['close']]);
  });

  it('ignores malformed and unknown messages', () => {
    const ws = new FakeSocket();
    const transport = new TwilioTransport(ws as unknown as WebSocket);
    const seen = jest.fn();
    transport.on('start', seen);
    transport.on('audio', seen);
    ws.twilio('not json');
    ws.twilio({ event: 'dtmf', dtmf: { digit: '1' } });
    ws.twilio({ event: 'media', media: {} });
    expect(seen).not.toHaveBeenCalled();
  });

  it('sends audio back in 200 ms mu-law frames tagged with the streamSid', () => {
    const ws = new FakeSocket();
    const transport = new TwilioTransport(ws as unknown as WebSocket);
    ws.twilio(start());
    transport.playAudio(Buffer.alloc(4000, 0x7f));
    transport.playAudio(Buffer.alloc(0));
    transport.mark('m2');
    transport.clearAudio();

    const media = ws.sent.filter(m => m.event === 'media');
    expect(media.map(m => Buffer.from((m.media as { payload: string }).payload, 'base64').length)).toEqual([
      1600, 1600, 800,
    ]);
    expect(ws.sent.every(m => m.streamSid === 'MZ1')).toBe(true);
    expect(ws.sent.slice(-2)).toEqual([
      { event: 'mark', mark: { name: 'm2' }, streamSid: 'MZ1' },
      { event: 'clear', streamSid: 'MZ1' },
    ]);
  });

  it('sends nothing before Twilio said which stream to use', () => {
    const ws = new FakeSocket();
    const transport = new TwilioTransport(ws as unknown as WebSocket);
    transport.playAudio(Buffer.alloc(320));
    ws.twilio(start({ streamSid: undefined }));
    transport.playAudio(Buffer.alloc(320));
    expect(ws.sent).toEqual([]);
  });

  it('hangs up through the Twilio API so the fallback message never plays after a real call', async () => {
    const ws = new FakeSocket();
    const endCall = jest.fn().mockResolvedValue(undefined);
    const transport = new TwilioTransport(ws as unknown as WebSocket, endCall);
    ws.twilio(start());
    transport.hangup();
    transport.hangup();
    await Promise.resolve();
    expect(endCall).toHaveBeenCalledTimes(1);
    expect(endCall).toHaveBeenCalledWith('CA1');
    expect(ws.closed).toBe(true);
  });

  it('keeps hanging up when the Twilio API call fails', async () => {
    const ws = new FakeSocket();
    const transport = new TwilioTransport(ws as unknown as WebSocket, () => Promise.reject(new Error('Twilio down')));
    ws.twilio(start());
    transport.hangup();
    await new Promise(resolve => setImmediate(resolve));
    expect(ws.closed).toBe(true);
  });
});

describe('stream TwiML', () => {
  it('is a bidirectional <Connect><Stream> with the token, status callback and a spoken fallback', () => {
    const xml = streamTwiml(
      'wss://h.example/api/ai-calling/stream',
      { token: 'a.b.c' },
      'https://h.example/s?callId=1&key=k',
    );
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://h.example/api/ai-calling/stream"',
      ),
    ).toBe(true);
    expect(xml).toContain('statusCallback="https://h.example/s?callId=1&amp;key=k" statusCallbackMethod="POST"');
    expect(xml).toContain('<Parameter name="token" value="a.b.c"/></Stream></Connect><Say>');
    expect(xml).not.toContain('<Start>');
  });
});
