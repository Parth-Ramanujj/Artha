import { EventEmitter } from 'events';
import { CallSession, CallSessionResult, CallTransport, ChatMessage } from './call-session';
import { FinalTranscript, SpeechFactory, SttStream, TtsOptions, TtsStream } from './sarvam';
import { DEFAULT_AGENT, END_CALL_MARKER, STOCK_PHRASES } from './call-brain';

class FakeStt extends EventEmitter implements SttStream {
  received = 0;
  closed = false;
  send(): void {
    this.received++;
  }
  close(): void {
    this.closed = true;
  }
  speech(text: string, language = 'gu-IN'): void {
    this.emit('speech_start');
    this.emit('final', { text, language, confidence: 0.95 } satisfies FinalTranscript);
  }
}

class FakeTts extends EventEmitter implements TtsStream {
  said: string[] = [];
  resets = 0;
  closed = false;
  constructor(readonly options: TtsOptions) {
    super();
  }
  say(text: string): void {
    this.said.push(text);
    // Audio for each sentence arrives right away, then the "all spoken" signal.
    setImmediate(() => {
      this.emit('audio', Buffer.from(text));
      this.emit('spoken');
    });
  }
  reset(): void {
    this.resets++;
  }
  close(): void {
    this.closed = true;
  }
}

class FakeTransport extends EventEmitter implements CallTransport {
  played: string[] = [];
  marks: string[] = [];
  cleared = 0;
  hungUp = false;
  /** When true, every mark is echoed as soon as it is sent (playback finished). */
  autoPlay = true;
  playAudio(audio: Buffer): void {
    this.played.push(audio.toString());
  }
  clearAudio(): void {
    this.cleared++;
  }
  mark(name: string): void {
    this.marks.push(name);
    if (this.autoPlay) setImmediate(() => this.emit('mark', name));
  }
  hangup(): void {
    this.hungUp = true;
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 80));

function setup(
  reply: (messages: ChatMessage[], signal: AbortSignal) => AsyncIterable<string>,
  silenceTimeoutMs = 60_000,
) {
  const stt = new FakeStt();
  const voices: FakeTts[] = [];
  const speech: SpeechFactory = {
    stt: () => stt,
    tts: options => {
      const tts = new FakeTts(options);
      voices.push(tts);
      return tts;
    },
  };
  const transport = new FakeTransport();
  const session = new CallSession(transport, {
    agent: { ...DEFAULT_AGENT, maxCallSeconds: 300 },
    contactName: 'Ramesh',
    sarvamApiKey: 'test',
    speech,
    reply,
    silenceTimeoutMs,
  });
  const ended = new Promise<CallSessionResult>(resolve => session.once('ended', resolve));
  session.start();
  return { session, stt, voices, transport, ended };
}

async function* tokens(...parts: string[]): AsyncIterable<string> {
  for (const p of parts) {
    await new Promise(resolve => setImmediate(resolve));
    yield p;
  }
}

describe('CallSession', () => {
  it('greets by name in Gujarati as soon as the call connects', async () => {
    const { voices, transport, session } = setup(() => tokens());
    await flush();
    expect(voices[0].options).toMatchObject({ languageCode: 'gu-IN', speaker: 'pooja_gu_customer' });
    expect(voices[0].said[0]).toContain('Ramesh');
    expect(voices[0].said[0]).toContain('પૂજા');
    expect(transport.played).toHaveLength(1);
    expect(session.turns[0]).toMatchObject({ role: 'agent' });
    session.finish('error');
  });

  it('answers sentence by sentence while the reply is still being written', async () => {
    const seen: ChatMessage[][] = [];
    const { stt, voices, session } = setup(messages => {
      seen.push(messages);
      return tokens('જી, સરસ', '. તમારા પરિવારમાં ', 'કેટલા સભ્યો છે?');
    });
    await flush();
    stt.speech('મારે હેલ્થ ઇન્શ્યોરન્સ જોઈએ છે');
    await flush();
    expect(voices[0].said.slice(1)).toEqual(['જી, સરસ.', 'તમારા પરિવારમાં કેટલા સભ્યો છે?']);
    expect(seen[0][0].role).toBe('system');
    expect(seen[0].at(-1)).toEqual({ role: 'user', content: 'મારે હેલ્થ ઇન્શ્યોરન્સ જોઈએ છે' });
    expect(session.turns.map(t => t.role)).toEqual(['agent', 'customer', 'agent']);
    session.finish('error');
  });

  it('stops talking the moment the customer interrupts', async () => {
    const { stt, voices, transport, session } = setup(() => tokens());
    transport.autoPlay = false; // the greeting is still playing
    await flush();
    stt.emit('speech_start');
    expect(transport.cleared).toBe(1);
    expect(voices[0].resets).toBe(1);
    expect(session.turns[0].interrupted).toBe(true);
    session.finish('error');
  });

  it('does not treat speech as an interruption once the agent is quiet', async () => {
    const { stt, transport, session } = setup(() => tokens());
    await flush();
    stt.emit('speech_start');
    expect(transport.cleared).toBe(0);
    session.finish('error');
  });

  it('hangs up after the goodbye is heard, without reading the end marker aloud', async () => {
    const { stt, voices, transport, ended } = setup(() => tokens('આભાર, આવજો!', ' [[END', '_CALL]]'));
    await flush();
    stt.speech('ના, મારે નથી જોઈતું');
    const result = await ended;
    expect(voices[0].said.at(-1)).toBe('આભાર, આવજો!');
    expect(voices[0].said.join(' ')).not.toContain('END');
    expect(transport.hungUp).toBe(true);
    expect(result).toMatchObject({ reason: 'agent_ended', customerSpoke: true });
    expect(result.transcript.at(-1)).toMatchObject({ role: 'agent', text: 'આભાર, આવજો!' });
  });

  it('switches to a Hindi voice when the customer speaks Hindi', async () => {
    let lastSystem = '';
    const { stt, voices, session } = setup(messages => {
      lastSystem = messages[0].content;
      return tokens('जी, बिल्कुल।');
    });
    await flush();
    stt.speech('मुझे हिंदी में बात करनी है', 'hi-IN');
    await flush();
    expect(voices[1].options).toMatchObject({ languageCode: 'hi-IN', speaker: 'ritu_hi_customer_warm' });
    expect(voices[1].said).toEqual(['जी, बिल्कुल।']);
    expect(lastSystem).toContain('Right now speak Hindi');
    session.finish('error');
  });

  it('asks "are you there?" after silence, then says goodbye and hangs up', async () => {
    const { voices, ended } = setup(() => tokens(), 20);
    const result = await ended;
    expect(voices[0].said.slice(1)).toEqual([STOCK_PHRASES['gu-IN'].stillThere, STOCK_PHRASES['gu-IN'].goodbyeSilent]);
    expect(result).toMatchObject({ reason: 'silence', customerSpoke: false });
  });

  it('apologises and asks again when the language model fails', async () => {
    const { stt, voices, session } = setup(() => {
      throw new Error('Groq down');
    });
    await flush();
    stt.speech('હેલો');
    await flush();
    expect(voices[0].said.at(-1)).toBe(STOCK_PHRASES['gu-IN'].repeat);
    session.finish('error');
  });

  it('reports the customer hanging up once, and closes the speech streams', async () => {
    const { stt, voices, transport, ended } = setup(() => tokens());
    await flush();
    transport.emit('close');
    transport.emit('close');
    const result = await ended;
    expect(result.reason).toBe('customer_hung_up');
    expect(transport.hungUp).toBe(false);
    expect(stt.closed).toBe(true);
    expect(voices[0].closed).toBe(true);
  });

  it('forwards caller audio to speech recognition', () => {
    const { stt, transport, session } = setup(() => tokens());
    transport.emit('audio', Buffer.alloc(160));
    transport.emit('audio', Buffer.alloc(160));
    expect(stt.received).toBe(2);
    session.finish('error');
  });

  it('keeps the line open when the "goodbye" is really a question', async () => {
    const { stt, transport, session } = setup(() => tokens('અને તમારું નામ શું છે? [[END_CALL]]'));
    await flush();
    stt.speech('સાંજે ફોન કરજો');
    await flush();
    expect(transport.hungUp).toBe(false);
    session.finish('error');
  });

  it('never ends on a marker the model invents mid-sentence before saying anything', async () => {
    const { stt, transport, ended } = setup(() => tokens(END_CALL_MARKER));
    await flush();
    stt.speech('બાય');
    const result = await ended;
    expect(result.reason).toBe('agent_ended');
    expect(transport.hungUp).toBe(true);
  });
});
