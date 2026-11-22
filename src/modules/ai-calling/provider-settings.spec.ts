import { EventEmitter } from 'events';

jest.mock('ws', () => {
  const { EventEmitter: Emitter } = jest.requireActual<{ EventEmitter: typeof EventEmitter }>('events');
  class FakeSocket extends Emitter {
    static OPEN = 1;
    readyState = 0;
    sent: unknown[] = [];
    closed = false;
    constructor(
      public url: string,
      public options?: unknown,
    ) {
      super();
      FakeSocket.created.push(this);
    }
    static created: FakeSocket[] = [];
    send(data: unknown) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
      this.readyState = 3;
    }
  }
  return { __esModule: true, default: FakeSocket };
});

import WebSocket from 'ws';
import { DeepgramStt } from './deepgram-stt';
import { ElevenTts } from './elevenlabs-tts';
import { DEFAULT_PROVIDERS, sanitizeProviders, ttsProviderFor } from './provider-settings';
import { openAiCompatibleStream, speechFactoryFor } from './speech-router';

type Fake = EventEmitter & { url: string; options?: unknown; sent: unknown[]; readyState: number; closed: boolean };
const sockets = () => (WebSocket as unknown as { created: Fake[] }).created;
const last = (): Fake => sockets()[sockets().length - 1];

describe('provider settings', () => {
  it('keeps only known values and falls back to the default for anything else', () => {
    const out = sanitizeProviders({ stt: 'deepgram', ttsHindi: 'nonsense', llm: 'groq', elevenVoiceId: '  abc  ' });
    expect(out.stt).toBe('deepgram');
    expect(out.ttsHindi).toBe(DEFAULT_PROVIDERS.ttsHindi);
    expect(out.elevenVoiceId).toBe('abc');
  });

  it('picks the engine per language and sends unknown languages to Sarvam', () => {
    const cfg = { ...DEFAULT_PROVIDERS, ttsHindi: 'elevenlabs' as const, ttsEnglish: 'elevenlabs' as const };
    expect(ttsProviderFor(cfg, 'hi-IN')).toBe('elevenlabs');
    expect(ttsProviderFor(cfg, 'en-IN')).toBe('elevenlabs');
    expect(ttsProviderFor(cfg, 'gu-IN')).toBe('sarvam');
    expect(ttsProviderFor(cfg, 'ta-IN')).toBe('sarvam');
  });
});

describe('Deepgram speech-to-text', () => {
  beforeEach(() => {
    sockets().length = 0;
  });

  it('joins the finals of one utterance and emits it once, at speech_final', () => {
    const stt = new DeepgramStt({ apiKey: 'k', languageCode: 'auto' });
    const finals: unknown[] = [];
    stt.on('final', f => finals.push(f));
    stt.onMessage(
      JSON.stringify({
        type: 'Results',
        is_final: true,
        speech_final: false,
        channel: { alternatives: [{ transcript: 'mane' }] },
      }),
    );
    stt.onMessage(
      JSON.stringify({
        type: 'Results',
        is_final: true,
        speech_final: true,
        channel: { alternatives: [{ transcript: 'vima levana che' }] },
      }),
    );
    expect(finals).toEqual([expect.objectContaining({ text: 'mane vima levana che' })]);
    stt.onMessage(JSON.stringify({ type: 'UtteranceEnd' }));
    expect(finals).toHaveLength(1);
  });

  it('uses nova-3 multilingual for auto and the language code otherwise', () => {
    new DeepgramStt({ apiKey: 'k', languageCode: 'auto' });
    expect(last().url).toContain('model=nova-3');
    expect(last().url).toContain('language=multi');
    expect(last().url).toContain('encoding=mulaw');
    expect(last().url).toContain('sample_rate=8000');
    new DeepgramStt({ apiKey: 'k', languageCode: 'hi-IN' });
    expect(last().url).toContain('language=hi');
    expect(last().options).toMatchObject({ headers: { Authorization: 'Token k' } });
  });

  it('maps SpeechStarted and UtteranceEnd to the same events as the Sarvam stream', () => {
    const stt = new DeepgramStt({ apiKey: 'k' });
    const events: string[] = [];
    stt.on('speech_start', () => events.push('start'));
    stt.on('speech_end', () => events.push('end'));
    stt.onMessage(JSON.stringify({ type: 'SpeechStarted' }));
    stt.onMessage(JSON.stringify({ type: 'UtteranceEnd' }));
    expect(events).toEqual(['start', 'end']);
  });
});

describe('ElevenLabs text-to-speech', () => {
  beforeEach(() => {
    sockets().length = 0;
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  const open = (tts: ElevenTts) => {
    last().readyState = 1;
    last().emit('open');
    return tts;
  };

  it('sends the voice and text in the documented shapes and emits audio', () => {
    const tts = open(
      new ElevenTts({
        apiKey: 'xi',
        voiceId: 'v1',
        model: 'eleven_multilingual_v2',
        outputFormat: 'ulaw_8000',
        languageCode: 'hi-IN',
      }),
    );
    expect(last().url).toContain('/text-to-speech/v1/stream-input');
    expect(last().url).toContain('output_format=ulaw_8000');
    expect(last().options).toMatchObject({ headers: { 'xi-api-key': 'xi' } });
    const sent = last().sent.map(s => JSON.parse(String(s)) as Record<string, unknown>);
    expect(sent[0]).toMatchObject({ text: ' ', voice_settings: expect.any(Object) as unknown });

    const audio: Buffer[] = [];
    tts.on('audio', (b: Buffer) => audio.push(b));
    tts.say('namaste');
    last().emit('message', JSON.stringify({ audio: Buffer.from([1, 2, 3]).toString('base64') }));
    expect(audio[0]).toEqual(Buffer.from([1, 2, 3]));
  });

  it('reports spoken after a quiet period once audio stops', () => {
    const tts = open(
      new ElevenTts({ apiKey: 'xi', voiceId: 'v1', model: 'm', outputFormat: 'ulaw_8000', languageCode: 'hi-IN' }),
    );
    let spoken = 0;
    tts.on('spoken', () => spoken++);
    tts.say('ek');
    last().emit('message', JSON.stringify({ audio: 'AAE=' }));
    jest.advanceTimersByTime(300);
    expect(spoken).toBe(0);
    jest.advanceTimersByTime(800);
    expect(spoken).toBe(1);
  });

  it('barge-in drops the queued text and ignores audio from the old connection', () => {
    const tts = open(
      new ElevenTts({ apiKey: 'xi', voiceId: 'v1', model: 'm', outputFormat: 'ulaw_8000', languageCode: 'hi-IN' }),
    );
    const old = last();
    const audio: Buffer[] = [];
    tts.on('audio', (b: Buffer) => audio.push(b));
    tts.reset();
    expect(old.closed).toBe(true);
    old.emit('message', JSON.stringify({ audio: 'AAE=' }));
    expect(audio).toHaveLength(0);
  });

  it('reports spoken immediately when isFinal message arrives', () => {
    const tts = open(
      new ElevenTts({ apiKey: 'xi', voiceId: 'v1', model: 'm', outputFormat: 'ulaw_8000', languageCode: 'hi-IN' }),
    );
    let spoken = 0;
    tts.on('spoken', () => spoken++);
    tts.say('ek');
    last().emit('message', JSON.stringify({ isFinal: true }));
    expect(spoken).toBe(1);
  });
});

describe('speechFactoryFor router', () => {
  beforeEach(() => {
    sockets().length = 0;
  });

  it('passes elevenlabs API key to ElevenTts, not sarvam key', () => {
    const factory = speechFactoryFor(
      {
        ...DEFAULT_PROVIDERS,
        ttsGujarati: 'elevenlabs',
        elevenVoiceId: 'voice_123',
        elevenModel: 'eleven_v4_turbo',
      },
      {
        sarvam: 'sarvam-key-secret',
        deepgram: null,
        elevenlabs: 'xi-api-key-real',
      },
    );
    factory.tts({
      languageCode: 'gu-IN',
      speaker: 'pari',
      pace: 1,
      style: 'friendly',
      apiKey: 'sarvam-key-secret',
    });
    expect(last().options).toMatchObject({ headers: { 'xi-api-key': 'xi-api-key-real' } });
    expect(last().url).toContain('voice_123');
    expect(last().url).toContain('eleven_v4_turbo');
    expect(last().url).toContain('ulaw_8000');
  });

  it('falls back to Sarvam TTS when ElevenLabs emits an error', () => {
    const factory = speechFactoryFor(
      {
        ...DEFAULT_PROVIDERS,
        ttsGujarati: 'elevenlabs',
        elevenVoiceId: 'bad_voice_id',
      },
      {
        sarvam: 'sarvam-key-secret',
        deepgram: null,
        elevenlabs: 'xi-api-key-real',
      },
    );
    const stream = factory.tts({
      languageCode: 'gu-IN',
      speaker: 'pari',
      apiKey: 'sarvam-key-secret',
    });
    const xiSocket = last();
    xiSocket.readyState = 1;
    xiSocket.emit('open');

    stream.say('Kem cho?');
    // ElevenLabs sends voice_id_does_not_exist
    xiSocket.emit('message', JSON.stringify({ error: 'voice_id_does_not_exist' }));

    // Fallback socket (Sarvam) should be created
    expect(xiSocket.closed).toBe(true);
    const sarvamSocket = last();
    expect(sarvamSocket).not.toBe(xiSocket);
    expect(sarvamSocket.url).toContain('sarvam.ai');
  });
});

describe('OpenAI-compatible language model stream', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the server-sent events and yields the text pieces', async () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"Namaste"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" ji"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of body) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, body: stream } as unknown as Response);
    const pieces: string[] = [];
    for await (const p of openAiCompatibleStream(
      { baseUrl: 'https://api.example.com/v1/', apiKey: 'k', model: 'm' },
      [],
    )) {
      pieces.push(p);
    }
    expect(pieces.join('')).toBe('Namaste ji');
    const calls = (global.fetch as unknown as jest.Mock).mock.calls as Array<[string]>;
    expect(calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
  });
});
