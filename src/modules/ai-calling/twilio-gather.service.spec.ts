import { DataSource } from 'typeorm';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiCall, AiCallStatus } from './entities/ai-call.entity';
import { AiCallBatch } from './entities/ai-call-batch.entity';
import { AiCallingSetting } from './entities/ai-calling-setting.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { ContactConsent } from '../campaign/entities/contact-consent.entity';
import { Session } from '../session/entities/session.entity';
import { Lead } from '../workflow/entities/lead.entity';
import { Agent } from '../workflow/entities/agent.entity';
import { AiCallingService } from './ai-calling.service';
import { ProviderSettingsService } from './provider-settings.service';
import { CallRunnerService } from './call-runner.service';
import { CallOutcomeService } from './call-outcome.service';
import { DialerService } from './dialer.service';
import {
  TwilioGatherService,
  detectGatherLanguage,
  mulawByteToLinearPcm16,
  mulawToPcm16Wav,
} from './twilio-gather.service';
import { gatherTwiml } from './twilio.client';

describe('TwilioGatherService & Gather TwiML', () => {
  describe('pure helpers', () => {
    it('wraps 8 kHz mu-law bytes into a valid 44-byte RIFF PCM WAV buffer', () => {
      const mulaw = Buffer.from([0xff, 0x7f, 0x00, 0x80]);
      const wav = mulawToPcm16Wav(mulaw, 8000);
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
      expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
      expect(wav.readUInt16LE(20)).toBe(1); // PCM
      expect(wav.readUInt16LE(22)).toBe(1); // mono
      expect(wav.readUInt32LE(24)).toBe(8000);
      expect(wav.readUInt16LE(34)).toBe(16); // 16-bit
      expect(wav.toString('ascii', 36, 40)).toBe('data');
      expect(wav.readUInt32LE(40)).toBe(8);
      expect(wav.length).toBe(44 + 8);
      expect(mulawByteToLinearPcm16(0xff)).toBe(0);
    });

    it('detects Gujarati and Hindi scripts while keeping existing language for neutral text', () => {
      expect(detectGatherLanguage('નમસ્તે મારે વીમો જોઈએ છે', 'hi-IN')).toBe('gu-IN');
      expect(detectGatherLanguage('मुझे हेल्थ इंश्योरेंस चाहिए', 'gu-IN')).toBe('hi-IN');
      expect(detectGatherLanguage('yes ok sure', 'gu-IN')).toBe('gu-IN');
    });

    it('builds valid Gather and Hangup TwiML with Google Gujarati/Hindi fallback voices', () => {
      const playXml = gatherTwiml({
        playUrl: 'https://example.com/clip.wav?k=1&b=2',
        sayText: 'નમસ્તે',
        language: 'gu-IN',
        actionUrl: 'https://example.com/gather?callId=c1&key=k1',
        redirectUrl: 'https://example.com/gather?callId=c1&key=k1&silent=1',
      });
      expect(playXml).toContain('<Gather input="speech" language="gu-IN"');
      expect(playXml).toContain('<Play>https://example.com/clip.wav?k=1&amp;b=2</Play>');
      expect(playXml).toContain('<Redirect method="POST">https://example.com/gather?callId=c1&amp;key=k1&amp;silent=1</Redirect>');
      expect(playXml).not.toContain('<Say');

      const sayFallbackXml = gatherTwiml({
        sayText: 'નમસ્તે',
        language: 'gu-IN',
        actionUrl: 'https://example.com/gather',
      });
      expect(sayFallbackXml).toContain('<Say language="gu-IN" voice="Google.gu-IN-Wavenet-D">નમસ્તે</Say>');

      const hangupXml = gatherTwiml({
        sayText: 'આવજો',
        language: 'gu-IN',
        actionUrl: 'https://example.com/gather',
        hangup: true,
      });
      expect(hangupXml).toContain('<Hangup/>');
      expect(hangupXml).not.toContain('<Gather');
    });
  });

  describe('conversation lifecycle & Dialer auto-mode', () => {
    let ds: DataSource;
    let calling: AiCallingService;
    let providers: ProviderSettingsService;
    let runner: CallRunnerService;
    let gather: TwilioGatherService;
    let dialer: DialerService;
    let outcomeProcess: jest.Mock;
    let streamComplete: jest.Mock;
    let agent: VoiceAgent;
    const savedEnv = { ...process.env };

    beforeEach(async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC11111111111111111111111111111111';
      process.env.TWILIO_AUTH_TOKEN = 'secret-token';
      process.env.TWILIO_PHONE_NUMBER = '+15550001111';
      delete process.env.SARVAM_API_KEY;

      ds = new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [VoiceAgent, AiCall, AiCallBatch, AiCallingSetting, Conversation, ContactConsent, Session, Lead, Agent],
        synchronize: true,
      });
      await ds.initialize();
      const repo = <T extends object>(e: new () => T) => ds.getRepository(e);

      providers = new ProviderSettingsService(repo(AiCallingSetting));
      calling = new AiCallingService(
        repo(VoiceAgent),
        repo(AiCall),
        repo(AiCallBatch),
        repo(AiCallingSetting),
        repo(Conversation),
        repo(ContactConsent),
        providers,
      );
      await calling.setPublicUrl('https://artha.example.com');
      agent = await calling.getDefaultAgent('biz-1');

      outcomeProcess = jest.fn().mockResolvedValue(undefined);
      const outcome = { process: outcomeProcess } as unknown as CallOutcomeService;
      // eslint-disable-next-line @typescript-eslint/require-await
      streamComplete = jest.fn(async function* () {
        yield '[[TONE:warm]] જી સરસ, તમારું નામ જણાવશો?';
      });
      const ai = { streamComplete } as any;

      runner = new CallRunnerService(repo(AiCall), repo(VoiceAgent), outcome, ai, providers);
      gather = new TwilioGatherService(repo(AiCall), repo(VoiceAgent), runner, outcome, providers, ai);
      dialer = new DialerService(
        repo(AiCall),
        repo(AiCallBatch),
        repo(VoiceAgent),
        calling,
        runner,
        outcome,
        providers,
        gather,
      );
    });

    afterEach(async () => {
      dialer?.onModuleDestroy();
      gather?.onModuleDestroy();
      process.env = { ...savedEnv };
      await ds.destroy();
      jest.restoreAllMocks();
    });

    it('runs greeting, customer turn, silence prompt, and [[END_CALL]] completion', async () => {
      const call = await calling.queueCall('biz-1', {
        agentId: agent.id,
        phone: '+919898555437',
        contactName: 'Parth',
      });

      const startTwiml = await gather.startCall(call, 'https://artha.example.com');
      expect(startTwiml).toContain('<Gather input="speech" language="gu-IN"');
      expect(startTwiml).toContain('<Say language="gu-IN" voice="Google.gu-IN-Wavenet-D">');
      expect(gather.hasActiveCall(call.id)).toBe(true);

      // 1st silence -> stillThere prompt, call stays active
      const silent1 = await gather.handleTurn(call.id, {}, 'https://artha.example.com', true);
      expect(silent1).toContain('<Gather');
      expect(gather.hasActiveCall(call.id)).toBe(true);

      // Customer speaks -> LLM asks follow-up question
      const turn1 = await gather.handleTurn(
        call.id,
        { SpeechResult: 'હા મને હેલ્થ ઇન્સ્યોરન્સ જોઈએ છે' },
        'https://artha.example.com',
      );
      expect(turn1).toContain('<Gather');
      expect(turn1).toContain('તમારું નામ જણાવશો');

      // Agent says goodbye with [[END_CALL]] -> finishes and hangs up
      // eslint-disable-next-line @typescript-eslint/require-await
      streamComplete.mockImplementationOnce(async function* () {
        yield '[[TONE:cheerful]] આભાર પાર્થ, અમારા એડવાઇઝર તમને કોલ કરશે. [[END_CALL]]';
      });
      const turn2 = await gather.handleTurn(
        call.id,
        { SpeechResult: 'મારું નામ પાર્થ છે' },
        'https://artha.example.com',
      );
      expect(turn2).toContain('<Hangup/>');
      expect(turn2).not.toContain('<Gather');
      expect(gather.hasActiveCall(call.id)).toBe(false);

      const saved = await ds.getRepository(AiCall).findOneByOrFail({ id: call.id });
      expect(saved.status).toBe(AiCallStatus.COMPLETED);
      expect(saved.transcript.some(t => t.role === 'customer' && t.text.includes('પાર્થ'))).toBe(true);
      expect(outcomeProcess).toHaveBeenCalledWith(call.id, true);
    });

    it('finalizes active Gather call when customer hangs up mid-call (onTwilioCompleted)', async () => {
      const call = await calling.queueCall('biz-1', {
        agentId: agent.id,
        phone: '+919898555437',
      });
      await ds.getRepository(AiCall).update(call.id, { twilioCallSid: 'CA_GATHER_1' });
      await gather.startCall(call, 'https://artha.example.com');
      await gather.handleTurn(call.id, { SpeechResult: 'હેલ્લો' }, 'https://artha.example.com');

      await dialer.onTwilioStatus({ CallSid: 'CA_GATHER_1', CallStatus: 'completed', CallDuration: '18' });

      expect(gather.hasActiveCall(call.id)).toBe(false);
      const saved = await ds.getRepository(AiCall).findOneByOrFail({ id: call.id });
      expect(saved.status).toBe(AiCallStatus.COMPLETED);
      expect(saved.durationSeconds).toBe(18);
      expect(outcomeProcess).toHaveBeenCalledWith(call.id, true);
    });

    it('auto-selects Gather on Trial Twilio accounts and Live Stream on Full accounts', async () => {
      const callRepo = ds.getRepository(AiCall);
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input: string | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('.json')) {
          return Promise.resolve(new Response(JSON.stringify({ type: 'Trial' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ incoming_phone_numbers: [], outgoing_caller_ids: [] }), { status: 200 }));
      });

      // twimlFor only serves calls that are DIALING/RINGING/IN_PROGRESS (Twilio fetches after dial)
      const trialCall = await calling.queueCall('biz-1', { agentId: agent.id, phone: '+919898555437' });
      await callRepo.update(trialCall.id, { status: AiCallStatus.DIALING });
      const trialTwiml = await dialer.twimlFor(trialCall.id);
      expect(trialTwiml).toContain('<Gather input="speech"');
      expect(trialTwiml).not.toContain('<Connect><Stream');

      // Explicit stream override bypasses Trial auto-detection
      await providers.saveConfig({ twilioMode: 'stream' });
      const streamCall = await calling.queueCall('biz-1', { agentId: agent.id, phone: '+919898555438' });
      await callRepo.update(streamCall.id, { status: AiCallStatus.DIALING });
      const streamXml = await dialer.twimlFor(streamCall.id);
      expect(streamXml).toContain('<Connect><Stream url="wss://artha.example.com/api/ai-calling/stream"');

      // Reset to auto + clear cache simulation via explicit Full check
      fetchSpy.mockImplementation((input: string | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('.json')) {
          return Promise.resolve(new Response(JSON.stringify({ type: 'Full' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ incoming_phone_numbers: [{ sid: 'PN1' }], outgoing_caller_ids: [] }), { status: 200 }));
      });
      await providers.saveConfig({ twilioMode: 'auto' });
      (dialer as any).accountTypeCache = null;
      const fullCall = await calling.queueCall('biz-1', { agentId: agent.id, phone: '+919898555439' });
      await callRepo.update(fullCall.id, { status: AiCallStatus.DIALING });
      const fullXml = await dialer.twimlFor(fullCall.id);
      expect(fullXml).toContain('<Connect><Stream url="wss://artha.example.com/api/ai-calling/stream"');

      fetchSpy.mockRestore();
    });
  });
});
