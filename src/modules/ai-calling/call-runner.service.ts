import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCall, AiCallStatus } from './entities/ai-call.entity';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiService } from '../ai/ai.service';
import { CallSession, CallSessionResult, CallTransport, ChatMessage } from './call-session';
import { CallOutcomeService } from './call-outcome.service';
import { CallTokens } from './transports';
import { sarvamSpeech, type SpeechFactory } from './sarvam';
import { ProviderSettingsService } from './provider-settings.service';
import { openAiCompatibleStream, speechFactoryFor } from './speech-router';
import { createLogger } from '../../common/services/logger.service';

export const SPEECH_FACTORY = Symbol('AI_CALLING_SPEECH_FACTORY');

// Saving on every turn keeps the dashboard's live view current without a write per audio frame.
const TRANSCRIPT_SAVE_MS = 1500;

const logger = createLogger('AiCallRunner');

/** Connects an answered call (or a browser test) to a live AI conversation and stores the result. */
@Injectable()
export class CallRunnerService {
  private readonly logger = logger;
  readonly tokens = new CallTokens();
  private readonly live = new Map<string, CallSession>();
  /** Calls between token check and session start, so a second socket with the same token is refused. */
  private readonly attaching = new Set<string>();
  /** Results still being saved; shutdown waits for them. */
  private readonly saving = new Set<Promise<void>>();
  constructor(
    @InjectRepository(AiCall, 'data') private readonly callRepo: Repository<AiCall>,
    @InjectRepository(VoiceAgent, 'data') private readonly agentRepo: Repository<VoiceAgent>,
    private readonly outcome: CallOutcomeService,
    @Optional() private readonly ai?: AiService,
    // Speech-to-text and text-to-speech provider: Sarvam unless the module binds another one to SPEECH_FACTORY.
    @Optional() @Inject(SPEECH_FACTORY) private speech: SpeechFactory = sarvamSpeech,
    // Saved provider choices and keys, read at the start of every call so changes apply without a redeploy.
    @Optional() private readonly providers?: ProviderSettingsService,
  ) {}

  /** Tests swap in fake speech streams. */
  useSpeech(factory: SpeechFactory): void {
    this.speechOverride = factory;
  }

  private speechOverride?: SpeechFactory;

  /** Being set up, talking, or saving its result: no one else may touch the call's status. */
  isLive(callId: string): boolean {
    return this.live.has(callId) || this.attaching.has(callId);
  }

  get liveCount(): number {
    return this.live.size;
  }

  /** Starts the conversation for a verified token; closes the link when the token or call is not valid. */
  async attach(
    token: string | undefined,
    transport: CallTransport,
    expectedChannel: 'phone' | 'browser',
  ): Promise<boolean> {
    const callId = this.tokens.verify(token);
    if (!callId || this.isLive(callId)) {
      transport.hangup();
      return false;
    }
    this.attaching.add(callId);
    try {
      return await this.start(callId, transport, expectedChannel);
    } finally {
      this.attaching.delete(callId);
    }
  }

  private async start(
    callId: string,
    transport: CallTransport,
    expectedChannel: 'phone' | 'browser',
  ): Promise<boolean> {
    const call = await this.callRepo.findOne({ where: { id: callId } });
    const startable = [AiCallStatus.DIALING, AiCallStatus.RINGING, AiCallStatus.IN_PROGRESS];
    if (!call || call.channel !== expectedChannel || !startable.includes(call.status)) {
      logger.warn(
        `Call ${callId} not started: ${!call ? 'not found' : `channel ${call.channel} / status ${call.status}`}`,
      );
      transport.hangup();
      return false;
    }
    const agent = await this.agentRepo.findOne({ where: { id: call.agentId } });
    const resolved = this.providers ? await this.providers.resolve() : null;
    const sarvamApiKey = resolved ? resolved.secrets.SARVAM_API_KEY : (process.env.SARVAM_API_KEY?.trim() ?? null);

    const needsSarvamStt = !resolved || resolved.config.stt === 'sarvam' || !resolved.secrets.DEEPGRAM_API_KEY;
    const needsSarvamTts =
      !resolved ||
      !resolved.secrets.ELEVENLABS_API_KEY ||
      !resolved.config.elevenVoiceId ||
      resolved.config.ttsGujarati === 'sarvam' ||
      resolved.config.ttsHindi === 'sarvam';
    const missingSpeechKey =
      (needsSarvamStt || needsSarvamTts) && !sarvamApiKey
        ? 'SARVAM_API_KEY is not set (Sarvam is needed for Gujarati/Hindi voice or speech-to-text)'
        : resolved?.config.stt === 'deepgram' && !resolved.secrets.DEEPGRAM_API_KEY && !sarvamApiKey
          ? 'DEEPGRAM_API_KEY is not set'
          : null;

    if (!agent || missingSpeechKey || !this.ai) {
      logger.warn(
        `Call ${callId} failed to start: ${missingSpeechKey ?? (agent ? 'AI service missing' : 'calling agent missing')}`,
      );
      await this.callRepo.update(call.id, {
        status: AiCallStatus.FAILED,
        error: missingSpeechKey ?? (!agent ? 'Calling agent missing' : 'AI service unavailable'),
        endedAt: new Date(),
      });
      transport.hangup();
      return false;
    }

    const ai = this.ai;
    const answeredAt = new Date();
    const speech =
      this.speechOverride ??
      (resolved
        ? speechFactoryFor(resolved.config, {
            sarvam: sarvamApiKey,
            deepgram: resolved.secrets.DEEPGRAM_API_KEY,
            elevenlabs: resolved.secrets.ELEVENLABS_API_KEY,
          })
        : this.speech);
    const llmEndpoint =
      resolved?.config.llm === 'openai-compatible' && resolved.config.llmBaseUrl && resolved.secrets.LLM_API_KEY
        ? {
            baseUrl: resolved.config.llmBaseUrl,
            apiKey: resolved.secrets.LLM_API_KEY,
            model: resolved.config.llmModel || agent.model,
          }
        : null;
    if (resolved?.config.llm === 'openai-compatible' && !llmEndpoint) {
      logger.warn('LLM set to an OpenAI-compatible endpoint but its address or key is missing; using Groq');
    }
    await this.callRepo.update(call.id, { status: AiCallStatus.IN_PROGRESS, answeredAt });
    const session = new CallSession(transport, {
      agent,
      contactName: call.contactName,
      greeting: call.greeting,
      briefing: call.briefing,
      sarvamApiKey: sarvamApiKey ?? '',
      speech,
      reply: (messages: ChatMessage[], signal: AbortSignal) =>
        llmEndpoint
          ? openAiCompatibleStream(llmEndpoint, messages, { maxTokens: 300, temperature: 0.6, signal })
          : ai.streamComplete(messages, {
              model: agent.model,
              maxTokens: 300,
              temperature: 0.6,
              reasoningEffort: 'low',
              signal,
            }),
    });
    this.live.set(call.id, session);
    logger.log(`AI call ${call.id} started (${expectedChannel})`);

    let saveTimer: NodeJS.Timeout | undefined;
    session.on('turn', () => {
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = undefined;
        void this.callRepo.update(call.id, { transcript: session.turns }).catch(() => undefined);
      }, TRANSCRIPT_SAVE_MS);
    });
    session.on('ended', (result: CallSessionResult) => {
      logger.log(`AI call ${call.id} ended: ${result.reason}${result.error ? ` (${result.error})` : ''}`);
      if (saveTimer) clearTimeout(saveTimer);
      // Stays "live" until saved, so a late Twilio callback cannot overwrite the real result.
      const saved = this.complete(call.id, answeredAt, result).finally(() => {
        this.live.delete(call.id);
        this.saving.delete(saved);
      });
      this.saving.add(saved);
    });
    session.start();
    this.logger.log(`AI call ${call.id} connected (${expectedChannel})`);
    return true;
  }

  private async complete(callId: string, answeredAt: Date, result: CallSessionResult): Promise<void> {
    try {
      const endedAt = new Date();
      await this.callRepo.update(callId, {
        status: result.reason === 'error' ? AiCallStatus.FAILED : AiCallStatus.COMPLETED,
        transcript: result.transcript,
        language: result.language,
        endedAt,
        durationSeconds: Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000),
        error: result.error ?? null,
      });
      await this.outcome.process(callId, result.customerSpoke);
    } catch (err) {
      this.logger.error(`Could not save AI call ${callId}`, err instanceof Error ? err.message : String(err));
    }
  }

  /** Ends every live conversation, e.g. on shutdown, and waits until their results are saved. */
  async endAll(): Promise<void> {
    for (const session of this.live.values()) session.finish('error', 'Server stopped during the call');
    await Promise.all(this.saving);
  }
}
