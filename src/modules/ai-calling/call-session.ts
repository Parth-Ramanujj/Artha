import { EventEmitter } from 'events';
import { createLogger } from '../../common/services/logger.service';
import {
  AgentPersona,
  CallLanguage,
  END_CALL_MARKER,
  fillTemplate,
  isBackchannel,
  isVoiceTone,
  SentenceSplitter,
  speakable,
  STOCK_PHRASES,
  systemPrompt,
  VoiceTone,
  voiceStyle,
} from './call-brain';
import { TranscriptTurn } from './entities/ai-call.entity';
import { FinalTranscript, SpeechFactory, SttStream, TtsStream } from './sarvam';

/**
 * The audio link to the person: a Twilio media stream or a browser test call. Emits 'audio' (8 kHz
 * mu-law Buffer from the person), 'mark' (name, once playback reached a mark) and 'close'.
 */
export interface CallTransport extends EventEmitter {
  playAudio(mulaw: Buffer): void;
  /** Stops whatever is still queued for playback (barge-in). */
  clearAudio(): void;
  mark(name: string): void;
  hangup(): void;
  /** Optional live updates for a watching dashboard. */
  notify?(event: Record<string, unknown>): void;
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ReplyStream = (messages: ChatMessage[], signal: AbortSignal) => AsyncIterable<string>;

export interface CallSessionConfig {
  agent: AgentPersona & { gujaratiVoice: string; hindiVoice: string; pace: number; maxCallSeconds: number };
  contactName?: string | null;
  /** Per-call opening line and background, e.g. a missed-call follow-up; override the agent's defaults. */
  greeting?: string | null;
  briefing?: string | null;
  sarvamApiKey: string;
  speech: SpeechFactory;
  reply: ReplyStream;
  silenceTimeoutMs?: number;
  /** How long the person must keep talking over the agent before it stops; shorter sounds are coughs or "hmm". */
  bargeInMs?: number;
  /** A reply slower than this gets a short "hmm..." so the line is never dead. */
  fillerAfterMs?: number;
  /** A reply with no first word by then counts as failed. */
  replyTimeoutMs?: number;
}

export type CallEndReason = 'agent_ended' | 'customer_hung_up' | 'silence' | 'time_limit' | 'error';

export interface CallSessionResult {
  transcript: TranscriptTurn[];
  language: CallLanguage;
  reason: CallEndReason;
  customerSpoke: boolean;
  error?: string;
}

const MAX_HISTORY_TURNS = 24;
// After this many failed replies in a row the agent apologises and ends instead of asking again forever.
const MAX_REPLY_FAILURES = 2;
const TONE_TAG = /^\[\[TONE:([A-Za-z]+)\]\]\s*/;

/**
 * One live AI conversation. Listens (speech-to-text), thinks (streamed LLM reply) and talks
 * (text-to-speech) sentence by sentence, and stops talking the moment the person starts speaking.
 * Emits 'turn' (TranscriptTurn) as the conversation grows and 'ended' (CallSessionResult) once.
 */
export class CallSession extends EventEmitter {
  private readonly logger = createLogger('AiCallSession');
  private readonly transcript: TranscriptTurn[] = [];
  private readonly tts = new Map<CallLanguage, TtsStream>();
  /** Sentences sent to each voice whose audio has not fully arrived yet. */
  private readonly unspoken = new Map<TtsStream, number>();
  private stt?: SttStream;
  private language: CallLanguage;
  private generation?: AbortController;
  private pendingMark: string | null = null;
  private lastPlayedMark: string | null = null;
  private markSeq = 0;
  private endAfterSpeech = false;
  private endReason?: CallEndReason;
  private silenceTimer?: NodeJS.Timeout;
  private limitTimer?: NodeJS.Timeout;
  private silentPrompts = 0;
  private bargeTimer?: NodeJS.Timeout;
  private tone: VoiceTone = 'warm';
  private replyFailures = 0;
  private fillers = 0;
  private endError?: string;
  private ended = false;
  private customerSpoke = false;
  /** When the latest customer turn was transcribed, and what of its reply was already timed. */
  private turnAt = 0;
  private turnTimed = { token: false, audio: false };

  constructor(
    private readonly transport: CallTransport,
    private readonly config: CallSessionConfig,
  ) {
    super();
    this.language = config.agent.defaultLanguage === 'hi-IN' ? 'hi-IN' : 'gu-IN';
  }

  get turns(): TranscriptTurn[] {
    return this.transcript;
  }

  start(): void {
    this.stt = this.config.speech.stt({ apiKey: this.config.sarvamApiKey, languageCode: 'auto' });
    this.stt.on('speech_start', () => this.onSpeechStart());
    this.stt.on('speech_end', () => this.onSpeechEnd());
    this.stt.on('final', (t: FinalTranscript) => this.onFinal(t));
    this.stt.on('error', (err: Error) => this.fail(err));

    this.transport.on('audio', (audio: Buffer) => this.stt?.send(audio));
    this.transport.on('mark', (name: string) => this.onMark(name));
    this.transport.on('close', () => this.finish('customer_hung_up'));

    this.limitTimer = setTimeout(() => this.timeUp(), this.config.agent.maxCallSeconds * 1000);
    this.limitTimer.unref?.();

    const { personaName, companyName } = this.config.agent;
    const greeting = this.config.greeting || this.config.agent.greeting;
    this.sayTurn(fillTemplate(greeting, { name: this.config.contactName, persona: personaName, company: companyName }));
  }

  // ── speaking ──

  private voice(language: CallLanguage): TtsStream {
    let stream = this.tts.get(language);
    if (!stream) {
      const created = this.config.speech.tts({
        apiKey: this.config.sarvamApiKey,
        languageCode: language,
        speaker: language === 'hi-IN' ? this.config.agent.hindiVoice : this.config.agent.gujaratiVoice,
        ...voiceStyle(this.tone, this.config.agent.pace),
      });
      created.on('audio', (audio: Buffer) => {
        if (this.ended) return;
        if (this.turnAt && !this.turnTimed.audio) {
          this.turnTimed.audio = true;
          this.logger.log(`Turn latency: first agent audio ${Date.now() - this.turnAt} ms after the customer's words`);
        }
        this.transport.playAudio(audio);
      });
      created.on('spoken', () => this.onSpoken(created));
      created.on('error', (err: Error) => this.fail(err));
      this.tts.set(language, created);
      stream = created;
    }
    return stream;
  }

  /** The model's read of the customer's mood changes how every voice sounds from the next sentence on. */
  private setTone(tone: string): void {
    const name = tone.toLowerCase();
    if (!isVoiceTone(name) || name === this.tone) return;
    this.tone = name;
    const style = voiceStyle(name, this.config.agent.pace);
    for (const stream of this.tts.values()) stream.setStyle(style);
  }

  /** Sends one sentence to the voice in the current language. */
  private speak(sentence: string): boolean {
    const clean = speakable(sentence);
    if (!clean || this.ended) return false;
    this.clearSilence();
    const stream = this.voice(this.language);
    this.unspoken.set(stream, (this.unspoken.get(stream) ?? 0) + 1);
    stream.say(clean);
    return true;
  }

  /** Speaks and records a complete agent turn that does not come from the language model. */
  private sayTurn(text: string, endAfter = false): void {
    if (!this.speak(text)) return;
    if (endAfter) this.endAfterSpeech = true;
    this.record({ role: 'agent', text: speakable(text) });
  }

  private onSpoken(stream: TtsStream): void {
    if (this.ended) return;
    this.unspoken.set(stream, 0);
    if (this.unspokenTotal() > 0) return;
    this.pendingMark = `m${++this.markSeq}`;
    this.transport.mark(this.pendingMark);
  }

  private onMark(name: string): void {
    this.lastPlayedMark = name;
    this.checkIdle();
  }

  private unspokenTotal(): number {
    let total = 0;
    for (const n of this.unspoken.values()) total += n;
    return total;
  }

  private get agentTalking(): boolean {
    return (
      Boolean(this.generation) ||
      this.unspokenTotal() > 0 ||
      (this.pendingMark !== null && this.pendingMark !== this.lastPlayedMark)
    );
  }

  /** Once everything said has been heard: hang up if the agent said goodbye, else wait for the person. */
  private checkIdle(): void {
    if (this.ended || this.agentTalking) return;
    this.pendingMark = null;
    if (this.endAfterSpeech) {
      this.finish(this.endReason ?? 'agent_ended', this.endError);
      return;
    }
    this.armSilence();
  }

  // ── listening ──

  private onSpeechStart(): void {
    if (this.ended) return;
    this.clearSilence();
    if (!this.agentTalking || this.endAfterSpeech || this.bargeTimer) return;
    // Only sustained talk is an interruption; a cough or a "hmm" while the agent speaks is not.
    this.bargeTimer = setTimeout(() => {
      this.bargeTimer = undefined;
      if (!this.ended && this.agentTalking && !this.endAfterSpeech) this.interrupt();
    }, this.config.bargeInMs ?? 450);
    this.bargeTimer.unref?.();
  }

  private onSpeechEnd(): void {
    this.clearBarge();
    // Speech that interrupted the agent but held no words must not leave the line waiting forever.
    if (!this.ended && !this.agentTalking) this.checkIdle();
  }

  private clearBarge(): void {
    if (this.bargeTimer) clearTimeout(this.bargeTimer);
    this.bargeTimer = undefined;
  }

  /** The person talked over the agent: stop the audio and the reply at once, like a person would. */
  private interrupt(): void {
    this.clearBarge();
    this.transport.clearAudio();
    this.generation?.abort();
    this.generation = undefined;
    this.pendingMark = null;
    for (const stream of this.tts.values()) stream.reset();
    this.unspoken.clear();
    const last = this.transcript[this.transcript.length - 1];
    if (last?.role === 'agent') last.interrupted = true;
  }

  private onFinal(t: FinalTranscript): void {
    if (this.ended || !t.text) return;
    this.customerSpoke = true;
    this.silentPrompts = 0;
    // "હા" / "हम्म" while the agent talks is listening, not a turn: keep talking like a person would.
    if (this.agentTalking && !this.endAfterSpeech && isBackchannel(t.text)) {
      this.clearBarge();
      return;
    }
    if ((t.language === 'hi-IN' || t.language === 'gu-IN') && (t.confidence ?? 1) >= 0.6) {
      this.language = t.language;
    }
    this.record({ role: 'customer', text: t.text, language: t.language });
    this.turnAt = Date.now();
    this.turnTimed = { token: false, audio: false };
    if (this.endAfterSpeech) return;
    if (this.agentTalking) this.interrupt();
    void this.respond();
  }

  // ── thinking ──

  private history(): ChatMessage[] {
    const turns = this.transcript.slice(-MAX_HISTORY_TURNS).map<ChatMessage>(t => ({
      role: t.role === 'agent' ? 'assistant' : 'user',
      content:
        (t.tone ? `[[TONE:${t.tone}]] ` : '') + (t.interrupted ? `${t.text} (the customer interrupted here)` : t.text),
    }));
    return [
      {
        role: 'system',
        content: systemPrompt(this.config.agent, this.config.contactName, this.language, this.config.briefing),
      },
      ...turns,
    ];
  }

  private async respond(): Promise<void> {
    const generation = new AbortController();
    this.generation = generation;
    const splitter = new SentenceSplitter();
    let full = '';
    let fed = 0;
    let spokeAny = false;
    let toneRead = false;
    let timedOut = false;
    let failed = false;
    /** Aborted because the customer spoke, not because the model was too slow. */
    const cancelled = () => generation.signal.aborted && !timedOut;

    const timeout = setTimeout(() => {
      timedOut = true;
      generation.abort();
    }, this.config.replyTimeoutMs ?? 8000);
    const filler = setTimeout(() => {
      if (spokeAny || generation.signal.aborted || this.ended) return;
      const phrases = STOCK_PHRASES[this.language].thinking;
      this.speak(phrases[this.fillers++ % phrases.length]);
    }, this.config.fillerAfterMs ?? 1200);
    timeout.unref?.();
    filler.unref?.();

    // Feeds the splitter only text the person may hear: never the tone tag or end marker, nor half of one.
    const feed = (final: boolean) => {
      if (!toneRead) {
        const head = full.trimStart();
        const tag = TONE_TAG.exec(head);
        const partial =
          head.length < 7 ? '[[TONE:'.startsWith(head) : head.startsWith('[[TONE:') && !head.includes(']]');
        if (tag) {
          this.setTone(tag[1]);
          fed = full.length - head.length + tag[0].length;
        } else if (partial && !final) {
          return;
        }
        toneRead = true;
      }
      let visibleEnd = full.length;
      const marker = full.indexOf(END_CALL_MARKER);
      if (marker >= 0) {
        visibleEnd = marker;
      } else if (!final) {
        for (let p = Math.max(0, full.length - END_CALL_MARKER.length + 1); p < full.length; p++) {
          if (END_CALL_MARKER.startsWith(full.slice(p))) {
            visibleEnd = p;
            break;
          }
        }
      }
      if (visibleEnd > fed) {
        for (const sentence of splitter.push(full.slice(fed, visibleEnd))) spokeAny = this.speak(sentence) || spokeAny;
        fed = visibleEnd;
      }
    };

    try {
      for await (const chunk of this.config.reply(this.history(), generation.signal)) {
        if (generation.signal.aborted) break;
        clearTimeout(timeout);
        if (this.turnAt && !this.turnTimed.token) {
          this.turnTimed.token = true;
          this.logger.log(`Turn latency: first reply token ${Date.now() - this.turnAt} ms`);
        }
        full += chunk;
        feed(false);
        if (full.includes(END_CALL_MARKER)) break;
      }
      if (cancelled()) return;
      if (timedOut) throw new Error('no reply in time');
      feed(true);
      const tail = splitter.flush();
      if (tail) spokeAny = this.speak(tail) || spokeAny;
    } catch (err) {
      if (cancelled()) return;
      const reason = timedOut ? 'no reply in time' : err instanceof Error ? err.message : String(err);
      this.logger.warn(`Reply failed: ${reason}`);
      full = '';
      failed = true;
    } finally {
      clearTimeout(timeout);
      clearTimeout(filler);
      if (this.generation === generation) this.generation = undefined;
    }
    if (cancelled() || this.ended) return;

    this.replyFailures = failed ? this.replyFailures + 1 : 0;
    const text = speakable(full);
    // Hanging up right after asking something leaves the customer no way to answer; wait for them.
    if (full.includes(END_CALL_MARKER) && !/[?？]\s*$/.test(text)) this.endAfterSpeech = true;
    if (text && spokeAny) {
      this.record({ role: 'agent', text, tone: this.tone });
    } else if (this.replyFailures >= MAX_REPLY_FAILURES) {
      this.endReason = 'error';
      this.endError = 'The language model did not answer';
      this.sayTurn(STOCK_PHRASES[this.language].troubleGoodbye, true);
    } else if (!this.endAfterSpeech) {
      this.sayTurn(STOCK_PHRASES[this.language].repeat);
    }
    this.checkIdle();
  }

  // ── timers ──

  private armSilence(): void {
    this.clearSilence();
    this.silenceTimer = setTimeout(() => this.onSilence(), this.config.silenceTimeoutMs ?? 7000);
    this.silenceTimer.unref?.();
  }

  private clearSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = undefined;
  }

  private onSilence(): void {
    if (this.ended || this.agentTalking) return;
    this.silentPrompts++;
    const phrases = STOCK_PHRASES[this.language];
    if (this.silentPrompts >= 2) {
      this.endReason = 'silence';
      this.sayTurn(phrases.goodbyeSilent, true);
    } else {
      this.sayTurn(phrases.stillThere);
    }
  }

  private timeUp(): void {
    if (this.ended) return;
    if (this.agentTalking) this.interrupt();
    this.endReason = 'time_limit';
    this.sayTurn(STOCK_PHRASES[this.language].timeUp, true);
  }

  // ── bookkeeping ──

  private record(turn: Omit<TranscriptTurn, 'at'>): void {
    const full: TranscriptTurn = { ...turn, at: new Date().toISOString() };
    this.transcript.push(full);
    this.emit('turn', full);
    this.transport.notify?.({ type: 'turn', turn: full });
  }

  private fail(err: Error): void {
    if (this.ended) return;
    this.logger.error(`Call failed: ${err.message}`);
    this.finish('error', err.message);
  }

  /** Ends the call exactly once: hangs up, closes the speech streams and reports the result. */
  finish(reason: CallEndReason, error?: string): void {
    if (this.ended) return;
    this.ended = true;
    this.clearSilence();
    this.clearBarge();
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.generation?.abort();
    this.stt?.close();
    for (const stream of this.tts.values()) stream.close();
    this.transport.notify?.({ type: 'ended', reason });
    if (reason !== 'customer_hung_up') this.transport.hangup();
    const result: CallSessionResult = {
      transcript: this.transcript,
      language: this.language,
      reason,
      customerSpoke: this.customerSpoke,
      ...(error ? { error } : {}),
    };
    this.emit('ended', result);
  }
}
