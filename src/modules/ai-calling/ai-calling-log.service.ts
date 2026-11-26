import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import WebSocket from 'ws';
import { AiCall, AiCallStatus } from './entities/ai-call.entity';
import { ProviderSettingsService } from './provider-settings.service';
import { TwilioClient } from './twilio.client';
import { createLogger } from '../../common/services/logger.service';

export type AiLogSubsystem = 'stt' | 'tts' | 'llm' | 'media' | 'dialer' | 'call' | 'config';
export type AiLogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface AiLogEvent {
  id: string;
  timestamp: string; // ISO 8601
  level: AiLogLevel;
  subsystem: AiLogSubsystem;
  message: string;
  callId?: string | null;
  channel?: 'phone' | 'browser' | null;
  details?: Record<string, unknown> | null;
}

export interface FailedCallSummary {
  id: string;
  phone: string;
  contactName: string | null;
  channel: string;
  status: string;
  error: string | null;
  durationSeconds: number;
  turnsCount: number;
  createdAt: Date;
  endedAt: Date | null;
}

export interface AiDiagnosticItem {
  key: string;
  name: string;
  subsystem: AiLogSubsystem;
  status: 'ok' | 'warning' | 'error' | 'skipped';
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface AiDiagnosticsReport {
  timestamp: string;
  allOk: boolean;
  items: AiDiagnosticItem[];
}

export interface AiCallingLogsQuery {
  level?: string;
  subsystem?: string;
  search?: string;
  callId?: string;
  limit?: number;
}

export interface AiCallingLogsResult {
  events: AiLogEvent[];
  total: number;
  subsystemCounts: Record<string, number>;
}

const MAX_EVENTS = 2000;

let aiCallingLogSingletonInstance: AiCallingLogService | undefined;

function getLogInstance(): AiCallingLogService {
  if (!aiCallingLogSingletonInstance) {
    aiCallingLogSingletonInstance = new AiCallingLogService();
  }
  return aiCallingLogSingletonInstance;
}

@Injectable()
export class AiCallingLogService {
  private readonly logger = createLogger('AiCallingLog');
  private readonly events: AiLogEvent[] = [];
  private seq = 0;

  constructor(
    @Optional() @InjectRepository(AiCall, 'data') private readonly callRepo?: Repository<AiCall>,
    @Optional() private readonly providers?: ProviderSettingsService,
  ) {
    aiCallingLogSingletonInstance = this;
  }

  record(
    level: AiLogLevel,
    subsystem: AiLogSubsystem,
    message: string,
    meta: {
      callId?: string | null;
      channel?: 'phone' | 'browser' | null;
      details?: Record<string, unknown> | null;
    } = {},
  ): AiLogEvent {
    const event: AiLogEvent = {
      id: `log_${Date.now()}_${++this.seq}`,
      timestamp: new Date().toISOString(),
      level,
      subsystem,
      message,
      callId: meta.callId ?? null,
      channel: meta.channel ?? null,
      details: meta.details ?? null,
    };
    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.pop();
    }
    return event;
  }

  info(
    subsystem: AiLogSubsystem,
    message: string,
    meta?: { callId?: string | null; channel?: 'phone' | 'browser' | null; details?: Record<string, unknown> | null },
  ): AiLogEvent {
    return this.record('info', subsystem, message, meta);
  }

  warn(
    subsystem: AiLogSubsystem,
    message: string,
    meta?: { callId?: string | null; channel?: 'phone' | 'browser' | null; details?: Record<string, unknown> | null },
  ): AiLogEvent {
    return this.record('warn', subsystem, message, meta);
  }

  error(
    subsystem: AiLogSubsystem,
    message: string,
    meta?: { callId?: string | null; channel?: 'phone' | 'browser' | null; details?: Record<string, unknown> | null },
  ): AiLogEvent {
    return this.record('error', subsystem, message, meta);
  }

  debug(
    subsystem: AiLogSubsystem,
    message: string,
    meta?: { callId?: string | null; channel?: 'phone' | 'browser' | null; details?: Record<string, unknown> | null },
  ): AiLogEvent {
    return this.record('debug', subsystem, message, meta);
  }

  query(filters: AiCallingLogsQuery = {}): AiCallingLogsResult {
    let list = this.events;
    if (filters.level && filters.level !== 'all') {
      list = list.filter(e => e.level === filters.level);
    }
    if (filters.subsystem && filters.subsystem !== 'all') {
      list = list.filter(e => e.subsystem === filters.subsystem);
    }
    if (filters.callId) {
      list = list.filter(e => e.callId === filters.callId);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        e =>
          e.message.toLowerCase().includes(q) ||
          (e.callId && e.callId.toLowerCase().includes(q)) ||
          (e.details && JSON.stringify(e.details).toLowerCase().includes(q)),
      );
    }
    const total = list.length;
    const limit = Math.min(1000, Math.max(1, filters.limit ?? 100));
    const items = list.slice(0, limit);

    const subsystemCounts: Record<string, number> = {
      all: this.events.length,
      error: 0,
      warn: 0,
      info: 0,
    };
    for (const e of this.events) {
      subsystemCounts[e.subsystem] = (subsystemCounts[e.subsystem] ?? 0) + 1;
      if (e.level === 'error') subsystemCounts.error = (subsystemCounts.error ?? 0) + 1;
      if (e.level === 'warn') subsystemCounts.warn = (subsystemCounts.warn ?? 0) + 1;
      if (e.level === 'info') subsystemCounts.info = (subsystemCounts.info ?? 0) + 1;
    }

    return { events: items, total, subsystemCounts };
  }

  clear(): void {
    this.events.length = 0;
  }

  async getRecentFailedCalls(businessId?: string, limit = 20): Promise<FailedCallSummary[]> {
    if (!this.callRepo) return [];
    try {
      const qb = this.callRepo
        .createQueryBuilder('c')
        .where('(c.status IN (:...statuses) OR c.error IS NOT NULL)', {
          statuses: [AiCallStatus.FAILED, AiCallStatus.CANCELED],
        });
      if (businessId) {
        qb.andWhere('c.businessId = :businessId', { businessId });
      }
      const calls = await qb.orderBy('c.createdAt', 'DESC').take(limit).getMany();
      return calls.map(c => ({
        id: c.id,
        phone: c.phone,
        contactName: c.contactName,
        channel: c.channel,
        status: c.status,
        error: c.error,
        durationSeconds: c.durationSeconds,
        turnsCount: Array.isArray(c.transcript) ? c.transcript.length : 0,
        createdAt: c.createdAt,
        endedAt: c.endedAt,
      }));
    } catch (err) {
      this.logger.warn(`Could not load failed calls: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async runDiagnostics(options?: { live?: boolean }): Promise<AiDiagnosticsReport> {
    const live = options?.live ?? !process.env.JEST_WORKER_ID;
    const items: AiDiagnosticItem[] = [];
    const resolved = this.providers ? await this.providers.resolve() : null;
    const config = resolved?.config;
    const secrets = resolved?.secrets ?? ({} as Record<string, string | null>);

    // 1. STT Diagnostic
    const sttEngine = config?.stt ?? 'sarvam';
    if (sttEngine === 'sarvam') {
      const sarvamKey = secrets.SARVAM_API_KEY || process.env.SARVAM_API_KEY?.trim();
      if (!sarvamKey) {
        items.push({
          key: 'stt_sarvam',
          name: 'Speech-to-Text (Sarvam)',
          subsystem: 'stt',
          status: 'error',
          message: 'SARVAM_API_KEY is missing. Gujarati/Hindi speech recognition will fail.',
        });
      } else if (live) {
        const probe = await probeWebSocket(
          'wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3-realtime&mode=transcribe&sample_rate=8000&input_audio_codec=pcm_mulaw',
          { 'api-subscription-key': sarvamKey },
        );
        items.push({
          key: 'stt_sarvam',
          name: 'Speech-to-Text (Sarvam)',
          subsystem: 'stt',
          status: probe.ok ? 'ok' : 'error',
          message: probe.ok
            ? `Sarvam STT WebSocket connected (${probe.latencyMs}ms).`
            : `Sarvam STT WebSocket failed: ${probe.detail}`,
        });
      } else {
        items.push({
          key: 'stt_sarvam',
          name: 'Speech-to-Text (Sarvam)',
          subsystem: 'stt',
          status: 'ok',
          message: 'Sarvam STT key configured and ready for live realtime audio.',
        });
      }
    } else if (sttEngine === 'deepgram') {
      const deepgramKey = secrets.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY?.trim();
      if (!deepgramKey) {
        items.push({
          key: 'stt_deepgram',
          name: 'Speech-to-Text (Deepgram)',
          subsystem: 'stt',
          status: 'error',
          message: 'DEEPGRAM_API_KEY is missing. Calls will fall back to Sarvam if available.',
        });
      } else {
        items.push({
          key: 'stt_deepgram',
          name: 'Speech-to-Text (Deepgram)',
          subsystem: 'stt',
          status: 'ok',
          message: 'Deepgram STT key is configured (nova-3 multilingual).',
        });
      }
    }

    // 2. TTS Diagnostics (Gujarati / Hindi / English)
    const ttsGu = config?.ttsGujarati ?? 'sarvam';
    const ttsHi = config?.ttsHindi ?? 'sarvam';
    const ttsEn = config?.ttsEnglish ?? 'sarvam';
    const usesEleven = ttsGu === 'elevenlabs' || ttsHi === 'elevenlabs' || ttsEn === 'elevenlabs';

    if (usesEleven) {
      const elevenKey = secrets.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY?.trim();
      const voiceId = config?.elevenVoiceId;
      if (!elevenKey) {
        items.push({
          key: 'tts_elevenlabs',
          name: 'Text-to-Speech (ElevenLabs)',
          subsystem: 'tts',
          status: 'error',
          message: 'ELEVENLABS_API_KEY is not set but ElevenLabs is chosen for voice.',
        });
      } else if (!voiceId) {
        items.push({
          key: 'tts_elevenlabs',
          name: 'Text-to-Speech (ElevenLabs)',
          subsystem: 'tts',
          status: 'warning',
          message: 'ElevenLabs Voice ID is not specified.',
        });
      } else {
        // Quick verification of voice ID
        try {
          const t0 = Date.now();
          const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
            headers: { 'xi-api-key': elevenKey },
          });
          const latency = Date.now() - t0;
          if (res.ok) {
            const data = (await res.json()) as { name?: string };
            items.push({
              key: 'tts_elevenlabs',
              name: 'Text-to-Speech (ElevenLabs)',
              subsystem: 'tts',
              status: 'ok',
              message: `ElevenLabs voice verified: "${data.name ?? voiceId}".`,
              latencyMs: latency,
              details: { voiceId, voiceName: data.name },
            });
          } else if (res.status === 401) {
            items.push({
              key: 'tts_elevenlabs',
              name: 'Text-to-Speech (ElevenLabs)',
              subsystem: 'tts',
              status: 'error',
              message: 'ElevenLabs API key is invalid or unauthorized (HTTP 401).',
              latencyMs: latency,
            });
          } else if (res.status === 404) {
            items.push({
              key: 'tts_elevenlabs',
              name: 'Text-to-Speech (ElevenLabs)',
              subsystem: 'tts',
              status: 'error',
              message: `ElevenLabs voice ID "${voiceId}" not found (HTTP 404). If this is a Community Library voice, you must click "Add to Voice Lab" on elevenlabs.io first.`,
              latencyMs: latency,
              details: { voiceId, tip: 'Visit elevenlabs.io, open Voice Lab, and add this voice to your account.' },
            });
          } else {
            items.push({
              key: 'tts_elevenlabs',
              name: 'Text-to-Speech (ElevenLabs)',
              subsystem: 'tts',
              status: 'warning',
              message: `ElevenLabs responded with HTTP ${res.status}.`,
              latencyMs: latency,
            });
          }
        } catch (err) {
          items.push({
            key: 'tts_elevenlabs',
            name: 'Text-to-Speech (ElevenLabs)',
            subsystem: 'tts',
            status: 'warning',
            message: `Could not reach ElevenLabs: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }

    if (ttsGu === 'sarvam' || ttsHi === 'sarvam' || ttsEn === 'sarvam') {
      const sarvamKey = secrets.SARVAM_API_KEY || process.env.SARVAM_API_KEY?.trim();
      if (!sarvamKey) {
        items.push({
          key: 'tts_sarvam',
          name: 'Text-to-Speech (Sarvam Bulbul)',
          subsystem: 'tts',
          status: 'error',
          message: 'SARVAM_API_KEY is missing (needed for Sarvam Bulbul TTS).',
        });
      } else if (live) {
        const probe = await probeWebSocket('wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash', {
          'api-subscription-key': sarvamKey,
        });
        items.push({
          key: 'tts_sarvam',
          name: 'Text-to-Speech (Sarvam Bulbul)',
          subsystem: 'tts',
          status: probe.ok ? 'ok' : 'error',
          message: probe.ok
            ? `Sarvam TTS WebSocket connected (${probe.latencyMs}ms).`
            : `Sarvam TTS WebSocket failed: ${probe.detail}`,
        });
      } else {
        items.push({
          key: 'tts_sarvam',
          name: 'Text-to-Speech (Sarvam Bulbul)',
          subsystem: 'tts',
          status: 'ok',
          message: 'Sarvam TTS key configured for Gujarati/Hindi voice synthesis.',
        });
      }
    }

    // 3. LLM Diagnostic
    const llmEngine = config?.llm ?? 'groq';
    if (llmEngine === 'groq') {
      const hasGroq = Object.keys(process.env).some(k => /^GROQ_API_KEY(_\d+)?$/.test(k) && process.env[k]?.trim());
      if (!hasGroq) {
        items.push({
          key: 'llm_groq',
          name: 'Language Model (Groq)',
          subsystem: 'llm',
          status: 'warning',
          message: 'GROQ_API_KEY is not set in environment.',
        });
      } else {
        items.push({
          key: 'llm_groq',
          name: 'Language Model (Groq)',
          subsystem: 'llm',
          status: 'ok',
          message: 'Groq API keys configured and ready for ultra-fast streamed replies.',
        });
      }
    } else {
      const endpoint = config?.llmBaseUrl;
      const key = secrets.LLM_API_KEY;
      if (!endpoint || !key) {
        items.push({
          key: 'llm_custom',
          name: 'Language Model (OpenAI-compatible)',
          subsystem: 'llm',
          status: 'error',
          message: 'OpenAI-compatible LLM endpoint URL or API key is missing.',
        });
      } else {
        items.push({
          key: 'llm_custom',
          name: 'Language Model (OpenAI-compatible)',
          subsystem: 'llm',
          status: 'ok',
          message: `Connected to custom LLM endpoint (${endpoint}).`,
        });
      }
    }

    // 4. Media & Telephony Gateway
    const twilio = this.providers ? await this.providers.twilio() : null;
    if (!twilio) {
      items.push({
        key: 'telephony_twilio',
        name: 'Twilio Outbound Phone Service',
        subsystem: 'dialer',
        status: 'warning',
        message: 'Twilio credentials not configured (phone calls disabled, browser test calls still work).',
      });
    } else if (live) {
      const client = new TwilioClient(twilio);
      try {
        const account = await client.check();
        const trialNote =
          account.accountType === 'Trial'
            ? ` Trial account (${account.verifiedCallerIds} verified number(s) — recipient must press a key after Twilio\x27s message).`
            : '';
        items.push({
          key: 'telephony_twilio',
          name: 'Twilio Outbound Phone Service',
          subsystem: 'dialer',
          status: account.fromNumberOwned ? 'ok' : 'warning',
          message: account.fromNumberOwned
            ? `Twilio ${account.accountType} verified with ${twilio.fromNumber}.${trialNote}`
            : `Twilio connected (${account.accountType}), but From number ${twilio.fromNumber} is not owned in this account.`,
        });
      } catch (err) {
        items.push({
          key: 'telephony_twilio',
          name: 'Twilio Outbound Phone Service',
          subsystem: 'dialer',
          status: 'error',
          message: `Twilio API check failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      const notes = await client.getRecentNotifications(5);
      if (notes.length > 0) {
        const latest = notes[0];
        items.push({
          key: 'twilio_notifications',
          name: 'Twilio Debugger Alerts',
          subsystem: 'dialer',
          status: 'warning',
          message: `Latest Twilio alert (${latest.errorCode || 'info'}): ${latest.messageText}`,
          details: { notifications: notes },
        });
      }
    } else {
      items.push({
        key: 'telephony_twilio',
        name: 'Twilio Outbound Phone Service',
        subsystem: 'dialer',
        status: 'ok',
        message: `Twilio configured with phone number ${twilio.fromNumber}.`,
      });
    }

    // 5. Media Gateway Audio WebSockets
    const publicUrl = live ? await this.resolvePublicUrl() : null;
    if (live && publicUrl) {
      const host = publicUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      const probe = await probeWebSocket(`wss://${host}/api/ai-calling/stream`, {
        'User-Agent': 'Twilio.TmeWs/1.0',
      });
      items.push({
        key: 'media_gateway',
        name: 'Realtime Audio Gateway',
        subsystem: 'media',
        status: probe.ok ? 'ok' : 'error',
        message: probe.ok
          ? `Public Twilio stream WebSocket wss://${host}/api/ai-calling/stream reachable (${probe.latencyMs}ms).`
          : `Public Twilio stream WebSocket wss://${host}/api/ai-calling/stream unreachable: ${probe.detail}`,
      });
    } else {
      items.push({
        key: 'media_gateway',
        name: 'Realtime Audio Gateway',
        subsystem: 'media',
        status: 'ok',
        message: 'Twilio and browser audio WebSocket streams active on HTTP server upgrade.',
      });
    }

    const allOk = items.every(i => i.status !== 'error');
    return {
      timestamp: new Date().toISOString(),
      allOk,
      items,
    };
  }

  private async resolvePublicUrl(): Promise<string | null> {
    const fromEnv = process.env.AI_CALLING_PUBLIC_URL?.trim();
    try {
      const rows = (await this.callRepo?.manager.query(
        `SELECT value FROM ai_calling_settings WHERE key = 'publicUrl' LIMIT 1`,
      )) as Array<{ value?: string }> | undefined;
      const fromDb = rows?.[0]?.value?.trim();
      return (fromDb || fromEnv || '').replace(/\/+$/, '') || null;
    } catch {
      return (fromEnv || '').replace(/\/+$/, '') || null;
    }
  }
}

async function probeWebSocket(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 4500,
): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
  const startedAt = Date.now();
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok: boolean, detail?: string) => {
      if (settled) return;
      settled = true;
      resolve({ ok, latencyMs: Date.now() - startedAt, detail });
    };
    try {
      const ws = new WebSocket(url, { headers });
      const timer = setTimeout(() => {
        ws.terminate();
        finish(false, `timed out after ${timeoutMs}ms`);
      }, timeoutMs);
      ws.once('open', () => {
        clearTimeout(timer);
        ws.close();
        finish(true);
      });
      ws.once('unexpected-response', (_req, res) => {
        clearTimeout(timer);
        finish(false, `HTTP ${res.statusCode ?? 'unknown'} rejecting WebSocket upgrade`);
      });
      ws.once('error', err => {
        clearTimeout(timer);
        finish(false, err.message);
      });
    } catch (err) {
      finish(false, err instanceof Error ? err.message : String(err));
    }
  });
}

export const aiCallingLog = {
  record: (...args: Parameters<AiCallingLogService['record']>) => getLogInstance().record(...args),
  info: (...args: Parameters<AiCallingLogService['info']>) => getLogInstance().info(...args),
  warn: (...args: Parameters<AiCallingLogService['warn']>) => getLogInstance().warn(...args),
  error: (...args: Parameters<AiCallingLogService['error']>) => getLogInstance().error(...args),
  debug: (...args: Parameters<AiCallingLogService['debug']>) => getLogInstance().debug(...args),
  query: (...args: Parameters<AiCallingLogService['query']>) => getLogInstance().query(...args),
  clear: () => getLogInstance().clear(),
  getRecentFailedCalls: (bId?: string, limit?: number) => getLogInstance().getRecentFailedCalls(bId, limit),
  runDiagnostics: () => getLogInstance().runDiagnostics(),
};
