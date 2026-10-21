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
  setStyle(): void {}
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
    dialer = new DialerService(repo(AiCall), repo(AiCallBatch), repo(VoiceAgent), calling, runner, outcome);
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
    // Trial accounts reject inline TwiML, so the call points Twilio at our TwiML URL instead.
    expect(body.get('Twiml')).toBeNull();
    const twimlUrl = new URL((body.get('Url') as string | null) ?? '');
    expect(`${twimlUrl.origin}${twimlUrl.pathname}`).toBe('https://abc.trycloudflare.com/api/ai-calling/twilio/twiml');
    expect(twimlUrl.searchParams.get('callId')).toBe(first.id);
    // The URL carries a key only this server can make for this call, and only for this call.
    expect(runner.tokens.isCallKey(first.id, twimlUrl.searchParams.get('key') ?? undefined)).toBe(true);
    expect(runner.tokens.isCallKey(second.id, twimlUrl.searchParams.get('key') ?? undefined)).toBe(false);
    expect(body.get('StatusCallback')).toBe('https://abc.trycloudflare.com/api/ai-calling/twilio/status');

    // That URL connects the answered call to the media stream with a token only this call can use.
    const xml = await dialer.twimlFor(first.id);
    expect(xml).toContain(
      '<Connect><Stream url="wss://abc.trycloudflare.com/api/ai-calling/stream" statusCallback="https://abc.trycloudflare.com/api/ai-calling/twilio/stream-status?callId=',
    );
    const token = /name="token" value="([^"]+)"/.exec(xml)?.[1];
    expect(runner.tokens.verify(token)).toBe(first.id);
    // A call that is not being placed (or an unknown id) is hung up.
    expect(await dialer.twimlFor(second.id)).toContain('<Hangup/>');
    expect(await dialer.twimlFor('nope')).toContain('<Hangup/>');
    expect(await dialer.twimlFor(undefined)).toContain('<Hangup/>');
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
      error: 'The call was left unfinished (server restart)',
    });
  });

  it('is not held up by an abandoned browser test call, and closes it', async () => {
    const test = await calling.createTestCall(BIZ); // the microphone link never opened
    await ds.getRepository(AiCall).update(test.id, { startedAt: new Date(NOON_IST.getTime() - 5 * 60 * 1000) });
    await calling.queueCall(BIZ, { phone: '9876543210' });

    expect(await dialer.tick(NOON_IST)).toBe(1);
    const repo = ds.getRepository(AiCall);
    expect(await repo.findOneByOrFail({ id: test.id })).toMatchObject({
      status: AiCallStatus.FAILED,
      error: 'The browser test call never connected',
    });
    expect(await repo.findOneByOrFail({ channel: 'phone' })).toMatchObject({ status: AiCallStatus.DIALING });
  });

  it('asks Twilio about a call whose final status callback was lost, freeing the line', async () => {
    const repo = ds.getRepository(AiCall);
    const first = await calling.queueCall(BIZ, { phone: '9876543210' });
    await calling.queueCall(BIZ, { phone: '9123456789' });
    expect(await dialer.tick(NOON_IST)).toBe(1);
    // The "completed" callback never arrived; the call went quiet two minutes ago.
    await repo.update(first.id, { updatedAt: new Date(NOON_IST.getTime() - 2 * 60 * 1000) });
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(url).endsWith('/Calls/CA1.json')
              ? { status: 'completed', duration: '7' }
              : { sid: 'CA2', status: 'queued' },
          ),
          { status: 200 },
        ),
      ),
    );

    expect(await dialer.tick(NOON_IST)).toBe(1);
    expect(await repo.findOneByOrFail({ id: first.id })).toMatchObject({
      status: AiCallStatus.COMPLETED,
      durationSeconds: 7,
    });
    expect(await repo.findOneByOrFail({ phone: '+919123456789' })).toMatchObject({ status: AiCallStatus.DIALING });
  });

  it('says on a queued call why it is waiting', async () => {
    const call = await calling.queueCall(BIZ, { phone: '9876543210' });
    expect(await dialer.tick(tomorrowUtc(2, 0))).toBe(0); // 07:30 IST
    expect((await ds.getRepository(AiCall).findOneByOrFail({ id: call.id })).error).toMatch(
      /^Waiting: outside calling hours \(09:00–21:00/,
    );
    await dialer.tick(NOON_IST);
    expect(await ds.getRepository(AiCall).findOneByOrFail({ id: call.id })).toMatchObject({
      status: AiCallStatus.DIALING,
      error: null,
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
    // Campaigns read consent, so the refusal reaches them even with no chat to tag.
    const consent = await ds.getRepository(ContactConsent).findOneByOrFail({ waContactId: '919876543210@c.us' });
    expect(consent).toMatchObject({ businessId: BIZ, status: ConsentStatus.OPTED_OUT, source: 'ai_call' });
  });

  it('a paused list does not hold up calls queued after it', async () => {
    const paused = await calling.createBatch(BIZ, {
      name: 'big',
      contacts: Array.from({ length: 5 }, (_, i) => ({ phone: `98765000${10 + i}`, name: null })),
    });
    await calling.setBatchStatus(BIZ, paused.id, 'pause');
    await calling.queueCall(BIZ, { phone: '9123456789' });
    expect(await dialer.tick(NOON_IST)).toBe(1);
    const dialled = (await calls()).filter(c => c.status === AiCallStatus.DIALING);
    expect(dialled.map(c => c.phone)).toEqual(['+919123456789']);
  });

  it('does not re-queue an unanswered call whose list was cancelled meanwhile', async () => {
    const batch = await calling.createBatch(BIZ, { name: 'x', contacts: [{ phone: '9876543210', name: null }] });
    await dialer.tick(NOON_IST);
    await calling.setBatchStatus(BIZ, batch.id, 'cancel');
    await dialer.onTwilioStatus({ CallSid: 'CA1', CallStatus: 'no-answer' });
    expect((await calls())[0]).toMatchObject({ status: AiCallStatus.CANCELED, error: 'List cancelled' });
    await expect(calling.queueCall(BIZ, { phone: '9876543210' })).resolves.toMatchObject({
      status: AiCallStatus.QUEUED,
    });
  });

  it('keeps and analyses a conversation that a server restart cut off', async () => {
    const call = await calling.queueCall(BIZ, { phone: '9876543210' });
    await dialer.tick(NOON_IST);
    await ds.getRepository(AiCall).update(call.id, {
      status: AiCallStatus.IN_PROGRESS,
      answeredAt: new Date(Date.now() - 60_000),
      transcript: [{ role: 'customer', text: 'મારે હેલ્થ ઇન્શ્યોરન્સ જોઈએ છે', at: new Date().toISOString() }],
    });
    await dialer.onTwilioStatus({ CallSid: 'CA1', CallStatus: 'completed', CallDuration: '61' });
    const saved = (await calls())[0];
    expect(saved).toMatchObject({ status: AiCallStatus.COMPLETED, isVerifiedLead: true });
    expect(saved.leadId).toBeTruthy();
  });

  it('retries a call Twilio could not take right now instead of failing it', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(JSON.stringify({ message: 'Too many requests', code: 20429 }), { status: 429 })),
    );
    await calling.queueCall(BIZ, { phone: '9876543210' });
    await dialer.tick(NOON_IST);
    const [call] = await calls();
    expect(call).toMatchObject({ status: AiCallStatus.QUEUED, attempts: 0 });
    expect(call.error).toMatch(/trying again in a minute/);
  });

  it('sends the WhatsApp follow-up once even when asked twice at the same time', async () => {
    await ds.getRepository(Session).save({ id: 'wa-1', name: 'main', businessId: BIZ, status: SessionStatus.READY });
    const call = await calling.queueCall(BIZ, { phone: '9876543210' });
    await ds.getRepository(AiCall).update(call.id, { status: AiCallStatus.COMPLETED });
    const results = await Promise.allSettled([outcome.sendWhatsapp(BIZ, call.id), outcome.sendWhatsapp(BIZ, call.id)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(messages.sendText).toHaveBeenCalledTimes(1);
  });

  it("never sends from another business's WhatsApp number", async () => {
    await ds
      .getRepository(Session)
      .save({ id: 'wa-other', name: 'x', businessId: 'biz-2', status: SessionStatus.READY });
    await ds.getRepository(Session).save({ id: 'wa-1', name: 'main', businessId: BIZ, status: SessionStatus.READY });
    const agent = await calling.getDefaultAgent(BIZ);
    await calling.updateAgent(BIZ, agent.id, { whatsappSessionId: 'wa-other' });
    const call = await calling.queueCall(BIZ, { phone: '9876543210' });
    await ds.getRepository(AiCall).update(call.id, { status: AiCallStatus.COMPLETED });
    await outcome.sendWhatsapp(BIZ, call.id);
    expect(messages.sendText).toHaveBeenCalledWith('wa-1', expect.anything());
  });

  it('refuses calling hours that start and end at the same time', async () => {
    const agent = await calling.getDefaultAgent(BIZ);
    await expect(calling.updateAgent(BIZ, agent.id, { callingEnd: '09:00' })).rejects.toThrow(/different times/);
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

  it('tells a call that reached the AI from one that did not, and each call is judged alone', async () => {
    await calling.queueCall(BIZ, { phone: '9876543210' });
    await calling.queueCall(BIZ, { phone: '9876543211' });
    await dialer.tick(NOON_IST);
    const [first] = await calls();
    await dialer.twimlFor(first.id); // the answered call reached the AI
    await dialer.onTwilioStatus({ CallSid: 'CA1', CallStatus: 'completed', CallDuration: '0' });
    expect((await calls())[0].error).toContain('the audio stream to the AI never opened');

    await dialer.tick(NOON_IST); // the second call dials; it never reached the AI
    await dialer.onTwilioStatus({ CallSid: 'CA2', CallStatus: 'completed', CallDuration: '0' });
    expect((await calls())[1].error).toContain('ended before it reached the AI');
  });
});
