import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { EventEmitter } from 'events';
import { DataSource } from 'typeorm';
import WebSocket from 'ws';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiCall, AiCallOutcome, AiCallStatus } from './entities/ai-call.entity';
import { AiCallBatch, AiCallBatchStatus } from './entities/ai-call-batch.entity';
import { AiCallingSetting } from './entities/ai-calling-setting.entity';
import { Conversation, ConversationStatus } from '../conversation/entities/conversation.entity';
import { ContactConsent, ConsentStatus } from '../campaign/entities/contact-consent.entity';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { Lead } from '../workflow/entities/lead.entity';
import { Agent } from '../workflow/entities/agent.entity';
import { LeadService } from '../workflow/lead.service';
import { AiCallingService } from './ai-calling.service';
import { CallOutcomeService } from './call-outcome.service';
import { CallRunnerService } from './call-runner.service';
import { DialerService } from './dialer.service';
import { MediaGatewayService, BROWSER_STREAM_PATH } from './media-gateway.service';
import { SpeechFactory, SttStream, TtsStream, wsText } from './sarvam';
import { twilioSignature } from './twilio.client';

class FakeStt extends EventEmitter implements SttStream {
  send(): void {}
  close(): void {}
}
class FakeTts extends EventEmitter implements TtsStream {
  say(text: string): void {
    setImmediate(() => {
      this.emit('audio', Buffer.from(text));
      this.emit('spoken');
    });
  }
  reset(): void {}
  close(): void {}
}

describe('AI calling flow (SQLite)', () => {
  let ds: DataSource;
  let calling: AiCallingService;
  let outcome: CallOutcomeService;
  let runner: CallRunnerService;
  let dialer: DialerService;
  let ai: { complete: jest.Mock; streamComplete: jest.Mock };
  let messages: { sendText: jest.Mock };
  let fetchMock: jest.SpyInstance;
  let stt: FakeStt;
  const env = { ...process.env };
  const BIZ = 'biz-1';
  // Tomorrow 12:00 IST: always after the calls were queued, and inside calling hours.
  const tomorrowUtc = (h: number, m: number) => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, h, m));
  };
  const NOON_IST = tomorrowUtc(6, 30);

  beforeEach(async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC1';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_PHONE_NUMBER = '+15550001111';
    process.env.SARVAM_API_KEY = 'sk_test';
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [VoiceAgent, AiCall, AiCallBatch, AiCallingSetting, Conversation, ContactConsent, Session, Lead, Agent],
      synchronize: true,
    });
    await ds.initialize();
    const repo = <T extends object>(e: new () => T) => ds.getRepository(e);
    calling = new AiCallingService(
      repo(VoiceAgent),
      repo(AiCall),
      repo(AiCallBatch),
      repo(AiCallingSetting),
      repo(Conversation),
      repo(ContactConsent),
    );
    ai = {
      complete: jest.fn().mockResolvedValue({
        content:
          '{"summary":"Wants family health cover.","sentiment":"positive","outcome":"interested","isVerifiedLead":true,"temperature":"hot","extracted":{"name":"Ramesh","interest":"insurance","need":"family health cover","pincode":"380015","callbackTime":"tomorrow 5pm"}}',
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      streamComplete: jest.fn(async function* () {
        yield 'જી, આભાર! આવજો. [[END_CALL]]';
      }),
    };
    messages = { sendText: jest.fn().mockResolvedValue({ id: 'm1' }) };
    const leads = new LeadService(repo(Lead), repo(Agent));
    outcome = new CallOutcomeService(
      repo(AiCall),
      repo(AiCallBatch),
      repo(VoiceAgent),
      repo(Session),
      repo(Conversation),
      calling,
      ai as never,
      leads,
      messages as never,
      undefined,
      { get: () => ({}) } as never,
    );
    runner = new CallRunnerService(repo(AiCall), repo(VoiceAgent), outcome, ai as never);
    stt = new FakeStt();
    const speech: SpeechFactory = { stt: () => stt, tts: () => new FakeTts() };
    runner.useSpeech(speech);
    dialer = new DialerService(repo(AiCall), repo(AiCallBatch), repo(VoiceAgent), calling, runner);
    await calling.setPublicUrl('https://abc.trycloudflare.com');

    let sid = 0;
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ sid: `CA${++sid}`, status: 'queued' }), { status: 201 })),
      );
  });

  afterEach(async () => {
    fetchMock.mockRestore();
    process.env = { ...env };
    await ds.destroy();
  });

  const calls = () => ds.getRepository(AiCall).find({ order: { createdAt: 'ASC' } });

  it('creates the default insurance agent on first use', async () => {
    const agents = await calling.listAgents(BIZ);
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ isDefault: true, personaName: 'પૂજા', defaultLanguage: 'gu-IN' });
  });

  it('skips numbers that opted out, on WhatsApp or on an earlier call', async () => {
    await ds
      .getRepository(ContactConsent)
      .save({ businessId: BIZ, waContactId: '919000000001', status: ConsentStatus.OPTED_OUT, channel: 'whatsapp' });
    await ds.getRepository(Conversation).save({
      businessId: BIZ,
      sessionId: 's1',
      chatId: '919000000002@c.us',
      status: ConversationStatus.OPEN,
      tags: ['dnd'],
    });
    const a = await calling.queueCall(BIZ, { phone: '9000000001' });
    const b = await calling.queueCall(BIZ, { phone: '9000000002' });
    const c = await calling.queueCall(BIZ, { phone: '9000000003' });
    expect([a.status, b.status, c.status]).toEqual([AiCallStatus.SKIPPED, AiCallStatus.SKIPPED, AiCallStatus.QUEUED]);
    await expect(calling.queueCall(BIZ, { phone: '9000000003' })).rejects.toThrow(/already has a call/);
    await expect(calling.queueCall(BIZ, { phone: '123' })).rejects.toThrow(/valid mobile/);
  });

  it('dials within calling hours, one at a time, with the stream TwiML and a status callback', async () => {
    const batch = await calling.createBatch(BIZ, {
      name: 'Diwali leads',
      contacts: [
        { phone: '9876543210', name: 'Ramesh' },
        { phone: '+91 98765 43210', name: 'dup' },
        { phone: '9123456789', name: 'Sima' },
      ],
    });
    expect(batch).toMatchObject({ totalContacts: 2, queued: 2, skipped: 0 });

    expect(await dialer.tick(tomorrowUtc(2, 0))).toBe(0); // 07:30 IST: too early
    expect(await dialer.tick(NOON_IST)).toBe(1); // concurrency 1
    const [first, second] = await calls();
    expect(first).toMatchObject({ status: AiCallStatus.DIALING, attempts: 1, twilioCallSid: 'CA1' });
    expect(second.status).toBe(AiCallStatus.QUEUED);

    const body = (fetchMock.mock.calls[0] as [string, RequestInit & { body: URLSearchParams }])[1].body;
    expect(body.get('To')).toBe('+919876543210');
    expect(body.get('From')).toBe('+15550001111');
    expect(body.get('Twiml')).toContain('wss://abc.trycloudflare.com/api/ai-calling/stream');
    expect(body.get('StatusCallback')).toBe('https://abc.trycloudflare.com/api/ai-calling/twilio/status');
  });

  it('does not dial a paused list, and cancelling it cancels its queue', async () => {
    const batch = await calling.createBatch(BIZ, { name: 'x', contacts: [{ phone: '9876543210', name: null }] });
    await calling.setBatchStatus(BIZ, batch.id, 'pause');
    expect(await dialer.tick(NOON_IST)).toBe(0);
    await calling.setBatchStatus(BIZ, batch.id, 'cancel');
    expect((await calls())[0].status).toBe(AiCallStatus.CANCELED);
  });

  it('retries an unanswered call later, then gives up', async () => {
    await calling.queueCall(BIZ, { phone: '9876543210' });
    await dialer.tick(NOON_IST);
    await dialer.onTwilioStatus({ CallSid: 'CA1', CallStatus: 'no-answer' });
    let [call] = await calls();
    expect(call.status).toBe(AiCallStatus.QUEUED);
    expect(call.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);

    await ds.getRepository(AiCall).update(call.id, { nextAttemptAt: new Date(0) });
    await dialer.tick(NOON_IST);
    await dialer.onTwilioStatus({ CallSid: 'CA2', CallStatus: 'no-answer' });
    [call] = await calls();
    expect(call).toMatchObject({ status: AiCallStatus.NO_ANSWER, attempts: 2 });
  });

  it('closes calls a crashed process left "in progress"', async () => {
    const agent = await calling.getDefaultAgent(BIZ);
    await ds.getRepository(AiCall).save({
      businessId: BIZ,
      agentId: agent.id,
      phone: '+919876543210',
      status: AiCallStatus.IN_PROGRESS,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(await dialer.recoverStale()).toBe(1);
    expect((await calls())[0]).toMatchObject({
      status: AiCallStatus.FAILED,
      error: 'The server restarted during this call',
    });
  });

  it('turns a verified call into a hot lead and sends the WhatsApp follow-up', async () => {
    await ds.getRepository(Session).save({ id: 'wa-1', name: 'main', businessId: BIZ, status: SessionStatus.READY });
    const batch = await calling.createBatch(BIZ, {
      name: 'x',
      sendWhatsapp: true,
      contacts: [{ phone: '9876543210', name: 'Ramesh' }],
    });
    const [call] = await calls();
    await ds.getRepository(AiCall).update(call.id, {
      status: AiCallStatus.COMPLETED,
      transcript: [{ role: 'customer', text: 'મારે હેલ્થ ઇન્શ્યોરન્સ જોઈએ છે', at: new Date().toISOString() }],
    });
    await outcome.process(call.id, true);

    const saved = (await calls())[0];
    expect(saved).toMatchObject({
      isVerifiedLead: true,
      outcome: 'interested',
      sentiment: 'positive',
      leadTemperature: 'hot',
    });
    expect(saved.whatsappSentAt).toBeInstanceOf(Date);
    const lead = await ds.getRepository(Lead).findOneByOrFail({ id: saved.leadId! });
    expect(lead).toMatchObject({
      customerPhone: '919876543210',
      customerName: 'Ramesh',
      pincode: '380015',
      temperature: 'hot',
    });
    expect(messages.sendText).toHaveBeenCalledWith('wa-1', expect.objectContaining({ chatId: '919876543210@c.us' }));
    expect(String((messages.sendText.mock.calls[0] as [string, { text: string }])[1].text)).toContain('Ramesh');
    expect(batch.sendWhatsapp).toBe(true);
  });

  it('marks "do not call" on WhatsApp too and never messages them', async () => {
    await ds.getRepository(Session).save({ id: 'wa-1', name: 'main', businessId: BIZ, status: SessionStatus.READY });
    ai.complete.mockResolvedValue({
      content: '{"outcome":"do_not_call","isVerifiedLead":false,"sentiment":"negative"}',
    });
    const call = await calling.queueCall(BIZ, { phone: '9876543210' });
    await ds.getRepository(AiCall).update(call.id, { status: AiCallStatus.COMPLETED });
    await outcome.process(call.id, true);
    const chats = await ds.getRepository(Conversation).find();
    expect(chats).toHaveLength(0); // no conversation service in this test, so nothing to tag
    expect(await calling.isDoNotCall(BIZ, '+919876543210')).toBe(true);
    expect(messages.sendText).not.toHaveBeenCalled();
    await expect(calling.queueCall(BIZ, { phone: '9876543210' })).resolves.toMatchObject({
      status: AiCallStatus.SKIPPED,
    });
    expect((await calls())[0].outcome).toBe(AiCallOutcome.DO_NOT_CALL);
  });

  it('runs a whole browser test call over a real websocket and never creates a lead', async () => {
    const server: Server = createServer();
    const gateway = new MediaGatewayService({ httpAdapter: { getHttpServer: () => server } } as never, runner);
    gateway.onApplicationBootstrap();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    const test = await calling.createTestCall(BIZ);
    const ws = new WebSocket(`ws://127.0.0.1:${port}${BROWSER_STREAM_PATH}`);
    const received: Array<Record<string, unknown>> = [];
    const ended = new Promise<void>(resolve =>
      ws.on('message', raw => {
        const msg = JSON.parse(wsText(raw)) as Record<string, unknown>;
        received.push(msg);
        if (msg.type === 'mark') ws.send(JSON.stringify({ type: 'mark', name: msg.name }));
        if (msg.type === 'ended') resolve();
      }),
    );
    await new Promise(resolve => ws.on('open', resolve));
    ws.send(JSON.stringify({ type: 'start', token: runner.tokens.issue(test.id) }));
    await new Promise(resolve => setTimeout(resolve, 50));
    stt.emit('speech_start');
    stt.emit('final', { text: 'ના, આભાર', language: 'gu-IN', confidence: 0.9 });
    await ended;
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(received.some(m => m.type === 'audio')).toBe(true);
    expect(received.filter(m => m.type === 'turn')).toHaveLength(3);
    const saved = await ds.getRepository(AiCall).findOneByOrFail({ id: test.id });
    expect(saved).toMatchObject({
      status: AiCallStatus.COMPLETED,
      channel: 'browser',
      isVerifiedLead: true,
      leadId: null,
    });
    expect(saved.transcript).toHaveLength(3);
    expect(await ds.getRepository(Lead).count()).toBe(0);

    // A forged token is refused.
    const bad = new WebSocket(`ws://127.0.0.1:${port}${BROWSER_STREAM_PATH}`);
    await new Promise(resolve => bad.on('open', resolve));
    bad.send(JSON.stringify({ type: 'start', token: 'nope' }));
    await new Promise(resolve => bad.on('close', resolve));

    ws.close();
    gateway.onModuleDestroy();
    await new Promise(resolve => server.close(resolve));
  });

  it('only accepts Twilio callbacks signed for the saved public URL', () => {
    const url = 'https://abc.trycloudflare.com/api/ai-calling/twilio/status';
    const params = { CallSid: 'CA1', CallStatus: 'ringing' };
    expect(twilioSignature('secret', url, params)).not.toBe(twilioSignature('secret', `${url}x`, params));
  });

  it('keeps the batch running until every call is done', async () => {
    const batch = await calling.createBatch(BIZ, { name: 'x', contacts: [{ phone: '9876543210', name: null }] });
    await dialer.tick(NOON_IST);
    await dialer.onTwilioStatus({ CallSid: 'CA1', CallStatus: 'failed' });
    await dialer.tick(NOON_IST);
    const saved = await ds.getRepository(AiCallBatch).findOneByOrFail({ id: batch.id });
    expect(saved.status).toBe(AiCallBatchStatus.COMPLETED);
    const listed = await calling.listBatches(BIZ);
    expect(listed[0].counts).toEqual({ failed: 1 });
  });
});
