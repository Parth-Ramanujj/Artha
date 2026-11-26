import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiCall, AiCallStatus, ACTIVE_CALL_STATUSES, TranscriptTurn } from './entities/ai-call.entity';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiService } from '../ai/ai.service';
import { DEFAULT_PROVIDERS } from './provider-settings';
import { ProviderSettingsService, ResolvedProviders } from './provider-settings.service';
import { CallRunnerService } from './call-runner.service';
import { CallOutcomeService } from './call-outcome.service';
import {
  CallLanguage,
  END_CALL_MARKER,
  fillTemplate,
  isVoiceTone,
  speakable,
  STOCK_PHRASES,
  systemPrompt,
  VoiceTone,
  voiceStyle,
} from './call-brain';
import { openAiCompatibleStream, speechFactoryFor } from './speech-router';
import { gatherTwiml } from './twilio.client';
import { aiCallingLog } from './ai-calling-log.service';
import { createLogger } from '../../common/services/logger.service';

const MAX_HISTORY_TURNS = 24;
const CLIP_TTL_MS = 5 * 60 * 1000;
const MAX_CLIPS = 120;
const TTS_SYNTH_TIMEOUT_MS = 4500;
const LLM_REPLY_TIMEOUT_MS = 8000;
const TONE_TAG = /^\[\[TONE:([A-Za-z]+)\]\]\s*/;

interface GatherSessionState {
  callId: string;
  agent: VoiceAgent;
  contactName: string | null;
  greeting: string | null;
  briefing: string | null;
  transcript: TranscriptTurn[];
  language: CallLanguage;
  tone: VoiceTone;
  silentPrompts: number;
  replyFailures: number;
  customerSpoke: boolean;
  startedAt: Date;
  finalized: boolean;
}

interface StoredClip {
  contentType: string;
  data: Buffer;
  expiresAt: number;
}

/** Decodes one 8-bit ITU-T G.711 mu-law byte into a signed 16-bit linear PCM sample. */
export function mulawByteToLinearPcm16(uVal: number): number {
  const inv = ~uVal & 0xff;
  const sign = inv & 0x80;
  const exponent = (inv >> 4) & 0x07;
  const mantissa = inv & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

/** Wraps raw 8 kHz mono mu-law audio bytes into a standard 44-byte RIFF/WAVE 16-bit PCM buffer. */
export function mulawToPcm16Wav(mulaw: Buffer, sampleRate = 8000): Buffer {
  const dataLen = mulaw.length * 2;
  const out = Buffer.allocUnsafe(44 + dataLen);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataLen, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); // PCM format chunk size
  out.writeUInt16LE(1, 20); // AudioFormat = 1 (Linear PCM)
  out.writeUInt16LE(1, 22); // Mono
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); // ByteRate = SampleRate * NumChannels * BitsPerSample/8
  out.writeUInt16LE(2, 32); // BlockAlign
  out.writeUInt16LE(16, 34); // BitsPerSample
  out.write('data', 36);
  out.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < mulaw.length; i++) {
    out.writeInt16LE(mulawByteToLinearPcm16(mulaw[i]), 44 + i * 2);
  }
  return out;
}

/** Switches between Gujarati and Hindi when customer speech clearly contains the other script. */
export function detectGatherLanguage(text: string, current: CallLanguage): CallLanguage {
  const hasGujarati = /[\u0A80-\u0AFF]/.test(text);
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  if (hasGujarati && !hasDevanagari) return 'gu-IN';
  if (hasDevanagari && !hasGujarati) return 'hi-IN';
  return current;
}

/**
 * Handles Twilio <Gather input="speech"> + <Play> turn-by-turn AI voice conversations.
 * Allows Free Trial Twilio accounts (which include Speech Recognition & Say/Play but block Media Streams)
 * to run real AI phone calls without touching existing WebSocket Stream calls for paid accounts.
 */
@Injectable()
export class TwilioGatherService implements OnModuleDestroy {
  private readonly logger = createLogger('AiCallGather');
  private readonly sessions = new Map<string, GatherSessionState>();
  private readonly clips = new Map<string, StoredClip>();

  constructor(
    @InjectRepository(AiCall, 'data') private readonly callRepo: Repository<AiCall>,
    @InjectRepository(VoiceAgent, 'data') private readonly agentRepo: Repository<VoiceAgent>,
    private readonly runner: CallRunnerService,
    private readonly outcome: CallOutcomeService,
    @Optional() private readonly providers?: ProviderSettingsService,
    @Optional() private readonly ai?: AiService,
  ) {}

  onModuleDestroy(): void {
    this.sessions.clear();
    this.clips.clear();
  }

  hasActiveCall(callId: string): boolean {
    const s = this.sessions.get(callId);
    return Boolean(s && !s.finalized);
  }

  getAudioClip(clipId: string): { contentType: string; data: Buffer } | null {
    this.pruneExpiredClips();
    const clip = this.clips.get(clipId);
    if (!clip || clip.expiresAt < Date.now()) {
      this.clips.delete(clipId);
      return null;
    }
    return { contentType: clip.contentType, data: clip.data };
  }

  async startCall(call: AiCall, publicUrl: string): Promise<string> {
    const agent = await this.agentRepo.findOne({ where: { id: call.agentId } });
    if (!agent) {
      return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
    }
    const now = new Date();
    const resolved = this.providers ? await this.providers.resolve() : null;
    const activeAgent = this.applyOverrides(agent, resolved);
    const language: CallLanguage = activeAgent.defaultLanguage === 'hi-IN' ? 'hi-IN' : 'gu-IN';
    const greetingText = fillTemplate(call.greeting || activeAgent.greeting, {
      name: call.contactName,
      persona: activeAgent.personaName,
      company: activeAgent.companyName,
    });

    const state: GatherSessionState = {
      callId: call.id,
      agent: activeAgent,
      contactName: call.contactName,
      greeting: call.greeting,
      briefing: call.briefing,
      transcript: [{ role: 'agent', text: greetingText, tone: 'warm', at: now.toISOString() }],
      language,
      tone: 'warm',
      silentPrompts: 0,
      replyFailures: 0,
      customerSpoke: false,
      startedAt: now,
      finalized: false,
    };
    this.sessions.set(call.id, state);

    await this.callRepo.update(call.id, {
      status: AiCallStatus.IN_PROGRESS,
      answeredAt: call.answeredAt ?? now,
      transcript: state.transcript,
      language,
      error: null,
    });

    aiCallingLog.info('dialer', `Twilio Speech Gather call started (${language})`, {
      callId: call.id,
      channel: 'phone',
      details: { model: activeAgent.model, language },
    });

    return this.buildTurnTwiml(state, greetingText, publicUrl, resolved, false);
  }

  async handleTurn(
    callId: string | undefined,
    params: Record<string, string>,
    publicUrl: string,
    isSilentRedirect = false,
  ): Promise<string> {
    const hangup = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
    if (!callId) return hangup;
    const state = await this.getOrHydrateSession(callId);
    if (!state || state.finalized) return hangup;

    const resolved = this.providers ? await this.providers.resolve() : null;
    state.agent = this.applyOverrides(state.agent, resolved);

    const elapsedSec = Math.round((Date.now() - state.startedAt.getTime()) / 1000);
    if (elapsedSec >= state.agent.maxCallSeconds) {
      const bye = STOCK_PHRASES[state.language].timeUp;
      state.transcript.push({ role: 'agent', text: bye, tone: 'warm', at: new Date().toISOString() });
      const twiml = await this.buildTurnTwiml(state, bye, publicUrl, resolved, true);
      await this.finalize(state, elapsedSec);
      return twiml;
    }

    const speech = (params.SpeechResult ?? '').trim();
    if (!speech || isSilentRedirect) {
      state.silentPrompts++;
      if (state.silentPrompts >= 2) {
        const bye = STOCK_PHRASES[state.language].goodbyeSilent;
        state.transcript.push({ role: 'agent', text: bye, tone: 'calm', at: new Date().toISOString() });
        const twiml = await this.buildTurnTwiml(state, bye, publicUrl, resolved, true);
        await this.finalize(state, elapsedSec);
        return twiml;
      }
      const prompt = STOCK_PHRASES[state.language].stillThere;
      state.tone = 'warm';
      state.transcript.push({ role: 'agent', text: prompt, tone: state.tone, at: new Date().toISOString() });
      await this.persistProgress(state);
      return this.buildTurnTwiml(state, prompt, publicUrl, resolved, false);
    }

    state.silentPrompts = 0;
    state.customerSpoke = true;
    state.language = detectGatherLanguage(speech, state.language);
    state.transcript.push({
      role: 'customer',
      text: speech,
      language: state.language,
      at: new Date().toISOString(),
    });
    aiCallingLog.info('call', `Customer (${state.language}): ${speech}`, {
      callId: state.callId,
      channel: 'phone',
    });

    const { replyText, shouldEnd } = await this.generateReply(state, resolved);
    state.transcript.push({
      role: 'agent',
      text: replyText,
      tone: state.tone,
      at: new Date().toISOString(),
    });
    await this.persistProgress(state);

    const twiml = await this.buildTurnTwiml(state, replyText, publicUrl, resolved, shouldEnd);
    if (shouldEnd) {
      await this.finalize(state, Math.round((Date.now() - state.startedAt.getTime()) / 1000));
    }
    return twiml;
  }

  async onTwilioCompleted(callId: string, durationSeconds: number): Promise<void> {
    const state = this.sessions.get(callId);
    if (!state) return;
    await this.finalize(state, durationSeconds);
    this.sessions.delete(callId);
  }

  private async getOrHydrateSession(callId: string): Promise<GatherSessionState | null> {
    const existing = this.sessions.get(callId);
    if (existing) return existing;
    const call = await this.callRepo.findOne({ where: { id: callId } });
    if (!call || !ACTIVE_CALL_STATUSES.includes(call.status)) return null;
    const agent = await this.agentRepo.findOne({ where: { id: call.agentId } });
    if (!agent) return null;
    const resolved = this.providers ? await this.providers.resolve() : null;
    const activeAgent = this.applyOverrides(agent, resolved);
    const transcript = Array.isArray(call.transcript) ? [...call.transcript] : [];
    const hydrated: GatherSessionState = {
      callId: call.id,
      agent: activeAgent,
      contactName: call.contactName,
      greeting: call.greeting,
      briefing: call.briefing,
      transcript,
      language: call.language === 'hi-IN' ? 'hi-IN' : 'gu-IN',
      tone: 'warm',
      silentPrompts: 0,
      replyFailures: 0,
      customerSpoke: transcript.some(t => t.role === 'customer'),
      startedAt: call.answeredAt ?? call.startedAt ?? new Date(),
      finalized: false,
    };
    this.sessions.set(call.id, hydrated);
    return hydrated;
  }

  private applyOverrides(agent: VoiceAgent, resolved: ResolvedProviders | null): VoiceAgent {
    const isOverride = Boolean(resolved?.config.overrideAgentSettings ?? true);
    if (!isOverride || !resolved) return agent;
    return {
      ...agent,
      model:
        resolved.config.llm === 'openai-compatible'
          ? resolved.config.llmModel || agent.model
          : resolved.config.groqModel || agent.model,
      gujaratiVoice:
        resolved.config.ttsGujarati === 'sarvam' && resolved.config.sarvamGujaratiVoice
          ? resolved.config.sarvamGujaratiVoice
          : agent.gujaratiVoice,
      hindiVoice:
        resolved.config.ttsHindi === 'sarvam' && resolved.config.sarvamHindiVoice
          ? resolved.config.sarvamHindiVoice
          : agent.hindiVoice,
    };
  }

  private async generateReply(
    state: GatherSessionState,
    resolved: ResolvedProviders | null,
  ): Promise<{ replyText: string; shouldEnd: boolean }> {
    const turns = state.transcript.slice(-MAX_HISTORY_TURNS).map(t => ({
      role: (t.role === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: (t.tone ? `[[TONE:${t.tone}]] ` : '') + t.text,
    }));
    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt(state.agent, state.contactName, state.language, state.briefing),
      },
      ...turns,
    ];

    const isOverride = Boolean(resolved?.config.overrideAgentSettings ?? true);
    const llmEndpoint =
      isOverride &&
      resolved?.config.llm === 'openai-compatible' &&
      resolved.config.llmBaseUrl &&
      resolved.secrets.LLM_API_KEY
        ? {
            baseUrl: resolved.config.llmBaseUrl,
            apiKey: resolved.secrets.LLM_API_KEY,
            model: resolved.config.llmModel || state.agent.model,
          }
        : null;

    let raw = '';
    let failed = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_REPLY_TIMEOUT_MS);
    timer.unref?.();

    try {
      const stream = llmEndpoint
        ? openAiCompatibleStream(llmEndpoint, messages, { maxTokens: 300, temperature: 0.6, signal: controller.signal })
        : this.ai
          ? this.ai.streamComplete(messages, {
              model: state.agent.model,
              maxTokens: 300,
              temperature: 0.6,
              reasoningEffort: 'low',
              signal: controller.signal,
            })
          : null;
      if (!stream) throw new Error('AI service unavailable');
      for await (const chunk of stream) {
        raw += chunk;
      }
    } catch (err) {
      failed = true;
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Gather reply failed for ${state.callId}: ${reason}`);
      aiCallingLog.warn('llm', `Gather LLM reply failed: ${reason}`, { callId: state.callId, channel: 'phone' });
    } finally {
      clearTimeout(timer);
    }

    const head = raw.trimStart();
    const tag = TONE_TAG.exec(head);
    if (tag && isVoiceTone(tag[1])) state.tone = tag[1];
    const clean = speakable(raw);

    if (!failed && clean) {
      state.replyFailures = 0;
      const endsByMarker = raw.includes(END_CALL_MARKER) && !/[?？]\s*$/.test(clean);
      return { replyText: clean, shouldEnd: endsByMarker };
    }

    state.replyFailures++;
    if (state.replyFailures >= 2) {
      return { replyText: STOCK_PHRASES[state.language].troubleGoodbye, shouldEnd: true };
    }
    return { replyText: STOCK_PHRASES[state.language].repeat, shouldEnd: false };
  }

  private async buildTurnTwiml(
    state: GatherSessionState,
    text: string,
    publicUrl: string,
    resolved: ResolvedProviders | null,
    hangup: boolean,
  ): Promise<string> {
    const cleanBase = publicUrl.replace(/\/+$/, '');
    const key = this.runner.tokens.callKey(state.callId);
    const actionUrl = `${cleanBase}/api/ai-calling/twilio/gather?callId=${encodeURIComponent(state.callId)}&key=${key}`;
    const redirectUrl = `${cleanBase}/api/ai-calling/twilio/gather?callId=${encodeURIComponent(state.callId)}&key=${key}&silent=1`;
    const playUrl = await this.synthesizeAudioUrl(state, text, cleanBase, resolved);
    return gatherTwiml({
      playUrl: playUrl ?? undefined,
      sayText: text,
      language: state.language,
      actionUrl,
      redirectUrl,
      hangup,
    });
  }

  private async synthesizeAudioUrl(
    state: GatherSessionState,
    text: string,
    publicUrl: string,
    resolved: ResolvedProviders | null,
  ): Promise<string | null> {
    const clean = speakable(text);
    if (!clean) return null;
    const sarvamKey = resolved?.secrets.SARVAM_API_KEY ?? process.env.SARVAM_API_KEY?.trim() ?? null;
    const isOverride = Boolean(resolved?.config.overrideAgentSettings ?? true);
    const speaker = state.language === 'hi-IN' ? state.agent.hindiVoice : state.agent.gujaratiVoice;
    const style = voiceStyle(state.tone, state.agent.pace);

    let mulaw: Buffer | null = null;
    try {
      const speech =
        resolved && isOverride
          ? speechFactoryFor(resolved.config, {
              sarvam: sarvamKey,
              deepgram: resolved.secrets.DEEPGRAM_API_KEY,
              elevenlabs: resolved.secrets.ELEVENLABS_API_KEY,
            })
          : sarvamKey
            ? speechFactoryFor(
                {
                  ...DEFAULT_PROVIDERS,
                  ...(await this.providers?.config()),
                  stt: 'sarvam',
                  ttsGujarati: 'sarvam',
                  ttsHindi: 'sarvam',
                  ttsEnglish: 'sarvam',
                },
                { sarvam: sarvamKey, deepgram: null, elevenlabs: null },
              )
            : null;
      if (!speech) return null;

      mulaw = await new Promise<Buffer | null>(resolve => {
        const chunks: Buffer[] = [];
        let settled = false;
        const tts = speech.tts({
          apiKey: sarvamKey ?? '',
          languageCode: state.language,
          speaker,
          pace: style.pace,
          temperature: style.temperature,
        });
        const finish = (buf: Buffer | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            tts.close();
          } catch {
            // ignore
          }
          resolve(buf);
        };
        const timer = setTimeout(() => {
          finish(chunks.length > 0 ? Buffer.concat(chunks) : null);
        }, TTS_SYNTH_TIMEOUT_MS);
        timer.unref?.();

        tts.on('audio', (chunk: Buffer) => chunks.push(chunk));
        tts.once('spoken', () => finish(chunks.length > 0 ? Buffer.concat(chunks) : null));
        tts.once('error', err => {
          this.logger.warn(`Gather TTS fallback to <Say> for ${state.callId}: ${err.message}`);
          finish(null);
        });
        tts.say(clean);
      });
    } catch (err) {
      this.logger.warn(
        `Could not synthesize Gather audio for ${state.callId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      mulaw = null;
    }

    if (!mulaw || mulaw.length === 0) return null;
    this.pruneExpiredClips();
    const clipId = randomUUID();
    this.clips.set(clipId, {
      contentType: 'audio/wav',
      data: mulawToPcm16Wav(mulaw, 8000),
      expiresAt: Date.now() + CLIP_TTL_MS,
    });
    return `${publicUrl}/api/ai-calling/twilio/audio/${clipId}?key=${this.runner.tokens.callKey(clipId)}`;
  }

  private pruneExpiredClips(): void {
    const now = Date.now();
    for (const [id, clip] of this.clips.entries()) {
      if (clip.expiresAt < now || this.clips.size > MAX_CLIPS) this.clips.delete(id);
    }
  }

  private async persistProgress(state: GatherSessionState): Promise<void> {
    await this.callRepo
      .update(state.callId, { transcript: state.transcript, language: state.language })
      .catch(() => undefined);
  }

  private async finalize(state: GatherSessionState, durationSeconds: number): Promise<void> {
    if (state.finalized) return;
    state.finalized = true;
    this.sessions.delete(state.callId);
    const endedAt = new Date();
    const safeDuration =
      durationSeconds > 0 ? durationSeconds : Math.max(1, Math.round((endedAt.getTime() - state.startedAt.getTime()) / 1000));
    await this.callRepo
      .update(state.callId, {
        status: AiCallStatus.COMPLETED,
        transcript: state.transcript,
        language: state.language,
        endedAt,
        durationSeconds: safeDuration,
        error: null,
      })
      .catch(err => this.logger.warn(`Could not finalize Gather call ${state.callId}: ${String(err)}`));
    aiCallingLog.info('call', `Twilio Speech Gather call completed (${state.transcript.length} turns, ${safeDuration}s)`, {
      callId: state.callId,
      channel: 'phone',
    });
    await this.outcome
      .process(state.callId, state.customerSpoke)
      .catch(err => this.logger.warn(`Could not process outcome for Gather call ${state.callId}: ${String(err)}`));
  }
}
