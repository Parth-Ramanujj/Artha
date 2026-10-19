import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AiCall, AiCallStatus, ACTIVE_CALL_STATUSES } from './entities/ai-call.entity';
import { AiCallBatch, AiCallBatchStatus } from './entities/ai-call-batch.entity';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiCallingService } from './ai-calling.service';
import { CallRunnerService } from './call-runner.service';
import { streamTwiml, TwilioClient, twilioConfigFromEnv } from './twilio.client';
import { createLogger } from '../../common/services/logger.service';

const TICK_MS = 5000;
// A call still marked active this long after it started belonged to a process that died.
const STALE_ACTIVE_MS = 20 * 60 * 1000;
const QUEUE_SCAN = 200;

/** Minutes since local midnight in a time zone. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function withinCallingHours(
  agent: Pick<VoiceAgent, 'callingStart' | 'callingEnd' | 'callingTimezone'>,
  now: Date,
): boolean {
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const minutes = localMinutes(now, agent.callingTimezone || 'Asia/Kolkata');
  const start = toMin(agent.callingStart);
  const end = toMin(agent.callingEnd);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

const TWILIO_FINAL: Record<string, AiCallStatus> = {
  busy: AiCallStatus.BUSY,
  'no-answer': AiCallStatus.NO_ANSWER,
  failed: AiCallStatus.FAILED,
  canceled: AiCallStatus.CANCELED,
};

/** Places queued calls through Twilio and keeps their status in step with Twilio's callbacks. */
@Injectable()
export class DialerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('AiCallDialer');
  private timer?: NodeJS.Timeout;
  private ticking = false;
  /** Calls whose TwiML Twilio fetched, i.e. that got past ringing (and a trial account's key press). */
  private readonly connecting = new Set<string>();

  constructor(
    @InjectRepository(AiCall, 'data') private readonly callRepo: Repository<AiCall>,
    @InjectRepository(AiCallBatch, 'data') private readonly batchRepo: Repository<AiCallBatch>,
    @InjectRepository(VoiceAgent, 'data') private readonly agentRepo: Repository<VoiceAgent>,
    private readonly calling: AiCallingService,
    private readonly runner: CallRunnerService,
  ) {}

  onModuleInit(): void {
    void this.recoverStale().catch(err => this.logger.warn(`Stale call recovery failed: ${String(err)}`));
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.runner.endAll();
  }

  /** Calls left "active" by a previous process can never finish; close them so they stop counting. */
  async recoverStale(now = new Date()): Promise<number> {
    const stale = await this.callRepo.find({ where: { status: In(ACTIVE_CALL_STATUSES) } });
    let closed = 0;
    for (const call of stale) {
      const started = (call.startedAt ?? call.createdAt).getTime();
      if (this.runner.isLive(call.id) || now.getTime() - started < STALE_ACTIVE_MS) continue;
      await this.callRepo.update(call.id, {
        status: AiCallStatus.FAILED,
        error: 'The server restarted during this call',
        endedAt: now,
      });
      closed++;
    }
    return closed;
  }

  async tick(now = new Date()): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      return await this.dialDue(now);
    } catch (err) {
      this.logger.warn(`Dialer tick failed: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  private async dialDue(now: Date): Promise<number> {
    const twilio = twilioConfigFromEnv();
    const publicUrl = await this.calling.getPublicUrl();
    if (!twilio || !publicUrl) return 0;

    const queued = await this.callRepo.find({
      where: { status: AiCallStatus.QUEUED, channel: 'phone' },
      order: { createdAt: 'ASC' },
      take: QUEUE_SCAN,
    });
    const due = queued.filter(c => !c.nextAttemptAt || c.nextAttemptAt.getTime() <= now.getTime());
    if (due.length === 0) {
      await this.completeFinishedBatches();
      return 0;
    }

    const agents = new Map<string, VoiceAgent | null>();
    const batches = new Map<string, AiCallBatch | null>();
    const active = new Map<string, number>();
    for (const row of await this.callRepo.find({
      where: { status: In(ACTIVE_CALL_STATUSES) },
      select: { agentId: true },
    })) {
      active.set(row.agentId, (active.get(row.agentId) ?? 0) + 1);
    }

    const client = new TwilioClient(twilio);
    let dialled = 0;
    for (const call of due) {
      if (!agents.has(call.agentId))
        agents.set(call.agentId, await this.agentRepo.findOne({ where: { id: call.agentId } }));
      const agent = agents.get(call.agentId);
      if (!agent) {
        await this.callRepo.update(call.id, { status: AiCallStatus.FAILED, error: 'Calling agent was deleted' });
        continue;
      }
      if (call.batchId) {
        if (!batches.has(call.batchId))
          batches.set(call.batchId, await this.batchRepo.findOne({ where: { id: call.batchId } }));
        if (batches.get(call.batchId)?.status !== AiCallBatchStatus.RUNNING) continue;
      }
      if (!withinCallingHours(agent, now)) continue;
      if ((active.get(agent.id) ?? 0) >= agent.concurrency) continue;
      if (await this.calling.isDoNotCall(call.businessId, call.phone)) {
        await this.callRepo.update(call.id, { status: AiCallStatus.SKIPPED, error: 'Contact opted out (DND)' });
        continue;
      }

      // Claim the row first so a second tick (or instance) cannot dial the same call.
      const claim = await this.callRepo.update(
        { id: call.id, status: AiCallStatus.QUEUED },
        { status: AiCallStatus.DIALING, attempts: call.attempts + 1, startedAt: now, error: null },
      );
      if (!claim.affected) continue;
      active.set(agent.id, (active.get(agent.id) ?? 0) + 1);

      try {
        const result = await client.createCall({
          to: call.phone,
          twimlUrl: `${publicUrl}/api/ai-calling/twilio/twiml?callId=${encodeURIComponent(call.id)}&key=${this.runner.tokens.callKey(call.id)}`,
          statusCallback: `${publicUrl}/api/ai-calling/twilio/status`,
        });
        await this.callRepo.update(call.id, { twilioCallSid: result.sid });
        dialled++;
        this.logger.log(`Dialling ${call.phone} (call ${call.id})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.callRepo.update(call.id, { status: AiCallStatus.FAILED, error: message, endedAt: new Date() });
        active.set(agent.id, (active.get(agent.id) ?? 1) - 1);
        this.logger.warn(`Could not dial ${call.phone}: ${message}`);
      }
    }
    await this.completeFinishedBatches();
    return dialled;
  }

  /**
   * TwiML for an answered call (Twilio fetches it, signature already checked): connects the call to
   * our media stream with a fresh one-call token, or hangs up a call we did not place or no longer want.
   */
  async twimlFor(callId: string | undefined): Promise<string> {
    const hangup = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
    const call = callId ? await this.callRepo.findOne({ where: { id: callId } }) : null;
    const publicUrl = await this.calling.getPublicUrl();
    if (!call || !publicUrl || call.channel !== 'phone' || !ACTIVE_CALL_STATUSES.includes(call.status)) return hangup;
    const host = publicUrl.replace(/^https:\/\//i, '');
    this.connecting.add(call.id);
    this.logger.log(`Connecting answered call ${call.id} to the AI agent`);
    // Twilio reports stream start, stop and errors (e.g. it could not reach the websocket) here.
    const streamStatus = `${publicUrl}/api/ai-calling/twilio/stream-status?callId=${encodeURIComponent(call.id)}&key=${this.runner.tokens.callKey(call.id)}`;
    return streamTwiml(
      `wss://${host}/api/ai-calling/stream`,
      { token: this.runner.tokens.issue(call.id) },
      streamStatus,
    );
  }

  /** A Twilio stream error is the real reason a call never reached the AI; keep it on the call. */
  async onStreamEvent(callId: string | undefined, event: string, error?: string): Promise<void> {
    if (!callId || event !== 'stream-error') return;
    await this.callRepo.update(callId, {
      error: `Twilio could not open the audio stream: ${error ?? 'unknown error'}`,
    });
  }

  /** Twilio status callback (already signature-checked). */
  async onTwilioStatus(params: Record<string, string>): Promise<void> {
    const sid = params.CallSid;
    if (!sid) return;
    const call = await this.callRepo.findOne({ where: { twilioCallSid: sid } });
    if (!call) return;
    const status = params.CallStatus;

    if (status === 'ringing' && call.status === AiCallStatus.DIALING) {
      await this.callRepo.update({ id: call.id, status: AiCallStatus.DIALING }, { status: AiCallStatus.RINGING });
      return;
    }
    if (status === 'completed') {
      const reached = this.connecting.delete(call.id);
      // A live conversation saves itself when it ends; this only closes calls that never connected.
      if (!this.runner.isLive(call.id) && call.status !== AiCallStatus.COMPLETED && !call.transcript?.length) {
        await this.callRepo.update(
          { id: call.id, status: Not(AiCallStatus.COMPLETED) },
          {
            status: AiCallStatus.COMPLETED,
            endedAt: new Date(),
            durationSeconds: Number(params.CallDuration ?? 0) || 0,
            // Say why the AI never spoke, so it is not a mystery in the call log.
            error: reached
              ? 'The call was answered but the audio stream to the AI never opened'
              : 'The call ended before it reached the AI. On a Twilio trial account, press any key after Twilio\x27s message.',
          },
        );
      }
      return;
    }
    const final = TWILIO_FINAL[status];
    if (!final) return;

    const agent = await this.agentRepo.findOne({ where: { id: call.agentId } });
    const retry =
      (final === AiCallStatus.NO_ANSWER || final === AiCallStatus.BUSY) && agent && call.attempts < agent.maxAttempts;
    if (retry) {
      await this.callRepo.update(call.id, {
        status: AiCallStatus.QUEUED,
        nextAttemptAt: new Date(Date.now() + agent.retryAfterMinutes * 60 * 1000),
        error: final === AiCallStatus.BUSY ? 'Busy — will retry' : 'No answer — will retry',
        twilioCallSid: null,
      });
    } else {
      await this.callRepo.update(call.id, {
        status: final,
        endedAt: new Date(),
        error: params.ErrorMessage || (final === AiCallStatus.FAILED ? 'Twilio could not connect the call' : null),
      });
    }
  }

  private async completeFinishedBatches(): Promise<void> {
    const running = await this.batchRepo.find({ where: { status: AiCallBatchStatus.RUNNING } });
    for (const batch of running) {
      const open = await this.callRepo.count({
        where: { batchId: batch.id, status: In([AiCallStatus.QUEUED, ...ACTIVE_CALL_STATUSES]) },
      });
      if (open === 0) await this.batchRepo.update(batch.id, { status: AiCallBatchStatus.COMPLETED });
    }
  }
}
