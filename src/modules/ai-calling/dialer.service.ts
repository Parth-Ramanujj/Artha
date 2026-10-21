import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AiCall, AiCallStatus, ACTIVE_CALL_STATUSES } from './entities/ai-call.entity';
import { AiCallBatch, AiCallBatchStatus } from './entities/ai-call-batch.entity';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiCallingService } from './ai-calling.service';
import { CallRunnerService } from './call-runner.service';
import { CallOutcomeService } from './call-outcome.service';
import { streamTwiml, TwilioApiError, TwilioClient, twilioConfigFromEnv } from './twilio.client';
import { createLogger } from '../../common/services/logger.service';

const TICK_MS = 5000;
// A call still marked active this long after it started belonged to a process that died.
const STALE_ACTIVE_MS = 20 * 60 * 1000;
// A browser test whose microphone link never opened (its token lives 60 s) is abandoned.
const STALE_BROWSER_MS = 2 * 60 * 1000;
const QUEUE_SCAN = 200;
// An unfinished phone call this quiet (no status update) is checked against Twilio.
const RECONCILE_AFTER_MS = 90 * 1000;
// Twilio overloaded or unreachable: try the same call again shortly instead of failing it.
const TRANSIENT_RETRY_MS = 60 * 1000;

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
  /** When each quiet call was last checked with Twilio, so it is asked at most every 90 s. */
  private readonly reconciled = new Map<string, number>();

  constructor(
    @InjectRepository(AiCall, 'data') private readonly callRepo: Repository<AiCall>,
    @InjectRepository(AiCallBatch, 'data') private readonly batchRepo: Repository<AiCallBatch>,
    @InjectRepository(VoiceAgent, 'data') private readonly agentRepo: Repository<VoiceAgent>,
    private readonly calling: AiCallingService,
    private readonly runner: CallRunnerService,
    private readonly outcome: CallOutcomeService,
  ) {}

  onModuleInit(): void {
    void this.recoverStale().catch(err => this.logger.warn(`Stale call recovery failed: ${String(err)}`));
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.runner.endAll();
  }

  /** Calls left "active" by a previous process can never finish; close them so they stop counting. */
  async recoverStale(now = new Date()): Promise<number> {
    const stale = await this.callRepo.find({ where: { status: In(ACTIVE_CALL_STATUSES) } });
    let closed = 0;
    for (const call of stale) {
      const started = (call.startedAt ?? call.createdAt).getTime();
      const browser = call.channel === 'browser';
      const limit = browser ? STALE_BROWSER_MS : STALE_ACTIVE_MS;
      if (this.runner.isLive(call.id) || now.getTime() - started < limit) continue;
      if (!browser && call.transcript?.length) {
        await this.finishOrphan(call, now, 'The server restarted during the call; the transcript up to then was kept');
        closed++;
        continue;
      }
      await this.callRepo.update(
        { id: call.id, status: In(ACTIVE_CALL_STATUSES) },
        {
          status: AiCallStatus.FAILED,
          error: browser ? 'The browser test call never connected' : 'The call was left unfinished (server restart)',
          endedAt: now,
        },
      );
      this.connecting.delete(call.id);
      this.reconciled.delete(call.id);
      closed++;
    }
    return closed;
  }

  async tick(now = new Date()): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      await this.recoverStale(now);
      await this.reconcileWithTwilio(now);
      return await this.dialDue(now);
    } catch (err) {
      this.logger.warn(`Dialer tick failed: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  /** Queued phone calls that may be dialled: not held back by a paused or cancelled list. */
  private queued(agentId?: string) {
    const qb = this.callRepo
      .createQueryBuilder('c')
      .leftJoin(AiCallBatch, 'b', 'b.id = c.batchId')
      .where('c.status = :queued', { queued: AiCallStatus.QUEUED })
      .andWhere("c.channel = 'phone'")
      .andWhere('(c.batchId IS NULL OR b.status = :running)', { running: AiCallBatchStatus.RUNNING });
    if (agentId) qb.andWhere('c.agentId = :agentId', { agentId });
    return qb;
  }

  private async dialDue(now: Date): Promise<number> {
    // Each agent is scanned on its own, so one agent's backlog never hides another's calls.
    const agentIds = (
      await this.queued().select('c.agentId', 'agentId').distinct(true).getRawMany<{ agentId: string }>()
    ).map(r => r.agentId);
    if (agentIds.length === 0) {
      await this.completeFinishedBatches();
      return 0;
    }
    const twilio = twilioConfigFromEnv();
    const publicUrl = await this.calling.getPublicUrl();
    const missing = !twilio
      ? 'Waiting: Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)'
      : !publicUrl
        ? 'Waiting: set the public https address (tunnel) in AI Calling setup'
        : null;

    const active = new Map<string, number>();
    // Only phone calls use a line; browser tests must never hold up real calls.
    for (const row of await this.callRepo.find({
      where: { status: In(ACTIVE_CALL_STATUSES), channel: 'phone' },
      select: { agentId: true },
    })) {
      active.set(row.agentId, (active.get(row.agentId) ?? 0) + 1);
    }

    const client = twilio ? new TwilioClient(twilio) : null;
    let dialled = 0;
    for (const agentId of agentIds) {
      // Soonest first: retries scheduled for later sort last, so due calls are always in the window.
      const rows = await this.queued(agentId).orderBy('c.nextAttemptAt', 'ASC').limit(QUEUE_SCAN).getMany();
      const due = rows.filter(c => !c.nextAttemptAt || c.nextAttemptAt.getTime() <= now.getTime());
      if (due.length === 0) continue;
      if (missing || !client || !publicUrl) {
        for (const call of due) await this.noteWaiting(call, missing ?? 'Waiting');
        continue;
      }
      const agent = await this.agentRepo.findOne({ where: { id: agentId } });
      if (!agent) {
        for (const call of due)
          await this.callRepo.update(
            { id: call.id, status: AiCallStatus.QUEUED },
            { status: AiCallStatus.FAILED, error: 'Calling agent was deleted', endedAt: now },
          );
        continue;
      }
      if (!withinCallingHours(agent, now)) {
        const reason = `Waiting: outside calling hours (${agent.callingStart}–${agent.callingEnd} ${agent.callingTimezone || 'Asia/Kolkata'})`;
        for (const call of due) await this.noteWaiting(call, reason);
        continue;
      }
      dialled += await this.dialForAgent(client, publicUrl, agent, due, active, now);
    }
    await this.completeFinishedBatches();
    return dialled;
  }

  private async dialForAgent(
    client: TwilioClient,
    publicUrl: string,
    agent: VoiceAgent,
    due: AiCall[],
    active: Map<string, number>,
    now: Date,
  ): Promise<number> {
    let dialled = 0;
    for (const call of due) {
      if ((active.get(agent.id) ?? 0) >= agent.concurrency) {
        await this.noteWaiting(call, `Waiting: the agent is already on ${agent.concurrency} call(s)`);
        continue;
      }
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
        active.set(agent.id, (active.get(agent.id) ?? 1) - 1);
        // Rate limits, Twilio outages and network timeouts pass; a rejected number does not.
        const transient = !(err instanceof TwilioApiError) || err.status === 429 || err.status >= 500;
        if (transient) {
          await this.callRepo.update(call.id, {
            status: AiCallStatus.QUEUED,
            attempts: call.attempts,
            nextAttemptAt: new Date(now.getTime() + TRANSIENT_RETRY_MS),
            error: `Waiting: Twilio did not accept the call (${message}); trying again in a minute`,
          });
        } else {
          await this.callRepo.update(call.id, { status: AiCallStatus.FAILED, error: message, endedAt: new Date() });
        }
        this.logger.warn(`Could not dial ${call.phone}: ${message}`);
      }
    }
    return dialled;
  }

  /**
   * A call whose conversation outlived its process (restart mid-call): it really happened, so keep it as
   * completed and still analyse it, which creates the lead and WhatsApp follow-up like any other call.
   */
  private async finishOrphan(call: AiCall, now: Date, note: string): Promise<void> {
    const claim = await this.callRepo.update(
      { id: call.id, status: In(ACTIVE_CALL_STATUSES) },
      {
        status: AiCallStatus.COMPLETED,
        endedAt: now,
        durationSeconds: call.answeredAt ? Math.round((now.getTime() - call.answeredAt.getTime()) / 1000) : 0,
        error: note,
      },
    );
    this.connecting.delete(call.id);
    this.reconciled.delete(call.id);
    if (!claim.affected) return;
    const customerSpoke = (call.transcript ?? []).some(t => t.role === 'customer');
    await this.outcome
      .process(call.id, customerSpoke)
      .catch(err => this.logger.warn(`Could not analyse call ${call.id}: ${String(err)}`));
  }

  /**
   * A status callback lost on the way (tunnel hiccup, server restart) would leave a finished call
   * "dialing" and block the agent's line; ask Twilio for the real status of calls that went quiet.
   */
  private async reconcileWithTwilio(now: Date): Promise<void> {
    const twilio = twilioConfigFromEnv();
    if (!twilio) return;
    const open = await this.callRepo.find({
      where: { status: In(ACTIVE_CALL_STATUSES), channel: 'phone', twilioCallSid: Not(IsNull()) },
    });
    const client = new TwilioClient(twilio);
    for (const call of open) {
      const quietFor = now.getTime() - call.updatedAt.getTime();
      if (this.runner.isLive(call.id) || quietFor < RECONCILE_AFTER_MS) continue;
      const lastCheck = this.reconciled.get(call.id) ?? 0;
      if (now.getTime() - lastCheck < RECONCILE_AFTER_MS) continue;
      this.reconciled.set(call.id, now.getTime());
      try {
        const remote = await client.getCall(call.twilioCallSid!);
        if (remote.status === 'completed' || TWILIO_FINAL[remote.status]) {
          this.reconciled.delete(call.id);
          await this.onTwilioStatus({
            CallSid: call.twilioCallSid!,
            CallStatus: remote.status,
            CallDuration: remote.duration ?? '0',
          });
        }
      } catch (err) {
        this.logger.warn(
          `Could not check call ${call.id} with Twilio: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /** Shows on the queued call why it has not been dialled yet; cleared when it is dialled. */
  private async noteWaiting(call: AiCall, reason: string): Promise<void> {
    if (call.error === reason) return;
    await this.callRepo.update({ id: call.id, status: AiCallStatus.QUEUED }, { error: reason });
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
    // Finished on Twilio's side: nothing left to reconcile for this call.
    if (status === 'completed' || TWILIO_FINAL[status]) this.reconciled.delete(call.id);

    if (status === 'ringing' && call.status === AiCallStatus.DIALING) {
      await this.callRepo.update({ id: call.id, status: AiCallStatus.DIALING }, { status: AiCallStatus.RINGING });
      return;
    }
    // A live conversation saves its own result; a finished call keeps the result it has.
    if (this.runner.isLive(call.id) || !ACTIVE_CALL_STATUSES.includes(call.status)) {
      if (status === 'completed' || TWILIO_FINAL[status]) this.connecting.delete(call.id);
      return;
    }
    if (status === 'completed') {
      const reached = this.connecting.delete(call.id);
      if (call.transcript?.length) {
        await this.finishOrphan(
          call,
          new Date(),
          'The server restarted during the call; the transcript up to then was kept',
        );
      } else {
        await this.callRepo.update(
          { id: call.id, status: In(ACTIVE_CALL_STATUSES) },
          {
            status: AiCallStatus.COMPLETED,
            endedAt: new Date(),
            durationSeconds: Number(params.CallDuration ?? 0) || 0,
            // Say why the AI never spoke, so it is not a mystery in the call log.
            error: reached
              ? 'The call was answered but the audio stream to the AI never opened. On a Twilio trial account, press any key after Twilio\x27s message, or the call ends.'
              : 'The call ended before it reached the AI. On a Twilio trial account, press any key after Twilio\x27s message.',
          },
        );
      }
      return;
    }
    const final = TWILIO_FINAL[status];
    if (!final) return;
    // Not connected any more; a retry starts a new attempt tracked from scratch.
    this.connecting.delete(call.id);

    const agent = await this.agentRepo.findOne({ where: { id: call.agentId } });
    const batch = call.batchId ? await this.batchRepo.findOne({ where: { id: call.batchId } }) : null;
    if (batch?.status === AiCallBatchStatus.CANCELED) {
      await this.callRepo.update(
        { id: call.id, status: In(ACTIVE_CALL_STATUSES) },
        { status: AiCallStatus.CANCELED, endedAt: new Date(), error: 'List cancelled' },
      );
      return;
    }
    const retry =
      (final === AiCallStatus.NO_ANSWER || final === AiCallStatus.BUSY) && agent && call.attempts < agent.maxAttempts;
    if (retry) {
      await this.callRepo.update(
        { id: call.id, status: In(ACTIVE_CALL_STATUSES) },
        {
          status: AiCallStatus.QUEUED,
          nextAttemptAt: new Date(Date.now() + agent.retryAfterMinutes * 60 * 1000),
          error: final === AiCallStatus.BUSY ? 'Busy — will retry' : 'No answer — will retry',
          twilioCallSid: null,
        },
      );
    } else {
      await this.callRepo.update(
        { id: call.id, status: In(ACTIVE_CALL_STATUSES) },
        {
          status: final,
          endedAt: new Date(),
          error: params.ErrorMessage || (final === AiCallStatus.FAILED ? 'Twilio could not connect the call' : null),
        },
      );
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
