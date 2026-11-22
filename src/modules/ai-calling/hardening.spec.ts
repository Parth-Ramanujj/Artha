import { CallTokens } from './transports';
import { CallRunnerService } from './call-runner.service';
import { telephonyFrom } from './telephony';
import { TelephonyApiError } from './telephony-types';
import { TwilioApiError, TwilioClient, twilioConfigFromEnv } from './twilio.client';
import type { SpeechFactory } from './sarvam';

describe('stream keys survive restarts when a shared secret is set', () => {
  it("two API instances with the same secret accept each other's call keys", () => {
    const secret = 'a-long-shared-secret-value';
    const a = new CallTokens(secret);
    const b = new CallTokens(secret);
    const key = a.callKey('call-1');
    expect(b.isCallKey('call-1', key)).toBe(true);
    expect(b.isCallKey('call-2', key)).toBe(false);
  });

  it('without a secret each process signs with its own random key', () => {
    const a = new CallTokens('');
    const b = new CallTokens('');
    expect(b.isCallKey('call-1', a.callKey('call-1'))).toBe(false);
  });

  it('a too-short secret is not used (falls back to random)', () => {
    const a = new CallTokens('short');
    const b = new CallTokens('short');
    expect(b.isCallKey('call-1', a.callKey('call-1'))).toBe(false);
  });
});

describe('telephony seam', () => {
  it('Twilio errors are provider-neutral errors', () => {
    const err = new TwilioApiError('busy', 429, 20429);
    expect(err).toBeInstanceOf(TelephonyApiError);
    expect(err.status).toBe(429);
  });

  it('TwilioClient is the configured provider when Twilio env is set', () => {
    const env = {
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'tok',
      TWILIO_PHONE_NUMBER: '+15551234567',
    } as NodeJS.ProcessEnv;
    const provider = telephonyFrom(twilioConfigFromEnv(env));
    expect(provider).toBeInstanceOf(TwilioClient);
    expect(provider?.name).toBe('twilio');
  });

  it('no provider without Twilio env', () => {
    expect(telephonyFrom(twilioConfigFromEnv({}))).toBeNull();
  });
});

describe('speech provider injection', () => {
  it('the runner uses the factory it is given (Sarvam by default)', () => {
    const factory = { stt: jest.fn(), tts: jest.fn() } as unknown as SpeechFactory;
    const runner = new CallRunnerService({} as never, {} as never, {} as never, undefined, factory);
    expect((runner as unknown as { speech: SpeechFactory }).speech).toBe(factory);
  });
});

describe('default voices', () => {
  const OLD = { g: process.env.AI_CALLING_VOICE_GUJARATI, h: process.env.AI_CALLING_VOICE_HINDI };
  afterEach(() => {
    if (OLD.g === undefined) delete process.env.AI_CALLING_VOICE_GUJARATI;
    else process.env.AI_CALLING_VOICE_GUJARATI = OLD.g;
    if (OLD.h === undefined) delete process.env.AI_CALLING_VOICE_HINDI;
    else process.env.AI_CALLING_VOICE_HINDI = OLD.h;
    jest.resetModules();
  });

  it('uses the built-in voices unless overridden', () => {
    delete process.env.AI_CALLING_VOICE_GUJARATI;
    delete process.env.AI_CALLING_VOICE_HINDI;
    jest.resetModules();
    const { DEFAULT_VOICES } = jest.requireActual<typeof import('./call-brain')>('./call-brain');
    expect(DEFAULT_VOICES).toEqual({ gujaratiVoice: 'pooja_gu_customer', hindiVoice: 'ritu_hi_customer_warm' });
  });

  it('takes the voices from the environment when set', () => {
    process.env.AI_CALLING_VOICE_GUJARATI = 'new_gu_voice';
    process.env.AI_CALLING_VOICE_HINDI = 'new_hi_voice';
    jest.resetModules();
    const { DEFAULT_AGENT } = jest.requireActual<typeof import('./call-brain')>('./call-brain');
    expect(DEFAULT_AGENT.gujaratiVoice).toBe('new_gu_voice');
    expect(DEFAULT_AGENT.hindiVoice).toBe('new_hi_voice');
  });
});
