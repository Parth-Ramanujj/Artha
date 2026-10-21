import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkflowDefinition,
  WorkflowCondition,
  WorkflowAction,
  WorkflowTrigger,
  ActionType,
  ConditionType,
  TriggerType,
  VisualWorkflowNode,
  VisualWorkflowEdge,
  WorkflowStatus,
} from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus, StepResult } from './entities/workflow-run.entity';
import { WorkflowService } from './workflow.service';
import { MessageStudioService } from '../message-studio/message-studio.service';
import { IntegrationService } from '../integrations/integration.service';
import { GoogleWorkspaceService } from '../integrations/google/google-workspace.service';
import { extractPhoneFromText } from '../integrations/google/sheet-lookup';
import { ConversationService } from '../conversation/conversation.service';
import { ConversationStatus } from '../conversation/entities/conversation.entity';
import { MessageService } from '../message/message.service';
import { AiService } from '../ai/ai.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { AgentService } from './agent.service';
import { LeadService } from './lead.service';
import { Agent } from './entities/agent.entity';
import { Lead } from './entities/lead.entity';
import { ScheduledMessage, ScheduledMessageStatus } from '../campaign/entities/scheduled-message.entity';
import { createLogger } from '../../common/services/logger.service';
import { containsKeyword, parseKeywords } from './keyword-match';
import { DND_TAG } from '../conversation/dnd';
import {
  isSsrfProtectionEnabled,
  redactSsrfError,
  SsrfBlockedError,
  withSafeFetch,
} from '../../common/security/ssrf-guard';

export interface TriggerContext {
  businessId: string;
  sessionId?: string;
  chatId?: string;
  contactId?: string;
  contactTags?: string[];
  messageBody?: string;
  messageType?: string;
  conversationId?: string;
  conversationStatus?: string;
  assignedTo?: string;
  metadata?: Record<string, unknown>;
}

// Plain "continue" edges: drawn from a node's generic output, or from preset edges with no handle.
const GENERIC_HANDLES = new Set(['out', 'default']);
// Outcomes that mean "the step did not succeed"; they never fall through to the success path.
const FAILURE_HANDLES = new Set(['false', 'fallback', 'invalid_pincode']);

const MAX_HTTP_RESPONSE_BYTES = 1024 * 1024;

interface GuardedHttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
}

async function readBodyCapped(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTTP_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Response is larger than ${MAX_HTTP_RESPONSE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Outbound HTTP for workflow nodes, through the shared SSRF guard: internal and cloud-metadata
 * addresses are refused, the vetted IP is pinned (no DNS rebinding), redirects are refused and the
 * body is capped. The blocked internal IP is logged, never returned to the caller or stored in a run.
 */
async function guardedHttpRequest(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
  logger: { warn: (message: string) => void },
): Promise<GuardedHttpResponse> {
  try {
    return await withSafeFetch(
      url,
      init,
      async response => {
        const text = await readBodyCapped(response.body as ReadableStream<Uint8Array> | null);
        let data: unknown = text;
        if ((response.headers.get('content-type') || '').includes('application/json')) {
          try {
            data = text ? (JSON.parse(text) as unknown) : null;
          } catch {
            data = null;
          }
        }
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headers[k] = v;
        });
        return { ok: response.ok, status: response.status, statusText: response.statusText, headers, data };
      },
      { guard: isSsrfProtectionEnabled() },
    );
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      throw new Error(redactSsrfError(err, logger, 'a workflow HTTP request'), { cause: err });
    }
    throw err;
  }
}

/**
 * Menu text as a customer would type it: "🛡️ Insurance" → "insurance", "1️⃣" → "1". Combining marks
 * (\p{M}) are kept so Gujarati/Hindi option names still match.
 */
export function normalizeChoice(text: string): string {
  return (
    text
      .toLowerCase()
      // Emoji variation selectors and the keycap mark are "marks" too, but never part of a word.
      .replace(/[︎️⃣]/g, '')
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const CUSTOMER_MESSAGING_ACTIONS = new Set<string>([
  ActionType.SEND_MESSAGE,
  ActionType.SEND_TEMPLATE,
  ActionType.INTERACTIVE_BUTTONS,
  ActionType.INTERACTIVE_LIST,
  ActionType.ASK_QUESTION,
  ActionType.AI_ASSISTANT,
  ActionType.SEND_LOCATION,
  ActionType.SEND_MEDIA,
  ActionType.SEARCH_AGENTS,
  ActionType.SEND_CONTACT_VCARD,
  ActionType.SEND_DOCUMENT,
  ActionType.SEND_VOICE_NOTE,
  ActionType.INTERNAL_ALERT,
  ActionType.PAYMENT_LINK,
  ActionType.DYNAMIC_PDF_GENERATOR,
  ActionType.SEND_CAROUSEL_TEMPLATE,
  ActionType.INTERACTIVE_CTA_TEMPLATE,
  ActionType.SEND_STUDIO_MESSAGE,
  ActionType.WEBHOOK_CALL,
  ActionType.GOOGLE_SHEETS,
]);

/** A menu button id stored as a lead value: "btn_mutual_fund" → "mutual_fund", "btn_cat_health" → "health". */
export function menuChoiceValue(value: string): string {
  return value.replace(/^btn_(cat_|claim_)?/, '');
}

/**
 * A question answer checked against its validation, returned in the form it should be stored in
 * (pincode without spaces, phone as digits), or null when it does not pass.
 */
export function validateAnswer(validation: string, reply: string): string | null {
  const text = reply.trim();
  switch (validation) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
    case 'phone': {
      const compact = text.replace(/[\s\-().]/g, '');
      const indian = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(compact);
      if (indian) return `91${indian[1]}`;
      // Other countries only with an explicit +country code, so a short typo is not taken for a number.
      return /^\+(?!91)[1-9]\d{7,14}$/.test(compact) ? compact.slice(1) : null;
    }
    case 'number':
      return text !== '' && Number.isFinite(Number(text)) ? text : null;
    case 'pincode': {
      const pin = text.replace(/\s/g, '');
      return /^[1-9][0-9]{5}$/.test(pin) ? pin : null;
    }
    default:
      return text;
  }
}

/** The URL with credentials and every query value masked: "…?key=abc&id=7" → "…?key=***&id=***". */
export function redactUrlSecrets(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '';
    }
    for (const key of [...new Set(parsed.searchParams.keys())]) parsed.searchParams.set(key, '***');
    return parsed.toString().replace(/%2A%2A%2A/g, '***');
  } catch {
    return url.replace(/\?.*$/, '?***');
  }
}

function waitSeconds(config: Record<string, unknown>): number {
  const seconds = Number(config['seconds'] ?? 1);
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), MAX_WAIT_SECONDS) : 1;
}

/** A value escaped for use inside a JSON string literal (without the surrounding quotes). */
const jsonStringContent = (value: string): string => JSON.stringify(value).slice(1, -1);

export type ResumeOutcome = 'resumed' | 'ignored' | 'cancelled' | 'restart';
// A paused customer can always get out: these end the waiting run instead of being read as an answer.
const STOP_WORDS = new Set(['stop', 'cancel', 'exit', 'quit']);
const RESTART_WORDS = new Set(['menu', 'main menu', 'start', 'restart', 'reset', 'hi', 'hii', 'hello', 'hey']);
const MAX_INVALID_CHOICES = 3;

/**
 * The edge to follow out of a node for the branch it reported. An exact handle wins; otherwise only a
 * generic edge is taken (so any menu choice can share one "continue" edge), and a failure outcome with
 * no edge of its own ends the run instead of continuing as if it had succeeded.
 */
export function pickNextEdge(
  edges: VisualWorkflowEdge[],
  nodeId: string,
  handle?: string,
): VisualWorkflowEdge | undefined {
  const outgoing = edges.filter(e => e.source === nodeId);
  const isGeneric = (e: VisualWorkflowEdge) => !e.sourceHandle || GENERIC_HANDLES.has(e.sourceHandle);
  if (!handle) return outgoing.find(isGeneric) ?? outgoing.find(e => !FAILURE_HANDLES.has(e.sourceHandle ?? ''));
  const exact = outgoing.find(e => e.sourceHandle === handle);
  if (exact) return exact;
  if (FAILURE_HANDLES.has(handle)) return undefined;
  return outgoing.find(isGeneric);
}

/** Where a sleeping run continues: after a WAIT node, or another attempt at a failed node. */
interface WakePoint {
  kind: 'wait' | 'retry';
  nodeId: string;
  attempt?: number;
  at: string;
  ctx: TriggerContext;
}

// Catches runs whose in-process timer is gone (restart, another instance) and keeps lateness small.
const WAKE_POLL_MS = 30_000;
const MAX_WAIT_SECONDS = 300;

@Injectable()
export class WorkflowExecutor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('WorkflowExecutor');
  private readonly activeRuns = new Set<string>();
  private readonly wakeTimers = new Map<string, NodeJS.Timeout>();
  private wakePoll?: NodeJS.Timeout;

  constructor(
    private readonly workflowService: WorkflowService,
    @Optional()
    private readonly conversationService?: ConversationService,
    @Optional()
    private readonly messageService?: MessageService,
    @Optional()
    private readonly aiService?: AiService,
    @Optional()
    private readonly engineRegistry?: EngineRegistry,
    @Optional()
    private readonly agentService?: AgentService,
    @Optional()
    private readonly leadService?: LeadService,
    @Optional()
    @InjectRepository(ScheduledMessage, 'data')
    private readonly scheduledMessageRepo?: Repository<ScheduledMessage>,
    @Optional()
    private readonly studioService?: MessageStudioService,
    @Optional()
    private readonly integrationsService?: IntegrationService,
    @Optional()
    private readonly googleService?: GoogleWorkspaceService,
  ) {}

  onModuleInit(): void {
    const poll = () =>
      void this.scheduleWaitingRuns().catch(err =>
        this.logger.warn(`Waiting run recovery failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    poll();
    this.wakePoll = setInterval(poll, WAKE_POLL_MS);
    this.wakePoll.unref();
  }

  onModuleDestroy(): void {
    if (this.wakePoll) clearInterval(this.wakePoll);
    for (const timer of this.wakeTimers.values()) clearTimeout(timer);
    this.wakeTimers.clear();
  }

  /** Arms a timer for every sleeping run, including ones put to sleep before a restart. */
  async scheduleWaitingRuns(): Promise<number> {
    const runs = await this.workflowService.findWaitingRuns();
    for (const run of runs) {
      const at = Date.parse(String((run.triggerData?.['wake'] as WakePoint | undefined)?.at ?? ''));
      this.scheduleWake(run.id, Number.isFinite(at) ? at : Date.now());
    }
    return runs.length;
  }

  private scheduleWake(runId: string, atMs: number): void {
    const existing = this.wakeTimers.get(runId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(
      () => {
        this.wakeTimers.delete(runId);
        void this.wakeRun(runId).catch(err =>
          this.logger.error(`Wake failed for run ${runId}`, err instanceof Error ? err.message : String(err)),
        );
      },
      Math.max(0, atMs - Date.now()),
    );
    timer.unref();
    this.wakeTimers.set(runId, timer);
  }

  /** Saves where the run continues and lets it sleep without holding this process. */
  private async sleepRun(
    run: WorkflowRun,
    ctx: TriggerContext,
    steps: StepResult[],
    wake: Omit<WakePoint, 'ctx'>,
  ): Promise<void> {
    const triggerData = {
      ...(run.triggerData ?? {}),
      wake: { ...wake, ctx: JSON.parse(JSON.stringify(ctx)) as TriggerContext },
    };
    run.triggerData = triggerData;
    await this.workflowService.markRunWaiting(run.id, triggerData, steps);
    this.scheduleWake(run.id, Date.parse(wake.at));
  }

  /** Continues a sleeping run once its time has come; safe to call from several timers at once. */
  async wakeRun(runId: string): Promise<'woken' | 'skipped'> {
    const run = await this.workflowService.findRun(runId, null).catch(() => null);
    const wake = run?.triggerData?.['wake'] as WakePoint | undefined;
    if (!run || run.status !== RunStatus.WAITING || !wake) return 'skipped';
    const atMs = Date.parse(wake.at);
    if (atMs > Date.now()) {
      this.scheduleWake(run.id, atMs);
      return 'skipped';
    }
    if (!(await this.workflowService.claimWaitingRun(run.id))) return 'skipped';

    const triggerData: Record<string, unknown> = { ...(run.triggerData ?? {}) };
    delete triggerData['wake'];
    run.triggerData = triggerData;
    this.activeRuns.add(run.id);
    try {
      await this.workflowService.updateRunTriggerData(run.id, triggerData);
      const workflow = await this.workflowService.findOne(run.workflowId, run.businessId).catch(() => null);
      if (!workflow || workflow.status !== WorkflowStatus.PUBLISHED) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.CANCELLED, {
          failureReason: workflow ? 'Workflow is no longer published' : 'Workflow no longer exists',
        });
        return 'woken';
      }
      if (wake.kind === 'wait') {
        await this.executeGraphFromNode(workflow, run, wake.ctx, wake.nodeId);
      } else {
        await this.executeGraphFromNode(workflow, run, wake.ctx, '', undefined, wake.nodeId, wake.attempt);
      }
    } catch (err) {
      this.logger.error(`Workflow wake error: run=${run.id}`, err instanceof Error ? err.message : String(err));
      await this.workflowService
        .updateRunStatus(run.id, RunStatus.FAILED, { failureReason: err instanceof Error ? err.message : String(err) })
        .catch(() => undefined);
    } finally {
      this.activeRuns.delete(run.id);
    }
    return 'woken';
  }

  /**
   * A node field: its configured template if set, otherwise the customer's captured answer used as is.
   * Answers are never re-templated, so a reply like "{{steps.x.data}}" cannot pull other data in.
   */
  private configOrAnswer(
    action: WorkflowAction,
    key: string,
    ctx: TriggerContext,
    run: WorkflowRun | undefined,
    answer: unknown,
  ): string {
    const configured = action.config[key];
    if (configured !== undefined && configured !== null && String(configured).trim() !== '') {
      return this.interpolateVariables(String(configured), ctx, run).trim();
    }
    return answer !== undefined && answer !== null ? String(answer).trim() : '';
  }

  // Test runs and dry-run nodes must never reach a real customer.
  private isDryRun(ctx: TriggerContext, action: WorkflowAction): boolean {
    return Boolean(ctx.metadata?.isTest || action.config['dryRun']);
  }

  async execute(workflow: WorkflowDefinition, run: WorkflowRun, ctx: TriggerContext): Promise<void> {
    if (this.activeRuns.has(run.id)) {
      this.logger.warn('Run already active, skipping', { runId: run.id });
      return;
    }

    this.activeRuns.add(run.id);
    const steps: StepResult[] = [];
    let actionCount = 0;

    try {
      await this.workflowService.updateRunStatus(run.id, RunStatus.RUNNING);
      const startTime = Date.now();
      const def = workflow.definition;

      if (!this.evaluateTrigger(def.trigger, ctx)) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, {
          steps,
          actionCount,
          failureReason: 'Trigger condition not met',
        });
        return;
      }

      if (!this.evaluateConditions(def.conditions, ctx)) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, {
          steps,
          actionCount,
          failureReason: 'Conditions not met',
        });
        return;
      }

      if (def.nodes && def.nodes.length > 0 && def.edges) {
        const triggerNode = def.nodes.find(n => n.type === 'trigger');
        if (triggerNode) {
          await this.executeGraphFromNode(workflow, run, ctx, triggerNode.id);
        } else {
          // No trigger node: the first node is an action and must run itself, not just its successors.
          const root = def.nodes.find(n => !def.edges?.some(e => e.target === n.id)) ?? def.nodes[0];
          await this.executeGraphFromNode(workflow, run, ctx, '', undefined, root.id);
        }
        return;
      }

      for (const action of def.actions) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > workflow.maxExecutionSeconds) {
          await this.workflowService.updateRunStatus(run.id, RunStatus.TIMED_OUT, {
            steps,
            actionCount,
            failureReason: `Execution time limit exceeded (${workflow.maxExecutionSeconds}s)`,
          });
          return;
        }

        if (actionCount >= workflow.maxActionsPerRun) {
          await this.workflowService.updateRunStatus(run.id, RunStatus.FAILED, {
            steps,
            actionCount,
            failureReason: `Action count limit exceeded (${workflow.maxActionsPerRun})`,
          });
          return;
        }

        const step = await this.executeAction(action, ctx, workflow.maxRetries, run);
        steps.push(step);
        if (run) run.steps = steps;
        actionCount++;

        if (step.output?.['suspended']) {
          await this.workflowService.updateRunStatus(run.id, RunStatus.PAUSED, { steps, actionCount });
          return;
        }

        if (step.output?.['filtered']) {
          await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, {
            steps,
            actionCount,
            failureReason: `Workflow filtered at node ${action.id}: ${String(step.output?.['reason'] || 'Filter condition not met')}`,
          });
          return;
        }

        if (step.output?.['stopped']) {
          await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, {
            steps,
            actionCount,
            failureReason: `Workflow terminated at node ${action.id}: ${String(step.output?.['reason'] || 'Workflow stopped')}`,
          });
          return;
        }

        if (step.status === 'failed' && (action.onError ?? 'stop') === 'stop') {
          await this.workflowService.updateRunStatus(run.id, RunStatus.FAILED, {
            steps,
            actionCount,
            failureReason: `Action "${action.id}" failed: ${step.error}`,
          });
          return;
        }
      }

      await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, { steps, actionCount });
    } catch (err) {
      this.logger.error(
        `Workflow execution error: workflow=${workflow.id} run=${run.id}`,
        err instanceof Error ? err.message : String(err),
      );
      await this.workflowService
        .updateRunStatus(run.id, RunStatus.FAILED, {
          steps,
          actionCount,
          failureReason: err instanceof Error ? err.message : String(err),
        })
        .catch(() => undefined);
    } finally {
      this.activeRuns.delete(run.id);
    }
  }

  evaluateTrigger(trigger: WorkflowTrigger, ctx: TriggerContext): boolean {
    if (!trigger) return true;
    if (trigger.type === TriggerType.KEYWORD_MATCH) {
      // A keyword trigger with no keywords would answer every message; it never fires instead.
      const keywords = parseKeywords(trigger.config?.['keyword']);
      return keywords.some(k => containsKeyword(ctx.messageBody ?? '', k));
    }
    return true;
  }

  evaluateConditions(conditions: WorkflowCondition[], ctx: TriggerContext): boolean {
    for (const cond of conditions) {
      let result = this.evaluateCondition(cond, ctx);
      if (cond.negate) result = !result;
      if (!result) return false;
    }
    return true;
  }

  private evaluateCondition(cond: WorkflowCondition, ctx: TriggerContext): boolean {
    switch (cond.type) {
      case ConditionType.BUSINESS_MATCH:
        return ctx.businessId === cond.config.businessId;

      case ConditionType.SESSION_MATCH:
        return ctx.sessionId === cond.config.sessionId;

      case ConditionType.KEYWORD_EXACT: {
        const raw = String(cond.config['keyword'] ?? '')
          .toLowerCase()
          .trim();
        const body = (ctx.messageBody ?? '').toLowerCase().trim();
        const keywords = raw
          .split(',')
          .map(k => k.trim())
          .filter(Boolean);
        if (keywords.length > 1) {
          return keywords.some(k => body === k);
        }
        return body === raw;
      }

      case ConditionType.KEYWORD_CONTAINS: {
        const raw = String(cond.config['keyword'] ?? '')
          .toLowerCase()
          .trim();
        const body = (ctx.messageBody ?? '').toLowerCase().trim();
        const keywords = raw
          .split(',')
          .map(k => k.trim())
          .filter(Boolean);
        if (keywords.length > 0) {
          return keywords.some(k => body.includes(k));
        }
        return body.includes(raw);
      }

      case ConditionType.CONVERSATION_STATUS:
        return ctx.conversationStatus === cond.config.status;

      case ConditionType.CONTACT_TAG: {
        const tag = String(cond.config['tag'] ?? '')
          .trim()
          .toLowerCase();
        if (!tag) return false;
        const tags = (ctx.contactTags ?? []).map(t => t.toLowerCase());
        return tags.includes(tag);
      }

      case ConditionType.WORKING_HOURS: {
        const cfg = cond.config as { timezone?: string; start?: string; end?: string; days?: number[] };
        return this.isWithinWorkingHours(cfg);
      }

      default:
        this.logger.warn(`Unknown condition type: ${String(cond.type)}`);
        return false;
    }
  }

  private isWithinWorkingHours(cfg: { timezone?: string; start?: string; end?: string; days?: number[] }): boolean {
    const tz = cfg.timezone ?? 'UTC';
    const now = new Date();
    let hours: number;
    let minutes: number;
    let dayOfWeek: number;

    try {
      const parts = now.toLocaleString('en-US', { timeZone: tz, hour12: false }).split(', ');
      const dateParts = parts[0].split('/');
      const timeParts = parts[1].split(':');
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);
      const d = new Date(`${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`);
      dayOfWeek = d.getDay();
    } catch {
      return true;
    }

    if (cfg.days && !cfg.days.includes(dayOfWeek)) return false;

    const currentMinutes = hours * 60 + minutes;
    if (cfg.start) {
      const [sh, sm] = cfg.start.split(':').map(Number);
      if (currentMinutes < sh * 60 + sm) return false;
    }
    if (cfg.end) {
      const [eh, em] = cfg.end.split(':').map(Number);
      if (currentMinutes > eh * 60 + em) return false;
    }

    return true;
  }

  private async executeAction(
    action: WorkflowAction,
    ctx: TriggerContext,
    globalMaxRetries: number,
    run?: WorkflowRun,
    // deferRetries: return a 'retrying' step instead of sleeping, so the caller can persist the wait.
    opts: { startAttempt?: number; deferRetries?: boolean } = {},
  ): Promise<StepResult> {
    // Retrying a node that messages the customer re-sends whatever already went out (a header, half
    // the agent cards, the menu), so those only retry when the node itself asks for it.
    const maxRetries = action.maxRetries ?? (CUSTOMER_MESSAGING_ACTIONS.has(action.type) ? 0 : globalMaxRetries);
    const step: StepResult = {
      actionId: action.id,
      actionType: action.type,
      status: 'success',
      startedAt: new Date().toISOString(),
    };

    for (let attempt = opts.startAttempt ?? 0; attempt <= maxRetries; attempt++) {
      try {
        const output = await this.runAction(action, ctx, run);
        step.output = output;
        step.completedAt = new Date().toISOString();
        step.retryCount = attempt;

        this.recordStepOutput(run, action.id, output);
        return step;
      } catch (err) {
        step.retryCount = attempt;
        step.error = err instanceof Error ? err.message : String(err);

        if (attempt >= maxRetries || (action.onError ?? 'stop') === 'skip') {
          step.status = (action.onError ?? 'stop') === 'skip' ? 'skipped' : 'failed';
          step.completedAt = new Date().toISOString();
          return step;
        }

        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        if (opts.deferRetries) {
          step.status = 'retrying';
          step.retryAt = new Date(Date.now() + backoffMs).toISOString();
          step.completedAt = new Date().toISOString();
          return step;
        }
        await this.delay(backoffMs);
      }
    }

    step.status = 'failed';
    step.completedAt = new Date().toISOString();
    return step;
  }

  /** Makes a node's output readable downstream as {{steps.<nodeId>.<path>}} or {{steps.last.<path>}}. */
  private recordStepOutput(run: WorkflowRun | undefined, nodeId: string, output: Record<string, unknown>): void {
    if (!run) return;
    if (!run.triggerData) run.triggerData = {};
    if (!run.triggerData['stepOutputs']) run.triggerData['stepOutputs'] = {};
    const stepOutputs = run.triggerData['stepOutputs'] as Record<string, unknown>;
    stepOutputs[nodeId] = output;
    stepOutputs['last'] = output;
  }

  private async runAction(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    switch (action.type) {
      case ActionType.SEND_MESSAGE:
        return this.actionSendMessage(action, ctx, run);

      case ActionType.SEND_TEMPLATE:
        return this.actionSendTemplate(action, ctx, run);

      case ActionType.INTERACTIVE_BUTTONS:
      case ActionType.INTERACTIVE_LIST:
        return this.actionInteractiveButtons(action, ctx, run);

      case ActionType.SEND_STUDIO_MESSAGE:
        return this.actionSendStudioMessage(action, ctx, run);

      case ActionType.SHEETS_LOOKUP:
        return this.actionSheetsLookup(action, ctx, run);

      case ActionType.ASK_QUESTION:
        return this.actionAskQuestion(action, ctx, run);

      case ActionType.CONDITION_BRANCH:
        return this.actionConditionBranch(action, ctx, run);

      case ActionType.AI_ASSISTANT:
        return this.actionAiAssistant(action, ctx, run);

      case ActionType.WEBHOOK_CALL:
        return this.actionWebhookCall(action, ctx, run);

      case ActionType.ASSIGN_CONVERSATION:
        return this.actionAssignConversation(action, ctx);

      case ActionType.UPDATE_CONVERSATION_STATUS:
        return this.actionUpdateConversationStatus(action, ctx);

      case ActionType.ADD_TAG:
        return this.actionAddTag(action, ctx);

      case ActionType.REMOVE_TAG:
        return this.actionRemoveTag(action, ctx);

      case ActionType.HANDOFF_TO_HUMAN:
        return this.actionHandoffToHuman(action, ctx);

      case ActionType.PAUSE_AUTOMATION:
        return { paused: true };

      case ActionType.WAIT: {
        const seconds = waitSeconds(action.config);
        await this.delay(seconds * 1000);
        return { waited: seconds };
      }

      case ActionType.CREATE_CONTACT:
        return this.actionCreateContact(action, ctx, run);

      case ActionType.UPDATE_CONTACT:
        return this.actionUpdateContact(action, ctx, run);

      case ActionType.TYPING_INDICATOR:
        return this.actionTypingIndicator(action, ctx);

      case ActionType.MARK_AS_READ:
        return this.actionMarkAsRead(action, ctx);

      case ActionType.SEND_REACTION:
        return this.actionSendReaction(action, ctx, run);

      case ActionType.SEND_LOCATION:
        return this.actionSendLocation(action, ctx, run);

      case ActionType.SET_FIELDS:
        return this.actionSetFields(action, ctx, run);

      case ActionType.FILTER:
        return this.actionFilter(action, ctx, run);

      case ActionType.STOP_WORKFLOW:
        return this.actionStopWorkflow(action, ctx, run);

      case ActionType.GOOGLE_SHEETS:
        return this.actionGoogleSheets(action, ctx, run);

      case ActionType.SEND_MEDIA:
        return this.actionSendMedia(action, ctx, run);

      case ActionType.SEARCH_AGENTS:
        return this.actionSearchAgents(action, ctx, run);

      case ActionType.CREATE_LEAD:
        return this.actionCreateLead(action, ctx, run);

      case ActionType.VALIDATE_PINCODE:
        return this.actionValidatePincode(action, ctx, run);

      case ActionType.SCHEDULE_FOLLOWUP:
        return this.actionScheduleFollowup(action, ctx, run);

      case ActionType.SEND_CONTACT_VCARD:
        return this.actionSendContactVCard(action, ctx, run);

      case ActionType.SEND_DOCUMENT:
        return this.actionSendDocument(action, ctx, run);

      case ActionType.SEND_VOICE_NOTE:
        return this.actionSendVoiceNote(action, ctx, run);

      case ActionType.WORKING_HOURS_GATEWAY:
        return this.actionWorkingHoursGateway(action, ctx, run);

      case ActionType.INTERNAL_ALERT:
        return this.actionInternalAlert(action, ctx, run);

      case ActionType.AB_TEST_SPLIT:
        return this.actionABTestSplit(action, ctx, run);

      case ActionType.DND_MANAGER:
        return this.actionDNDManager(action, ctx, run);

      case ActionType.FINANCIAL_CALCULATOR:
        return this.actionFinancialCalculator(action, ctx, run);

      case ActionType.PAYMENT_LINK:
        return this.actionPaymentLink(action, ctx, run);

      case ActionType.AI_DOCUMENT_OCR:
        return this.actionAiDocumentOCR(action, ctx, run);

      case ActionType.DYNAMIC_PDF_GENERATOR:
        return this.actionDynamicPDFGenerator(action, ctx, run);

      case ActionType.SEND_CAROUSEL_TEMPLATE:
        return this.actionSendCarouselTemplate(action, ctx, run);

      case ActionType.INTERACTIVE_CTA_TEMPLATE:
        return this.actionInteractiveCTATemplate(action, ctx, run);

      case ActionType.DYNAMIC_LANGUAGE_SWITCHER:
        return this.actionDynamicLanguageSwitcher(action, ctx, run);

      default:
        throw new Error(`Unknown action type: ${String(action.type)}`);
    }
  }

  /**
   * Fill {{tokens}}. `encode` is applied to every substituted value — use it whenever the result is
   * not plain chat text (a JSON body, a URL), so customer-typed text cannot change its structure.
   */
  interpolateVariables(
    text: string,
    ctx: Partial<TriggerContext> = {},
    run?: WorkflowRun,
    extraVars?: Record<string, string>,
    encode?: (value: string) => string,
  ): string {
    if (!text || typeof text !== 'string') return '';

    const sender = ctx.chatId ?? '';
    const phone = sender.replace(/@.*$/, '');
    const message = ctx.messageBody ?? '';
    const contactName = (ctx.metadata?.['contactName'] as string) || (ctx.metadata?.['name'] as string) || phone;

    const captured = (run?.triggerData?.['capturedVariables'] as Record<string, unknown>) || {};
    const stepOutputs = (run?.triggerData?.['stepOutputs'] as Record<string, unknown>) || {};

    // Standard trigger context representation
    const triggerObj: Record<string, unknown> = {
      phone,
      sender,
      from: phone,
      chatId: sender,
      message,
      body: message,
      text: message,
      contactName,
      name: contactName,
      businessId: ctx.businessId,
      sessionId: ctx.sessionId,
      conversationId: ctx.conversationId,
      conversationStatus: ctx.conversationStatus,
      tags: ctx.contactTags || [],
      metadata: ctx.metadata || {},
    };

    const now = new Date();

    // Universal token matcher: {{ expression }}
    const resolveToken = (match: string, rawExpr: string): string => {
      const expr = rawExpr.trim();

      // 1. Extra variables passed directly (highest precedence for testing or runtime overrides)
      if (extraVars && expr in extraVars) {
        return String(extraVars[expr] ?? '');
      }

      // 2. Builtin time/date helpers
      if (expr === 'now' || expr === 'timestamp') return now.toISOString();
      if (expr === 'date' || expr === 'today') return now.toISOString().slice(0, 10);
      if (expr === 'time') return now.toTimeString().slice(0, 8);
      if (expr === 'randomId') return Math.random().toString(36).substring(2, 8);

      // 3. Trigger scope: {{trigger.<path>}}
      if (expr.startsWith('trigger.')) {
        const subPath = expr.slice(8);
        const val = this.extractJsonPath(triggerObj, subPath);
        if (val !== undefined && val !== null) {
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
        return '';
      }

      // 4. Node Step Outputs scope: {{steps.<nodeId>.<path>}}
      if (expr.startsWith('steps.')) {
        const sub = expr.slice(6); // e.g. "api_1.data.user.name" or "last.data.id"
        const dotIdx = sub.indexOf('.');
        if (dotIdx === -1) {
          // e.g. {{steps.api_1}}
          const nodeOutput = stepOutputs[sub];
          if (nodeOutput !== undefined && nodeOutput !== null) {
            return typeof nodeOutput === 'object' ? JSON.stringify(nodeOutput) : String(nodeOutput);
          }
          return '';
        }

        const nodeId = sub.slice(0, dotIdx);
        const path = sub.slice(dotIdx + 1);
        const nodeOutput = stepOutputs[nodeId];
        if (nodeOutput !== undefined && nodeOutput !== null) {
          const val = this.extractJsonPath(nodeOutput, path);
          if (val !== undefined && val !== null) {
            return typeof val === 'object' ? JSON.stringify(val) : String(val);
          }
        }
        return '';
      }

      // 5. Last step shorthand: {{last.<path>}}
      if (expr.startsWith('last.')) {
        const subPath = expr.slice(5);
        const lastOutput = stepOutputs['last'];
        if (lastOutput !== undefined && lastOutput !== null) {
          const val = this.extractJsonPath(lastOutput, subPath);
          if (val !== undefined && val !== null) {
            return typeof val === 'object' ? JSON.stringify(val) : String(val);
          }
        }
        return '';
      }

      // 6. Variables scope: {{vars.<path>}} or {{variables.<path>}}
      if (expr.startsWith('vars.') || expr.startsWith('variables.')) {
        const subPath = expr.replace(/^(vars|variables)\./, '');
        const val = this.extractJsonPath(captured, subPath);
        if (val !== undefined && val !== null) {
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
        return '';
      }

      // 7. Shorthand legacy trigger fields (e.g. {{phone}}, {{message}}, {{name}})
      if (expr in triggerObj) {
        const val = triggerObj[expr];
        if (val !== undefined && val !== null) {
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
      }

      // 8. Direct captured variables: {{myVar}}
      if (expr in captured) {
        const val = captured[expr];
        if (val !== undefined && val !== null) {
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
      }

      // 9. Deep lookup on captured variables if expression has dot
      if (expr.includes('.')) {
        const val = this.extractJsonPath(captured, expr);
        if (val !== undefined && val !== null) {
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
      }

      return match;
    };

    return text.replace(/\{\{\s*([a-zA-Z0-9_.\-[\]]+)\s*\}\}/g, (match: string, rawExpr: string) => {
      const value = resolveToken(match, rawExpr);
      return encode && value !== match ? encode(value) : value;
    });
  }

  private async actionSendMessage(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const raw = action.config['message'] ?? action.config['text'];
    let message = typeof raw === 'string' ? raw : '';
    if (!message) throw new Error('Send message action requires message or text');
    if (!ctx.sessionId) throw new Error('No session context for send message');
    if (!ctx.chatId) throw new Error('No chat context for send message');

    message = this.interpolateVariables(message, ctx, run);

    if (ctx.metadata?.isTest || action.config['dryRun']) {
      this.logger.log(`Workflow send message (simulated dry-run): chat=${ctx.chatId} len=${message.length}`);
      return {
        sent: true,
        simulated: true,
        dryRun: true,
        messageId: `dry_run_${Date.now()}`,
        chatId: ctx.chatId,
        text: message,
        length: message.length,
      };
    }

    if (this.messageService) {
      const res = await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text: message,
      });
      this.logger.log(`Workflow send message success: session=${ctx.sessionId} chat=${ctx.chatId} id=${res.messageId}`);
      return { sent: true, messageId: res.messageId, chatId: ctx.chatId, text: message, length: message.length };
    }

    this.logger.log(
      `Workflow send message (mocked): session=${ctx.sessionId} chat=${ctx.chatId} len=${message.length}`,
    );
    return { sent: true, sessionId: ctx.sessionId, chatId: ctx.chatId, text: message, messageLength: message.length };
  }

  private async actionSendTemplate(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for send template');
    if (!ctx.chatId) throw new Error('No chat context for send template');

    const templateName = typeof action.config['templateName'] === 'string' ? action.config['templateName'] : undefined;
    const templateId = typeof action.config['templateId'] === 'string' ? action.config['templateId'] : undefined;
    const rawVars = (action.config['vars'] || action.config['variables'] || {}) as Record<string, unknown>;

    if (!templateName && !templateId) {
      throw new Error('Template name or ID is required for send_template action');
    }

    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawVars)) {
      vars[k] = this.interpolateVariables(String(v ?? ''), ctx, run);
    }

    if (ctx.metadata?.isTest || action.config['dryRun']) {
      this.logger.log(
        `Workflow send template (simulated dry-run): chat=${ctx.chatId} template=${templateName || templateId}`,
      );
      return {
        sent: true,
        simulated: true,
        dryRun: true,
        messageId: `dry_run_tmpl_${Date.now()}`,
        chatId: ctx.chatId,
        template: templateName || templateId,
        vars,
      };
    }

    if (this.messageService) {
      const res = await this.messageService.sendTemplate(ctx.sessionId, {
        chatId: ctx.chatId,
        templateName,
        templateId,
        vars,
      });
      this.logger.log(
        `Workflow send template success: session=${ctx.sessionId} chat=${ctx.chatId} template=${templateName || templateId}`,
      );
      return { sent: true, messageId: res.messageId, chatId: ctx.chatId, template: templateName || templateId, vars };
    }

    return { sent: true, sessionId: ctx.sessionId, chatId: ctx.chatId, template: templateName || templateId, vars };
  }

  private async actionAssignConversation(
    action: WorkflowAction,
    ctx: TriggerContext,
  ): Promise<Record<string, unknown>> {
    if (!this.conversationService || !ctx.conversationId) {
      return { assigned: false, reason: 'No conversation context' };
    }
    const rawTo = action.config['assignedTo'];
    const assignedTo = typeof rawTo === 'string' ? rawTo : '';
    const rawName = action.config['assignedName'];
    const assignedName = typeof rawName === 'string' ? rawName : undefined;

    await this.conversationService.updateConversation(ctx.conversationId, ctx.businessId, {
      assignedTo,
      assignedName,
    });
    return { assigned: true, assignedTo };
  }

  private async actionUpdateConversationStatus(
    action: WorkflowAction,
    ctx: TriggerContext,
  ): Promise<Record<string, unknown>> {
    if (!this.conversationService || !ctx.conversationId) {
      return { updated: false, reason: 'No conversation context' };
    }
    const status = action.config.status as ConversationStatus;
    await this.conversationService.updateConversation(ctx.conversationId, ctx.businessId, {
      status,
    });
    return { updated: true, status };
  }

  private async actionAddTag(action: WorkflowAction, ctx: TriggerContext): Promise<Record<string, unknown>> {
    if (!this.conversationService || !ctx.conversationId) {
      return { tagged: false, reason: 'No conversation context' };
    }
    const rawTag = action.config['tag'];
    const tag = typeof rawTag === 'string' ? rawTag : '';
    const conv = await this.conversationService.findOneConversation(ctx.conversationId, ctx.businessId);
    const tags = [...(conv.tags ?? [])];
    if (!tags.includes(tag)) tags.push(tag);
    await this.conversationService.updateConversation(ctx.conversationId, ctx.businessId, { tags });
    if (ctx.contactTags && !ctx.contactTags.includes(tag)) {
      ctx.contactTags.push(tag);
    }
    return { tagged: true, tag };
  }

  private async actionRemoveTag(action: WorkflowAction, ctx: TriggerContext): Promise<Record<string, unknown>> {
    if (!this.conversationService || !ctx.conversationId) {
      return { untagged: false, reason: 'No conversation context' };
    }
    const rawTag = action.config['tag'];
    const tag = typeof rawTag === 'string' ? rawTag : '';
    const conv = await this.conversationService.findOneConversation(ctx.conversationId, ctx.businessId);
    const tags = (conv.tags ?? []).filter(t => t !== tag);
    await this.conversationService.updateConversation(ctx.conversationId, ctx.businessId, { tags });
    if (ctx.contactTags) {
      ctx.contactTags = ctx.contactTags.filter(t => t !== tag);
    }
    return { untagged: true, tag };
  }

  private async actionHandoffToHuman(_action: WorkflowAction, ctx: TriggerContext): Promise<Record<string, unknown>> {
    if (!this.conversationService || !ctx.conversationId) {
      return { handoff: false, reason: 'No conversation context' };
    }
    await this.conversationService.updateConversation(ctx.conversationId, ctx.businessId, {
      status: ConversationStatus.PENDING,
    });
    return { handoff: true, conversationId: ctx.conversationId };
  }

  private async actionCreateContact(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!this.conversationService || !ctx.chatId) {
      return { created: false, reason: 'No conversation service or chatId' };
    }
    const phone = ctx.chatId.replace(/@.*$/, '');
    const rawName = (action.config['name'] as string) || (ctx.metadata?.['contactName'] as string) || phone;
    const name = this.interpolateVariables(rawName, ctx, run);
    const rawEmail = action.config['email'] as string | undefined;
    const email = rawEmail ? this.interpolateVariables(rawEmail, ctx, run) : undefined;
    const rawNotes = action.config['notes'] as string | undefined;
    const notes = rawNotes ? this.interpolateVariables(rawNotes, ctx, run) : undefined;
    const tags = Array.isArray(action.config['tags']) ? (action.config['tags'] as string[]) : undefined;

    const contact = await this.conversationService.getOrCreateContact(ctx.businessId, ctx.chatId, name, phone);
    if (email !== undefined || notes !== undefined || tags !== undefined) {
      await this.conversationService.updateContact(contact.id, ctx.businessId, { email, notes, tags });
    }
    return { created: true, contactId: contact.id, name, email, phone };
  }

  private async actionUpdateContact(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!this.conversationService || !ctx.chatId) {
      return { updated: false, reason: 'No conversation service or chatId' };
    }
    const contact = await this.conversationService.findContactByWaId(ctx.businessId, ctx.chatId);
    if (!contact) {
      return { updated: false, reason: 'Contact not found' };
    }
    const rawName = action.config['name'] as string | undefined;
    const name = rawName ? this.interpolateVariables(rawName, ctx, run) : undefined;
    const rawEmail = action.config['email'] as string | undefined;
    const email = rawEmail ? this.interpolateVariables(rawEmail, ctx, run) : undefined;
    const rawNotes = action.config['notes'] as string | undefined;
    const notes = rawNotes ? this.interpolateVariables(rawNotes, ctx, run) : undefined;
    const tags = Array.isArray(action.config['tags']) ? (action.config['tags'] as string[]) : undefined;

    await this.conversationService.updateContact(contact.id, ctx.businessId, { name, email, notes, tags });
    return { updated: true, contactId: contact.id, name, email };
  }

  private async actionInteractiveButtons(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId || !ctx.chatId) throw new Error('No session/chat context for interactive message');
    const rawMsg = String(action.config['message'] || action.config['text'] || 'Please choose an option:');
    const message = this.interpolateVariables(rawMsg, ctx, run);
    const rawButtons = (action.config['buttons'] as Array<{ id: string; text: string }>) || [
      { id: 'opt_1', text: 'Option 1' },
      { id: 'opt_2', text: 'Option 2' },
    ];
    const buttons = rawButtons.map(b => ({
      id: b.id,
      text: this.interpolateVariables(b.text, ctx, run),
    }));
    const mode = String(action.config['mode'] || 'auto');

    if (ctx.metadata?.isTest || action.config['dryRun']) {
      this.logger.log(`Workflow interactive buttons (simulated dry-run): chat=${ctx.chatId}`);
      const base = { sent: true, simulated: true, dryRun: true, mode, message, buttons: buttons.map(b => b.text) };
      // The live simulator pauses at the menu like a real chat (no message is actually sent).
      if (ctx.metadata?.simulate && run) {
        await this.waitForChoice(run, ctx, action, buttons);
        return { ...base, suspended: true };
      }
      return base;
    }

    let sentVia = 'text_fallback';

    if (mode === 'poll') {
      // Poll votes never reach resume(), so a poll would leave the customer's tap unanswered.
      this.logger.warn(`Poll menus cannot be answered yet; sending node ${action.id} as a numbered menu`);
    } else if (mode !== 'text' && this.engineRegistry) {
      // Auto / Buttons mode: Attempt real native interactive buttons first
      try {
        const engine = this.engineRegistry.get(ctx.sessionId);
        if (engine && typeof (engine as any).sendInteractiveButtons === 'function') {
          await (engine as any).sendInteractiveButtons(ctx.chatId, message, buttons);
          sentVia = 'native_buttons';
        }
      } catch (err) {
        // Not a poll: poll votes never reach resume(), so a tapped option would go unanswered.
        // A numbered text menu is answered by a normal reply.
        this.logger.warn(
          `Native buttons not supported (${err instanceof Error ? err.message : String(err)}). Sending a numbered menu.`,
        );
      }
    }

    if (sentVia === 'text_fallback' && this.messageService) {
      const lines = [message, ''];
      buttons.forEach((b, idx) => {
        lines.push(`${idx + 1}️⃣  *${b.text}*`);
      });
      lines.push('');
      lines.push(`👉 *Reply with number (${buttons.map((_, idx) => idx + 1).join(', ')}) or option name*`);
      await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text: lines.join('\n'),
      });
      sentVia = 'formatted_text_menu';
    }

    if (run) await this.waitForChoice(run, ctx, action, buttons);

    return { sentVia, message, buttons, buttonsCount: buttons.length, suspended: Boolean(run) };
  }

  /**
   * Pauses the run until the customer picks one of the choices; resume() then follows the edge whose
   * handle is the chosen id. A choice matches by number, label or id.
   */
  private async waitForChoice(
    run: WorkflowRun,
    ctx: TriggerContext,
    action: WorkflowAction,
    choices: Array<{ id: string; text: string }>,
  ): Promise<void> {
    const choiceMap: Record<string, string> = {};
    choices.forEach((b, idx) => {
      choiceMap[String(idx + 1)] = b.id;
      choiceMap[b.text.toLowerCase().trim()] = b.id;
      choiceMap[b.id.toLowerCase().trim()] = b.id;
      const plain = normalizeChoice(b.text);
      if (plain) choiceMap[plain] = b.id;
    });

    const timeoutMinutes = Number(action.config['timeoutMinutes'] || 60);
    const triggerData = {
      ...(run.triggerData || {}),
      chatId: ctx.chatId,
      currentNodeId: action.id,
      waitingForInput: true,
      expectedInputType: 'button_choice',
      choiceMap,
      invalidAttempts: 0,
      pausedAt: new Date().toISOString(),
      timeoutMinutes,
      timeoutAt: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(),
    };

    await this.workflowService.updateRunTriggerData(run.id, triggerData);
  }

  /**
   * Sends a published Message Studio message. When it has quick replies or a list, the run waits for
   * the customer's choice and branches on it, exactly like an Interactive Buttons node.
   */
  private async actionSendStudioMessage(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const messageId = typeof action.config['studioMessageId'] === 'string' ? action.config['studioMessageId'] : '';
    if (!messageId) throw new Error('Choose a Message Studio message for this step');
    if (!ctx.sessionId || !ctx.chatId) throw new Error('No session/chat context for studio message');
    const waitForReply = action.config['waitForReply'] !== false;

    if (ctx.metadata?.isTest || action.config['dryRun']) {
      this.logger.log(`Workflow studio message (simulated dry-run): chat=${ctx.chatId} message=${messageId}`);
      return { sent: true, simulated: true, dryRun: true, studioMessageId: messageId, chatId: ctx.chatId };
    }
    if (!this.studioService) throw new Error('Message Studio is not available');

    const result = await this.studioService.sendForWorkflow({
      businessId: ctx.businessId,
      messageId,
      sessionId: ctx.sessionId,
      chatId: ctx.chatId,
      fill: text => this.interpolateVariables(text, ctx, run),
      targetMessageId: (ctx.metadata as { messageId?: string } | undefined)?.messageId,
    });
    const waits = Boolean(run) && waitForReply && result.choices.length > 0;
    if (waits && run) await this.waitForChoice(run, ctx, action, result.choices);

    return {
      sent: true,
      studioMessageId: messageId,
      name: result.name,
      messageIds: result.parts.map(p => p.messageId).filter(Boolean),
      choices: result.choices,
      suspended: waits,
    };
  }

  private async actionAskQuestion(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId || !ctx.chatId) throw new Error('No session/chat context for question');
    const rawPrompt = String(
      action.config['question'] || action.config['prompt'] || action.config['message'] || 'Please enter your response:',
    );
    const prompt = this.interpolateVariables(rawPrompt, ctx, run);
    const slot = String(action.config['slot'] || 'response');
    const validation = String(action.config['validation'] || 'any');
    const rawRetry = String(action.config['retryPrompt'] || 'Invalid input. Please try again:');
    const retryPrompt = this.interpolateVariables(rawRetry, ctx, run);
    const maxRetries = Number(action.config['maxRetries'] || 3);

    if (this.isDryRun(ctx, action)) {
      // The live simulator waits for the typed answer like a real chat (no message is actually sent).
      if (ctx.metadata?.simulate && run) {
        await this.workflowService.updateRunTriggerData(run.id, {
          ...(run.triggerData || {}),
          chatId: ctx.chatId,
          currentNodeId: action.id,
          waitingForInput: true,
          expectedInputType: 'question_slot',
          slot,
          validation,
          retryPrompt,
          maxRetries,
          attempts: 0,
          pausedAt: new Date().toISOString(),
          timeoutMinutes: Number(action.config['timeoutMinutes'] || 60),
          timeoutAt: new Date(Date.now() + Number(action.config['timeoutMinutes'] || 60) * 60 * 1000).toISOString(),
        });
        return { simulated: true, dryRun: true, prompt, slot, validation, suspended: true };
      }
      return { sent: true, simulated: true, dryRun: true, prompt, slot, validation };
    }

    if (this.messageService) {
      await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text: prompt,
      });
    }

    if (run) {
      const triggerData = {
        ...(run.triggerData || {}),
        chatId: ctx.chatId,
        currentNodeId: action.id,
        waitingForInput: true,
        expectedInputType: 'question_slot',
        slot,
        validation,
        retryPrompt,
        maxRetries,
        attempts: 0,
        pausedAt: new Date().toISOString(),
        timeoutMinutes: Number(action.config['timeoutMinutes'] || 60),
        timeoutAt: new Date(Date.now() + Number(action.config['timeoutMinutes'] || 60) * 60 * 1000).toISOString(),
      };

      await this.workflowService.updateRunTriggerData(run.id, triggerData);
    }

    return { prompt, slot, validation, suspended: Boolean(run) };
  }

  private async actionConditionBranch(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawField = String(action.config['field'] || 'tag').trim();
    const operator = String(action.config['operator'] || 'contains')
      .toLowerCase()
      .trim();
    const rawTarget = String(action.config['value'] ?? '').trim();
    const targetValue = this.interpolateVariables(rawTarget, ctx, run);

    let actualValue = '';
    if (rawField === 'tag') {
      actualValue = (ctx.contactTags || []).join(',');
    } else if (rawField === 'status') {
      actualValue = String(ctx.conversationStatus || '');
    } else if (rawField.startsWith('{{') && rawField.endsWith('}}')) {
      actualValue = this.interpolateVariables(rawField, ctx, run);
    } else if (
      rawField.startsWith('steps.') ||
      rawField.startsWith('vars.') ||
      rawField.startsWith('variables.') ||
      rawField.startsWith('trigger.') ||
      rawField.startsWith('last.')
    ) {
      actualValue = this.interpolateVariables(`{{${rawField}}}`, ctx, run);
    } else {
      const captured = (run?.triggerData?.['capturedVariables'] as Record<string, unknown>) || {};
      if (rawField in captured) {
        actualValue = String(captured[rawField] ?? '');
      } else {
        actualValue = String(ctx.messageBody || '');
      }
    }

    const normActual = actualValue.toLowerCase().trim();
    const normTarget = targetValue.toLowerCase().trim();

    let matched = false;
    switch (operator) {
      case 'equals':
      case '==':
        matched = normActual === normTarget;
        break;
      case 'not_equals':
      case '!=':
        matched = normActual !== normTarget;
        break;
      case 'contains':
        matched = normActual.includes(normTarget);
        break;
      case 'not_contains':
        matched = !normActual.includes(normTarget);
        break;
      case 'starts_with':
        matched = normActual.startsWith(normTarget);
        break;
      case 'ends_with':
        matched = normActual.endsWith(normTarget);
        break;
      case 'greater_than':
      case '>':
        matched = Number(actualValue) > Number(targetValue);
        break;
      case 'greater_than_or_equal':
      case '>=':
        matched = Number(actualValue) >= Number(targetValue);
        break;
      case 'less_than':
      case '<':
        matched = Number(actualValue) < Number(targetValue);
        break;
      case 'less_than_or_equal':
      case '<=':
        matched = Number(actualValue) <= Number(targetValue);
        break;
      case 'is_empty':
        matched = !actualValue || actualValue.trim() === '';
        break;
      case 'is_not_empty':
        matched = Boolean(actualValue && actualValue.trim() !== '');
        break;
      default:
        matched = normActual.includes(normTarget);
    }

    return {
      matched,
      branch: matched ? 'true' : 'false',
      field: rawField,
      actualValue,
      targetValue,
      operator,
    };
  }

  private async actionAiAssistant(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!this.aiService || !ctx.sessionId || !ctx.chatId) {
      return { status: 'ai_service_unavailable' };
    }
    const rawPrompt = action.config['prompt'] || action.config['message'];
    const message = rawPrompt ? this.interpolateVariables(String(rawPrompt), ctx, run) : ctx.messageBody || '';

    const res = await this.aiService.chat({
      businessId: ctx.businessId,
      sessionId: ctx.sessionId,
      chatId: ctx.chatId,
      message,
    });

    const dryRun = this.isDryRun(ctx, action);
    if (this.messageService && res.reply && !dryRun) {
      await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text: res.reply,
      });
    }

    if (res.handoff && this.conversationService && ctx.conversationId && !dryRun) {
      await this.conversationService.updateConversation(ctx.conversationId, ctx.businessId, {
        status: ConversationStatus.PENDING,
      });
    }

    return {
      reply: res.reply,
      text: res.reply,
      replyLength: res.reply?.length ?? 0,
      handoff: res.handoff,
      confidence: res.confidence,
    };
  }

  private async actionTypingIndicator(action: WorkflowAction, ctx: TriggerContext): Promise<Record<string, unknown>> {
    if (!ctx.sessionId || !ctx.chatId || !this.engineRegistry) {
      return { status: 'skipped', reason: 'No session/chat or engineRegistry' };
    }
    const durationMs = Math.min(Math.max(Number(action.config['durationMs'] || 1500), 200), 10000);
    if (this.isDryRun(ctx, action)) return { success: true, simulated: true, dryRun: true, durationMs };
    try {
      const engine = this.engineRegistry.get(ctx.sessionId);
      if (engine && typeof engine.sendChatState === 'function') {
        await engine.sendChatState(ctx.chatId, 'typing');
        await this.delay(durationMs);
        await engine.sendChatState(ctx.chatId, 'paused');
        return { success: true, durationMs };
      }
    } catch (err) {
      this.logger.warn(`Failed to send typing indicator: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { success: false, fallback: true };
  }

  private async actionMarkAsRead(action: WorkflowAction, ctx: TriggerContext): Promise<Record<string, unknown>> {
    if (!ctx.sessionId || !ctx.chatId || !this.engineRegistry) {
      return { status: 'skipped', reason: 'No session/chat or engineRegistry' };
    }
    if (this.isDryRun(ctx, action)) return { markedRead: true, simulated: true, dryRun: true };
    try {
      const engine = this.engineRegistry.get(ctx.sessionId);
      if (engine && typeof engine.sendSeen === 'function') {
        const ok = await engine.sendSeen(ctx.chatId);
        return { markedRead: ok };
      }
    } catch (err) {
      this.logger.warn(`Failed to mark as read: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { markedRead: false };
  }

  private async actionSendReaction(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId || !ctx.chatId || !this.engineRegistry) {
      return { status: 'skipped', reason: 'No session/chat or engineRegistry' };
    }
    const rawEmoji = String(action.config['emoji'] || '👍').trim();
    const emoji = this.interpolateVariables(rawEmoji, ctx, run);
    const rawMsgId = String(action.config['messageId'] || ctx.metadata?.['messageId'] || '').trim();
    const messageId = this.interpolateVariables(rawMsgId, ctx, run);

    if (!messageId) {
      return { status: 'skipped', reason: 'No message ID for reaction' };
    }
    if (this.isDryRun(ctx, action)) return { reacted: true, simulated: true, dryRun: true, emoji, messageId };

    try {
      const engine = this.engineRegistry.get(ctx.sessionId);
      if (engine && typeof engine.reactToMessage === 'function') {
        await engine.reactToMessage(ctx.chatId, messageId, emoji);
        return { reacted: true, emoji, messageId };
      }
    } catch (err) {
      this.logger.warn(`Failed to send reaction: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { reacted: false };
  }

  private async actionSendLocation(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId || !ctx.chatId || !this.engineRegistry) {
      return { status: 'skipped', reason: 'No session/chat or engineRegistry' };
    }
    const latitude = Number(this.interpolateVariables(String(action.config['latitude'] || 0), ctx, run));
    const longitude = Number(this.interpolateVariables(String(action.config['longitude'] || 0), ctx, run));
    const name = this.interpolateVariables(String(action.config['name'] || ''), ctx, run) || undefined;
    const address = this.interpolateVariables(String(action.config['address'] || ''), ctx, run) || undefined;
    if (this.isDryRun(ctx, action)) {
      return { sent: true, simulated: true, dryRun: true, latitude, longitude, name, address };
    }

    try {
      const engine = this.engineRegistry.get(ctx.sessionId);
      if (engine && typeof engine.sendLocationMessage === 'function') {
        const res = await engine.sendLocationMessage(ctx.chatId, {
          latitude,
          longitude,
          description: name || undefined,
          address,
        });
        return { sent: true, messageId: res.id, latitude, longitude, name, address };
      }
    } catch (err) {
      throw new Error(`Failed to send location message: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
    throw new Error('This WhatsApp engine cannot send location messages');
  }

  private async actionWebhookCall(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawUrl = (action.config['url'] as string) || '';
    if (!rawUrl) throw new Error('Webhook action requires a URL');

    const method = String(action.config['method'] || 'POST').toUpperCase();
    const timeoutMs = Math.min(Math.max(Number(action.config['timeoutMs'] || 10000), 1000), 30000);

    // 1. Interpolate base URL (values are URL-encoded, so customer text cannot add path or query parts)
    let fullUrl = this.interpolateVariables(rawUrl, ctx, run, undefined, encodeURIComponent);

    // 2. Query Parameters
    const rawParams = action.config['queryParams'] || action.config['params'];
    const paramEntries: Array<[string, string]> = [];
    if (Array.isArray(rawParams)) {
      for (const p of rawParams) {
        if (p && typeof p === 'object' && p.key) {
          const k = this.interpolateVariables(String(p.key).trim(), ctx, run);
          const v = this.interpolateVariables(String(p.value ?? ''), ctx, run);
          if (k) paramEntries.push([k, v]);
        }
      }
    } else if (rawParams && typeof rawParams === 'object') {
      for (const [k, v] of Object.entries(rawParams)) {
        const key = this.interpolateVariables(k.trim(), ctx, run);
        const val = this.interpolateVariables(String(v ?? ''), ctx, run);
        if (key) paramEntries.push([key, val]);
      }
    }

    if (paramEntries.length > 0) {
      try {
        const urlObj = new URL(fullUrl);
        for (const [k, v] of paramEntries) {
          urlObj.searchParams.append(k, v);
        }
        fullUrl = urlObj.toString();
      } catch {
        const separator = fullUrl.includes('?') ? '&' : '?';
        const qs = paramEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        fullUrl = `${fullUrl}${separator}${qs}`;
      }
    }

    // 3. Headers
    const headers: Record<string, string> = {
      'User-Agent': 'OpenWA-Workflow-Engine/1.0',
    };
    const rawHeaders = action.config['headers'];
    if (Array.isArray(rawHeaders)) {
      for (const h of rawHeaders) {
        if (h && typeof h === 'object' && h.key) {
          const k = this.interpolateVariables(String(h.key).trim(), ctx, run);
          const v = this.interpolateVariables(String(h.value ?? ''), ctx, run);
          if (k) headers[k] = v;
        }
      }
    } else if (rawHeaders && typeof rawHeaders === 'object') {
      for (const [k, v] of Object.entries(rawHeaders)) {
        const key = this.interpolateVariables(k.trim(), ctx, run);
        const val = this.interpolateVariables(String(v ?? ''), ctx, run);
        if (key) headers[key] = val;
      }
    }

    // 4. Request Body
    let reqBody: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      const rawBody = action.config['body'];
      const contentType = headers['Content-Type'] || headers['content-type'] || 'application/json';
      // Customer text lands inside JSON string literals; escape it so a quote cannot add fields.
      const bodyEncode = contentType.includes('json') ? jsonStringContent : undefined;
      if (typeof rawBody === 'string' && rawBody.trim()) {
        reqBody = this.interpolateVariables(rawBody, ctx, run, undefined, bodyEncode);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else if (rawBody && typeof rawBody === 'object' && Object.keys(rawBody).length > 0) {
        reqBody = this.interpolateVariables(JSON.stringify(rawBody), ctx, run, undefined, jsonStringContent);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else {
        const defaultPayload = {
          sessionId: ctx.sessionId,
          chatId: ctx.chatId,
          contactId: ctx.contactId,
          messageBody: ctx.messageBody,
          businessId: ctx.businessId,
          variables: run?.triggerData?.['capturedVariables'] || {},
          timestamp: new Date().toISOString(),
        };
        reqBody = JSON.stringify(defaultPayload);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    // 5. Execute Request with AbortController timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const response = await guardedHttpRequest(
        fullUrl,
        { method, headers, body: reqBody, signal: controller.signal },
        this.logger,
      );
      const durationMs = Date.now() - start;
      const responseData = response.data;

      // 6. Response Variable Mapping
      const responseMapping = action.config['responseMapping'] as Array<{ path: string; variable: string }> | undefined;
      const captured = (run?.triggerData?.['capturedVariables'] as Record<string, unknown>) || {};

      captured['lastHttpStatus'] = response.status;
      captured['lastHttpOk'] = response.ok;

      if (Array.isArray(responseMapping)) {
        for (const mapping of responseMapping) {
          if (mapping?.variable && typeof responseData === 'object' && responseData !== null) {
            const val = this.extractJsonPath(responseData as Record<string, unknown>, mapping.path);
            if (val !== undefined) {
              captured[mapping.variable.trim()] = val;
            }
          }
        }
      } else if (action.config['saveResponseTo']) {
        const varName = String(action.config['saveResponseTo']).trim();
        if (varName) {
          captured[varName] = responseData;
        }
      }

      if (run) {
        const triggerData = {
          ...(run.triggerData || {}),
          capturedVariables: captured,
        };
        await this.workflowService.updateRunTriggerData(run.id, triggerData);
      }

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        status: response.status,
        durationMs,
        // Step output is stored on the run and readable by viewer keys; API keys often ride in the query.
        url: redactUrlSecrets(fullUrl),
        data: responseData,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public async testWebhookCall(dto: {
    url: string;
    method?: string;
    queryParams?: Array<{ key: string; value: string }> | Record<string, string>;
    headers?: Array<{ key: string; value: string }> | Record<string, string>;
    body?: string | Record<string, unknown>;
    testVariables?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{
    success: boolean;
    statusCode: number;
    statusText: string;
    durationMs: number;
    resolvedUrl: string;
    headers?: Record<string, string>;
    data?: unknown;
    error?: string;
  }> {
    const rawUrl = dto.url || '';
    if (!rawUrl) {
      return {
        success: false,
        statusCode: 400,
        statusText: 'Bad Request',
        durationMs: 0,
        resolvedUrl: '',
        error: 'Webhook URL is required',
      };
    }

    const testVars = dto.testVariables || {
      phone: '919876543210',
      sender: '919876543210@c.us',
      chatId: '919876543210@c.us',
      name: 'Test Customer',
      contactName: 'Test Customer',
      message: 'Hello, this is a test message',
      body: 'Hello, this is a test message',
    };

    const mockCtx: Partial<TriggerContext> = {
      chatId: testVars['chatId'] || '919876543210@c.us',
      messageBody: testVars['message'] || 'Hello, this is a test message',
      metadata: { contactName: testVars['name'] || 'Test Customer' },
    };

    let fullUrl = this.interpolateVariables(rawUrl, mockCtx, undefined, testVars);

    // Query params
    const rawParams = dto.queryParams;
    const paramEntries: Array<[string, string]> = [];
    if (Array.isArray(rawParams)) {
      for (const p of rawParams) {
        if (p && typeof p === 'object' && p.key) {
          const k = this.interpolateVariables(String(p.key).trim(), mockCtx, undefined, testVars);
          const v = this.interpolateVariables(String(p.value ?? ''), mockCtx, undefined, testVars);
          if (k) paramEntries.push([k, v]);
        }
      }
    } else if (rawParams && typeof rawParams === 'object') {
      for (const [k, v] of Object.entries(rawParams)) {
        const key = this.interpolateVariables(k.trim(), mockCtx, undefined, testVars);
        const val = this.interpolateVariables(String(v ?? ''), mockCtx, undefined, testVars);
        if (key) paramEntries.push([key, val]);
      }
    }

    if (paramEntries.length > 0) {
      try {
        const urlObj = new URL(fullUrl);
        for (const [k, v] of paramEntries) {
          urlObj.searchParams.append(k, v);
        }
        fullUrl = urlObj.toString();
      } catch {
        const separator = fullUrl.includes('?') ? '&' : '?';
        const qs = paramEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        fullUrl = `${fullUrl}${separator}${qs}`;
      }
    }

    const method = String(dto.method || 'POST').toUpperCase();
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'OpenWA-Workflow-Engine/1.0',
    };
    if (Array.isArray(dto.headers)) {
      for (const h of dto.headers) {
        if (h && typeof h === 'object' && h.key) {
          const k = this.interpolateVariables(String(h.key).trim(), mockCtx, undefined, testVars);
          const v = this.interpolateVariables(String(h.value ?? ''), mockCtx, undefined, testVars);
          if (k) reqHeaders[k] = v;
        }
      }
    } else if (dto.headers && typeof dto.headers === 'object') {
      for (const [k, v] of Object.entries(dto.headers)) {
        const key = this.interpolateVariables(k.trim(), mockCtx, undefined, testVars);
        const val = this.interpolateVariables(String(v ?? ''), mockCtx, undefined, testVars);
        if (key) reqHeaders[key] = val;
      }
    }

    let reqBody: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      if (typeof dto.body === 'string' && dto.body.trim()) {
        reqBody = this.interpolateVariables(dto.body, mockCtx, undefined, testVars);
        if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      } else if (dto.body && typeof dto.body === 'object') {
        reqBody = this.interpolateVariables(JSON.stringify(dto.body), mockCtx, undefined, testVars);
        if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      } else {
        reqBody = JSON.stringify({
          test: true,
          timestamp: new Date().toISOString(),
          phone: testVars['phone'],
          variables: testVars,
        });
        if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    const timeoutMs = Math.min(Math.max(Number(dto.timeoutMs || 10000), 1000), 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await guardedHttpRequest(
        fullUrl,
        { method, headers: reqHeaders, body: reqBody, signal: controller.signal },
        this.logger,
      );
      const durationMs = Date.now() - start;

      return {
        success: res.ok,
        statusCode: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        durationMs,
        resolvedUrl: fullUrl,
        headers: res.headers,
        data: res.data,
        error: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        success: false,
        statusCode: 0,
        statusText: 'Network / Fetch Error',
        durationMs,
        resolvedUrl: fullUrl,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public extractJsonPath(obj: unknown, path?: string): unknown {
    if (!path || path === '.' || path === '*') return obj;
    if (obj === null || obj === undefined) return undefined;

    // Normalize bracket syntax: items[0].name -> items.0.name, items['title'] -> items.title
    const normalized = path.replace(/\[(\d+)\]/g, '.$1').replace(/\[['"](.+?)['"]\]/g, '.$1');

    const parts = normalized.split('.').filter(Boolean);
    let curr: any = obj;
    try {
      for (const part of parts) {
        if (curr === null || curr === undefined) return undefined;
        if (typeof curr !== 'object' && typeof curr !== 'function') return undefined;
        curr = curr[part];
      }
      return curr;
    } catch {
      return undefined;
    }
  }

  /**
   * Feed a customer's message to a run that is waiting for their answer. The outcome tells the caller
   * whether the message was consumed here or should start workflows afresh ('restart').
   */
  async resume(
    workflow: WorkflowDefinition,
    run: WorkflowRun,
    ctx: TriggerContext,
    userReply: string,
    message: { id?: string; timestamp?: number } = {},
  ): Promise<ResumeOutcome> {
    const triggerData = (run.triggerData || {}) as Record<string, any>;
    if (!triggerData.waitingForInput) return 'ignored';

    // The message that started or last advanced this run, or one sent before the bot asked its
    // question (e.g. "Hi" followed by a second line), belongs to the previous step, not this answer.
    if (message.id && (message.id === triggerData.messageId || message.id === triggerData.lastMessageId)) {
      return 'ignored';
    }
    const pausedAtSec = Math.floor(Date.parse(String(triggerData.pausedAt ?? '')) / 1000);
    if (message.timestamp && Number.isFinite(pausedAtSec) && message.timestamp < pausedAtSec) return 'ignored';

    const reply = userReply.trim();
    // Stickers, voice notes and captionless media carry no answer; stay quiet instead of "Invalid choice".
    if (!reply) return 'ignored';

    if (!(await this.workflowService.claimPausedRun(run.id))) return 'ignored';

    try {
      const word = reply.toLowerCase().replace(/[\s!.]+$/, '');
      const choiceMap = (triggerData.choiceMap || {}) as Record<string, string>;
      const isMenuChoice =
        triggerData.expectedInputType === 'button_choice' &&
        Boolean(choiceMap[word] || choiceMap[normalizeChoice(reply)]);
      if (!isMenuChoice && (STOP_WORDS.has(word) || RESTART_WORDS.has(word))) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.CANCELLED, {
          failureReason: `Customer sent "${word}"`,
        });
        return STOP_WORDS.has(word) ? 'cancelled' : 'restart';
      }

      triggerData.lastMessageId = message.id;
      await this.applyReply(workflow, run, ctx, reply, triggerData);
      return 'resumed';
    } catch (err) {
      this.logger.error(
        `Workflow resume error: workflow=${workflow.id} run=${run.id}`,
        err instanceof Error ? err.message : String(err),
      );
      await this.workflowService
        .updateRunStatus(run.id, RunStatus.FAILED, { failureReason: err instanceof Error ? err.message : String(err) })
        .catch(() => undefined);
      return 'resumed';
    }
  }

  private async applyReply(
    workflow: WorkflowDefinition,
    run: WorkflowRun,
    ctx: TriggerContext,
    userReply: string,
    triggerData: Record<string, any>,
  ): Promise<void> {
    const inputType = triggerData.expectedInputType;
    let nextHandle: string | undefined;

    if (!triggerData.stepOutputs) {
      triggerData.stepOutputs = {};
    }

    if (inputType === 'button_choice') {
      const choiceMap = (triggerData.choiceMap || {}) as Record<string, string>;
      const normalized = userReply.toLowerCase().trim();
      const matchedChoiceId =
        choiceMap[normalized] || choiceMap[userReply.trim()] || choiceMap[normalizeChoice(userReply)];

      if (!matchedChoiceId) {
        const invalidAttempts = Number(triggerData.invalidAttempts || 0) + 1;
        const givingUp = invalidAttempts >= MAX_INVALID_CHOICES;
        if (this.messageService && ctx.sessionId && ctx.chatId) {
          await this.messageService.sendText(ctx.sessionId, {
            chatId: ctx.chatId,
            text: givingUp
              ? `Let's start over. Type *menu* any time to see the options again.`
              : `❌ Invalid choice. Please select a valid option or reply with the correct number.\nType *menu* to start again.`,
          });
        }
        if (givingUp) {
          await this.workflowService.updateRunStatus(run.id, RunStatus.CANCELLED, {
            failureReason: `No valid choice after ${MAX_INVALID_CHOICES} replies`,
          });
          return;
        }
        triggerData.invalidAttempts = invalidAttempts;
        await this.workflowService.updateRunTriggerData(run.id, triggerData);
        await this.workflowService.updateRunStatus(run.id, RunStatus.PAUSED);
        return;
      }

      const selectedId = matchedChoiceId;
      nextHandle = selectedId;
      triggerData.waitingForInput = false;
      triggerData.capturedVariables = {
        ...(triggerData.capturedVariables || {}),
        lastChoice: selectedId,
      };

      const buttonOutput = {
        chosenButtonId: selectedId,
        choice: selectedId,
        userReply: userReply.trim(),
        answered: true,
      };

      if (triggerData.currentNodeId) {
        triggerData.stepOutputs[triggerData.currentNodeId] = buttonOutput;
      }
      triggerData.stepOutputs['last'] = buttonOutput;
    } else if (inputType === 'question_slot') {
      const slot = triggerData.slot || 'response';
      const validation = triggerData.validation || 'any';
      const checked = validateAnswer(String(validation), userReply);
      const isValid = checked !== null;
      const trimmed = checked ?? userReply.trim();

      if (!isValid) {
        const attempts = Number(triggerData.attempts || 0) + 1;
        triggerData.attempts = attempts;
        if (attempts < Number(triggerData.maxRetries || 3)) {
          if (this.messageService && ctx.sessionId && ctx.chatId) {
            await this.messageService.sendText(ctx.sessionId, {
              chatId: ctx.chatId,
              text: triggerData.retryPrompt || 'Invalid format, please try again:',
            });
          }
          await this.workflowService.updateRunTriggerData(run.id, triggerData);
          await this.workflowService.updateRunStatus(run.id, RunStatus.PAUSED);
          return;
        }
        nextHandle = 'fallback';
        triggerData.waitingForInput = false;
      } else {
        triggerData.waitingForInput = false;
        triggerData.capturedVariables = {
          ...(triggerData.capturedVariables || {}),
          [slot]: trimmed,
        };

        const questionOutput = {
          answered: true,
          slot,
          answer: trimmed,
          value: trimmed,
          text: trimmed,
          validation,
        };

        if (triggerData.currentNodeId) {
          triggerData.stepOutputs[triggerData.currentNodeId] = questionOutput;
        }
        triggerData.stepOutputs['last'] = questionOutput;

        if (this.conversationService && ctx.chatId) {
          const updateDto: Record<string, any> = {};
          if (slot === 'email') updateDto.email = trimmed;
          if (slot === 'name') updateDto.name = trimmed;
          if (Object.keys(updateDto).length > 0) {
            const contact = await this.conversationService.findContactByWaId(ctx.businessId, ctx.chatId);
            if (contact) {
              await this.conversationService.updateContact(contact.id, ctx.businessId, updateDto);
            }
          }
        }
      }
    }

    await this.workflowService.updateRunTriggerData(run.id, triggerData);
    await this.workflowService.updateRunStatus(run.id, RunStatus.RUNNING);

    const nodes = (workflow.definition.nodes || []) as VisualWorkflowNode[];
    const edges = (workflow.definition.edges || []) as VisualWorkflowEdge[];
    const currentNodeId = triggerData.currentNodeId;

    if (nodes.length > 0 && edges.length > 0 && currentNodeId) {
      await this.executeGraphFromNode(workflow, run, ctx, currentNodeId, nextHandle);
    } else {
      await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED);
    }
  }

  private async actionSetFields(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawAssignments = action.config['assignments'] as Array<{ name: string; value: string }> | undefined;
    const assignments = Array.isArray(rawAssignments) ? rawAssignments : [];
    const fields = (action.config['fields'] as Record<string, unknown>) || {};

    const updatedVars: Record<string, unknown> = {};

    for (const item of assignments) {
      if (item && item.name) {
        const val = this.interpolateVariables(String(item.value ?? ''), ctx, run);
        updatedVars[item.name] = val;
      }
    }

    for (const [k, v] of Object.entries(fields)) {
      if (k) {
        const val = typeof v === 'string' ? this.interpolateVariables(v, ctx, run) : v;
        updatedVars[k] = val;
      }
    }

    if (run) {
      const triggerData = (run.triggerData || {}) as Record<string, unknown>;
      const captured = (triggerData['capturedVariables'] || {}) as Record<string, unknown>;
      Object.assign(captured, updatedVars);
      triggerData['capturedVariables'] = captured;
      run.triggerData = triggerData;
    }

    return { set: true, variables: updatedVars };
  }

  private async actionFilter(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawField = String(action.config['field'] || 'trigger.message');
    const operator = String(action.config['operator'] || 'contains');
    const rawTarget = String(action.config['value'] || '');

    const resolvedFieldVal = this.interpolateVariables(`{{${rawField}}}`, ctx, run);
    const resolvedTarget = this.interpolateVariables(rawTarget, ctx, run);

    let passed = false;
    const fLower = resolvedFieldVal.toLowerCase();
    const tLower = resolvedTarget.toLowerCase();

    switch (operator) {
      case 'equals':
      case '==':
        passed = fLower === tLower;
        break;
      case 'not_equals':
      case '!=':
        passed = fLower !== tLower;
        break;
      case 'contains':
        passed = fLower.includes(tLower);
        break;
      case 'not_contains':
        passed = !fLower.includes(tLower);
        break;
      case 'starts_with':
        passed = fLower.startsWith(tLower);
        break;
      case 'ends_with':
        passed = fLower.endsWith(tLower);
        break;
      case 'empty':
        passed = resolvedFieldVal.trim().length === 0;
        break;
      case 'not_empty':
        passed = resolvedFieldVal.trim().length > 0;
        break;
      case 'greater_than':
      case '>':
        passed = Number(resolvedFieldVal) > Number(resolvedTarget);
        break;
      case 'less_than':
      case '<':
        passed = Number(resolvedFieldVal) < Number(resolvedTarget);
        break;
      default:
        passed = fLower.includes(tLower);
    }

    if (!passed) {
      return {
        passed: false,
        filtered: true,
        reason: `Filter condition '${rawField} ${operator} ${rawTarget}' not met`,
      };
    }

    return { passed: true, filtered: false, value: resolvedFieldVal };
  }

  private async actionStopWorkflow(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawReason = String(action.config['reason'] || 'Workflow stopped by stop node');
    const reason = this.interpolateVariables(rawReason, ctx, run);
    return { stopped: true, reason };
  }

  /**
   * Finds the customer's row in a Google Sheet and replies with it. The key is the number the customer
   * wrote in their message (or their own number when they wrote none). Output: `branch` is `found` or
   * `not_found`, and the row is available as {{steps.<node>.fields.<column>}} or {{steps.<node>.rowText}}.
   */
  private async actionSheetsLookup(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const integrationId = String(action.config['integrationId'] ?? '');
    const spreadsheetId = String(action.config['spreadsheetId'] ?? '').trim();
    const sheetName = String(action.config['sheetName'] || 'Sheet1');
    const keyColumn = String(action.config['keyColumn'] || 'Phone');
    const configuredKey = String(action.config['keyValue'] ?? '').trim();
    if (!integrationId) throw new Error('Choose a Google Sheets connection for this lookup');
    if (!spreadsheetId) throw new Error('Choose the spreadsheet to search');

    const value = configuredKey
      ? this.interpolateVariables(configuredKey, ctx, run).trim()
      : (extractPhoneFromText(ctx.messageBody ?? '') ?? (ctx.chatId ?? '').replace(/@.*$/, ''));

    if (ctx.metadata?.isTest || action.config['dryRun']) {
      this.logger.log(`Workflow sheets lookup (simulated dry-run): sheet=${spreadsheetId} key=${value}`);
      return { simulated: true, branch: 'found', value, found: true, fields: {}, rowText: '' };
    }
    if (!this.integrationsService || !this.googleService) {
      throw new Error('Google Sheets is not available on this server');
    }

    const integration = await this.integrationsService.findOne(integrationId, ctx.businessId);
    const result = await this.googleService.lookupRow(integration, { spreadsheetId, sheetName, keyColumn, value });
    const output: Record<string, unknown> = { ...result, value, branch: result.found ? 'found' : 'not_found' };

    const template = result.found
      ? String(action.config['replyTemplate'] ?? '{{row}}')
      : String(action.config['notFoundMessage'] ?? '');
    if (template.trim() && ctx.sessionId && ctx.chatId && this.messageService) {
      const text = this.renderSheetReply(template, result, ctx, run);
      await this.messageService.sendText(ctx.sessionId, { chatId: ctx.chatId, text });
      output['replied'] = true;
    }
    return output;
  }

  /** `{{row}}` is the whole row as text, `{{column_name}}` one field, and other tokens resolve as usual. */
  private renderSheetReply(
    template: string,
    result: { rowText?: string; fields?: Record<string, string> },
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): string {
    const fields = result.fields ?? {};
    const withRow = template.replace(/\{\{\s*row\s*\}\}/g, () => result.rowText ?? '');
    const withFields = withRow.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (match: string, key: string) =>
      key in fields ? fields[key] : match,
    );
    return this.interpolateVariables(withFields, ctx, run);
  }

  private async actionGoogleSheets(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const webhookUrl = String(action.config['webhookUrl'] || action.config['url'] || '');
    const rawColumns = (action.config['columns'] as Record<string, unknown>) || {};
    const columns: Record<string, unknown> = {};

    for (const [col, val] of Object.entries(rawColumns)) {
      columns[col] = typeof val === 'string' ? this.interpolateVariables(val, ctx, run) : val;
    }

    if (Object.keys(columns).length === 0) {
      columns['Phone'] = ctx.chatId?.replace(/@.*$/, '') || '';
      columns['Message'] = ctx.messageBody || '';
      columns['Timestamp'] = new Date().toISOString();
    }

    if (!webhookUrl) throw new Error('Google Sheets action requires a webhook URL');
    if (ctx.metadata?.isTest || action.config['dryRun']) {
      return { success: true, simulated: true, dryRun: true, appendedRow: columns, destination: webhookUrl };
    }

    const result = await this.testWebhookCall({
      url: webhookUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'appendRow', row: columns }),
    });

    if (!result.success) {
      throw new Error(`Google Sheets append failed: ${result.error ?? `HTTP ${result.statusCode}`}`);
    }
    return { success: true, statusCode: result.statusCode, appendedRow: columns };
  }

  private async actionSendMedia(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for send media');
    if (!ctx.chatId) throw new Error('No chat context for send media');

    const mediaType = String(action.config['mediaType'] || 'image');
    const rawUrl = String(action.config['url'] || action.config['mediaUrl'] || '');
    const url = this.interpolateVariables(rawUrl, ctx, run);
    const rawCaption = String(action.config['caption'] || '');
    const caption = this.interpolateVariables(rawCaption, ctx, run);

    // Normalize recipient / chatId to valid WhatsApp JID
    const rawRecipient = String(action.config['recipient'] || action.config['chatId'] || ctx.chatId || '');
    const targetChat = this.interpolateVariables(rawRecipient, ctx, run).trim();
    const cleanNumber = targetChat.replace(/[^0-9]/g, '');
    const normalizedChatId = targetChat.includes('@') ? targetChat : cleanNumber ? `${cleanNumber}@c.us` : ctx.chatId;

    if (!url) throw new Error('Send media action requires a media URL');
    if (ctx.metadata?.isTest || action.config['dryRun']) {
      return {
        sent: true,
        simulated: true,
        dryRun: true,
        messageId: `dry_run_media_${Date.now()}`,
        chatId: normalizedChatId,
        mediaType,
        url,
        caption,
      };
    }

    if (this.messageService && url) {
      try {
        let res: { messageId?: string } | undefined;
        if (mediaType === 'video') {
          res = await this.messageService.sendVideo(ctx.sessionId, {
            chatId: normalizedChatId,
            caption,
            url,
          });
        } else if (mediaType === 'document') {
          res = await this.messageService.sendDocument(ctx.sessionId, {
            chatId: normalizedChatId,
            caption,
            url,
            filename: String(action.config['filename'] || 'document.pdf'),
            mimetype: 'application/pdf',
          });
        } else {
          res = await this.messageService.sendImage(ctx.sessionId, {
            chatId: normalizedChatId,
            caption,
            url,
            mimetype: 'image/jpeg',
          });
        }
        return { sent: true, messageId: res?.messageId, chatId: normalizedChatId, mediaType, url, caption };
      } catch (err: any) {
        const errStr = String(err?.message || err);
        if (errStr.includes('Data passed to getter must include an id property')) {
          throw new Error(
            `WhatsApp Web media engine memoization failure for recipient ${normalizedChatId}. ` +
              `Ensure recipient number is a registered WhatsApp account and session is fully loaded. ` +
              `(${errStr})`,
          );
        }
        throw err;
      }
    }

    throw new Error('No messaging service available to send media');
  }

  private async actionSearchAgents(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const captured = (run?.triggerData?.['capturedVariables'] as Record<string, any>) || {};

    const answer = (...keys: string[]) =>
      keys.map(k => captured[k]).find(v => v !== undefined && v !== null && v !== '');
    const resolvedPin = this.configOrAnswer(
      action,
      'pincode',
      ctx,
      run,
      answer('pincode', 'residence_pincode', 'pin'),
    ).replace(/[^0-9]/g, '');
    const mainService = menuChoiceValue(
      this.configOrAnswer(action, 'mainService', ctx, run, answer('mainService', 'service')) || 'insurance',
    ).toLowerCase();
    const productCategory = menuChoiceValue(
      this.configOrAnswer(action, 'productCategory', ctx, run, answer('productCategory', 'category')),
    );
    const subProduct = menuChoiceValue(this.configOrAnswer(action, 'subProduct', ctx, run, answer('subProduct')));

    const limit = Number(action.config['limit'] || action.config['maxResults'] || 3);
    const sendDirectMessage = action.config['sendDirectMessage'] !== false;

    let agents: Agent[] = [];
    if (this.agentService) {
      agents = await this.agentService.findMatchingAgents(ctx.businessId, {
        pincode: resolvedPin,
        mainService,
        productCategory,
        subProduct,
        limit,
      });
    }

    const formattedCards = this.agentService
      ? this.agentService.formatAgentProfilesMessage(agents, resolvedPin || 'India')
      : `Found ${agents.length} advisors for pincode ${resolvedPin}.`;

    if (sendDirectMessage && ctx.sessionId && ctx.chatId) {
      if (ctx.metadata?.isTest || action.config['dryRun']) {
        this.logger.log(`Search agents (simulated dry-run): chat=${ctx.chatId} agents=${agents.length}`);
      } else if (this.messageService) {
        if (agents.length === 0) {
          await this.messageService.sendText(ctx.sessionId, {
            chatId: ctx.chatId,
            text: formattedCards,
          });
        } else {
          // 1. Send Header introduction
          const header = `📍 *Found ${agents.length} Verified Advisor(s) serving Pincode ${resolvedPin || 'your area'} (via PadosiAgent):*`;
          await this.messageService.sendText(ctx.sessionId, {
            chatId: ctx.chatId,
            text: header,
          });

          // 2. Send EACH advisor as a separate, beautifully structured card message
          const cards = this.agentService
            ? this.agentService.formatIndividualAgentCards(agents, resolvedPin || 'India')
            : [formattedCards];

          for (const card of cards) {
            await new Promise(r => setTimeout(r, 350));
            await this.messageService.sendText(ctx.sessionId, {
              chatId: ctx.chatId,
              text: card,
            });
          }

          // 3. Send guidance footer
          await new Promise(r => setTimeout(r, 250));
          await this.messageService.sendText(ctx.sessionId, {
            chatId: ctx.chatId,
            text: `👉 *Tip:* Tap on any advisor's *Call* or *WhatsApp* link above to speak directly.`,
          });
        }
      }
    }

    if (run?.triggerData) {
      const td = run.triggerData as Record<string, any>;
      if (!td.capturedVariables || typeof td.capturedVariables !== 'object') {
        td.capturedVariables = {};
      }
      td.capturedVariables.matchedAgentId = agents[0]?.id;
      td.capturedVariables.matchedAgentName = agents[0]?.name;
      td.capturedVariables.matchedAgentPhone = agents[0]?.phone;
    }

    return {
      agentsFound: agents.length > 0,
      count: agents.length,
      pincode: resolvedPin,
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        rating: a.rating,
        serviceArea: a.serviceArea,
        callLink: a.callLink,
        whatsappLink: a.whatsappLink,
      })),
      formattedCards,
      branch: agents.length > 0 ? 'agents_found' : 'no_agents_found',
    };
  }

  private async actionCreateLead(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const captured = (run?.triggerData?.['capturedVariables'] as Record<string, any>) || {};

    const field = (key: string, fallback = ''): string =>
      this.configOrAnswer(action, key, ctx, run, captured[key]) || fallback;

    const customerPhone = field('customerPhone', ctx.chatId?.replace(/@.*$/, '') || '');
    const mainService = menuChoiceValue(field('mainService', 'insurance'));
    const selectedService = menuChoiceValue(field('selectedService', 'General Enquiry'));
    const productCategory = menuChoiceValue(field('productCategory'));
    const subProduct = menuChoiceValue(field('subProduct'));
    const claimIssueType = menuChoiceValue(field('claimIssueType'));
    const insuranceCompany = field('insuranceCompany');
    const issueDescription = field('issueDescription');
    const pincode = (field('pincode') || String(captured['residence_pincode'] ?? '')).replace(/[^0-9]/g, '');

    let matchedAgent: Agent | undefined;
    const agentId = action.config['matchedAgentId'] || captured['matchedAgentId'];
    if (this.agentService && agentId) {
      const agents = await this.agentService.listAgents(ctx.businessId);
      matchedAgent = agents.find(a => a.id === agentId);
    }

    let lead: Lead | undefined;
    if (this.leadService) {
      lead = await this.leadService.createOrUpdateLead({
        businessId: ctx.businessId,
        sessionId: ctx.sessionId,
        chatId: ctx.chatId || `${customerPhone}@c.us`,
        customerPhone,
        customerName: (ctx.metadata?.['contactName'] as string) || (ctx.metadata?.['name'] as string),
        mainService,
        selectedService,
        productCategory: productCategory || undefined,
        subProduct: subProduct || undefined,
        claimIssueType: claimIssueType || undefined,
        insuranceCompany: insuranceCompany || undefined,
        issueDescription: issueDescription || undefined,
        pincode,
        matchedAgent,
        workflowId: run?.workflowId,
        conversationId: ctx.conversationId,
        metadata: {
          capturedVariables: captured,
          source: 'whatsapp_automation_flow',
        },
      });
    }

    const leadNumber = lead?.leadNumber || `LD-INS-${Math.floor(10000 + Math.random() * 90000)}`;

    return {
      leadCreated: true,
      leadId: lead?.id || `sim_${Date.now()}`,
      leadNumber,
      status: lead?.status || 'assigned',
      matchedAgentId: lead?.matchedAgentId || matchedAgent?.id,
      matchedAgentName: lead?.matchedAgentName || matchedAgent?.name,
      customerPhone,
      branch: 'lead_created',
    };
  }

  private async actionValidatePincode(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const captured = (run?.triggerData?.['capturedVariables'] as Record<string, any>) || {};
    // The configured value is a template; a captured answer or the message is customer text, used as is.
    const configured = action.config['pincode'];
    const rawPin =
      configured !== undefined && configured !== null && String(configured).trim() !== ''
        ? this.interpolateVariables(String(configured), ctx, run)
        : String(captured['pincode'] || captured['residence_pincode'] || ctx.messageBody || '');
    const pincode = rawPin.trim().replace(/\s/g, '');

    const isValid = /^[1-9][0-9]{5}$/.test(pincode);

    if (isValid && run?.triggerData) {
      const td = run.triggerData as Record<string, any>;
      if (!td.capturedVariables || typeof td.capturedVariables !== 'object') {
        td.capturedVariables = {};
      }
      td.capturedVariables.pincode = pincode;
      td.capturedVariables.residence_pincode = pincode;
    }

    return {
      isValid,
      pincode,
      branch: isValid ? 'pincode_valid' : 'invalid_pincode',
    };
  }

  private async executeGraphFromNode(
    workflow: WorkflowDefinition,
    run: WorkflowRun,
    ctx: TriggerContext,
    fromNodeId: string,
    outgoingHandle?: string,
    startNodeId?: string,
    startAttempt?: number,
  ): Promise<void> {
    const nodes = (workflow.definition.nodes || []) as VisualWorkflowNode[];
    const edges = (workflow.definition.edges || []) as VisualWorkflowEdge[];
    const steps: StepResult[] = (run.steps as StepResult[]) || [];

    const matchingEdge = startNodeId ? undefined : pickNextEdge(edges, fromNodeId, outgoingHandle);
    let currentNode = startNodeId
      ? nodes.find(n => n.id === startNodeId)
      : matchingEdge
        ? nodes.find(n => n.id === matchingEdge?.target)
        : undefined;

    // Guards a node cycle (A → B → A) from messaging the customer without end.
    const startedAt = Date.now();
    let nodesRun = 0;

    while (currentNode) {
      if (nodesRun >= workflow.maxActionsPerRun) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.FAILED, {
          steps,
          failureReason: `Action count limit exceeded (${workflow.maxActionsPerRun}) — check the workflow for a loop`,
        });
        return;
      }
      if ((Date.now() - startedAt) / 1000 > workflow.maxExecutionSeconds) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.TIMED_OUT, {
          steps,
          failureReason: `Execution time limit exceeded (${workflow.maxExecutionSeconds}s)`,
        });
        return;
      }
      nodesRun++;

      const action: WorkflowAction = {
        id: currentNode.id,
        type: currentNode.type as ActionType,
        config: currentNode.data?.config || {},
      };

      // Test runs answer the builder in one request, so they keep sleeping in memory.
      const durable = !ctx.metadata?.isTest;
      if (durable && action.type === ActionType.WAIT) {
        const seconds = waitSeconds(action.config);
        const at = new Date(Date.now() + seconds * 1000).toISOString();
        const output = { waited: seconds, resumeAt: at };
        steps.push({
          actionId: action.id,
          actionType: action.type,
          status: 'success',
          startedAt: new Date().toISOString(),
          completedAt: at,
          output,
        });
        this.recordStepOutput(run, action.id, output);
        await this.sleepRun(run, ctx, steps, { kind: 'wait', nodeId: action.id, at });
        return;
      }

      const step = await this.executeAction(action, ctx, workflow.maxRetries, run, {
        startAttempt: nodesRun === 1 ? startAttempt : undefined,
        deferRetries: durable,
      });
      steps.push(step);
      if (run) run.steps = steps;

      if (step.status === 'retrying' && step.retryAt) {
        await this.sleepRun(run, ctx, steps, {
          kind: 'retry',
          nodeId: action.id,
          attempt: (step.retryCount ?? 0) + 1,
          at: step.retryAt,
        });
        return;
      }

      if (step.status === 'failed') {
        await this.workflowService.updateRunStatus(run.id, RunStatus.FAILED, {
          steps,
          failureReason: `Node ${currentNode.id} failed: ${step.error}`,
        });
        return;
      }

      if (step.output?.['suspended']) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.PAUSED, { steps });
        return;
      }

      if (step.output?.['filtered']) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, {
          steps,
          failureReason: `Workflow filtered at node ${currentNode.id}: ${String(step.output?.['reason'] || 'Filter condition not met')}`,
        });
        return;
      }

      if (step.output?.['stopped']) {
        await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, {
          steps,
          failureReason: `Workflow terminated at node ${currentNode.id}: ${String(step.output?.['reason'] || 'Workflow stopped')}`,
        });
        return;
      }

      const nextEdge = pickNextEdge(edges, currentNode.id, step.output?.['branch'] as string | undefined);
      currentNode = nextEdge ? nodes.find(n => n.id === nextEdge?.target) : undefined;
    }

    await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, { steps });
  }

  private async actionScheduleFollowup(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!this.scheduledMessageRepo) throw new Error('Scheduled message repository not available');

    const delayMinutes = Number(action.config.delayMinutes ?? action.config.delay ?? 60);
    const message = this.interpolateVariables(String(action.config.message ?? ''), ctx, run);
    const chatId = this.interpolateVariables(String(action.config.chatId ?? ctx.chatId ?? ''), ctx, run);
    // Always the number this conversation is on: a configured session id could belong to another business.
    const sessionId = ctx.sessionId ?? '';
    const configuredSession = action.config.sessionId ? String(action.config.sessionId) : '';
    if (configuredSession && configuredSession !== sessionId) {
      throw new Error('A follow-up can only be scheduled from the number this conversation is on');
    }

    if (!chatId || !sessionId || !message) throw new Error('chatId, sessionId, and message are required');

    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    if (this.isDryRun(ctx, action)) {
      return { scheduled: true, simulated: true, dryRun: true, chatId, scheduledAt: scheduledAt.toISOString() };
    }

    const scheduled = this.scheduledMessageRepo.create({
      businessId: ctx.businessId,
      sessionId,
      chatId,
      content: message,
      scheduledAt,
      status: ScheduledMessageStatus.PENDING,
    });

    const saved = await this.scheduledMessageRepo.save(scheduled);
    this.logger.log(`Scheduled follow-up message ${saved.id} for ${chatId} at ${scheduledAt.toISOString()}`);

    return {
      status: 'scheduled',
      scheduledMessageId: saved.id,
      scheduledAt: scheduledAt.toISOString(),
      delayMinutes,
    };
  }

  private async actionSendContactVCard(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for send contact vCard');
    if (!ctx.chatId) throw new Error('No chat context for send contact vCard');

    const nameRaw = String(action.config['displayName'] || action.config['name'] || 'Advisor');
    const phoneRaw = String(action.config['phoneNumber'] || action.config['phone'] || action.config['number'] || '');
    const organization = this.interpolateVariables(String(action.config['organization'] || ''), ctx, run);
    const title = this.interpolateVariables(String(action.config['title'] || ''), ctx, run);

    const displayName = this.interpolateVariables(nameRaw, ctx, run);
    const phoneNumber = this.interpolateVariables(phoneRaw, ctx, run).replace(/[^0-9+]/g, '');

    const targetChat = this.interpolateVariables(String(action.config['chatId'] || ctx.chatId || ''), ctx, run).trim();
    const cleanNumber = targetChat.replace(/[^0-9]/g, '');
    const normalizedChatId = targetChat.includes('@') ? targetChat : cleanNumber ? `${cleanNumber}@c.us` : ctx.chatId;

    if (!phoneNumber) throw new Error('Send contact card action requires a phone number');
    if (ctx.metadata?.isTest || action.config['dryRun']) {
      return {
        sent: true,
        simulated: true,
        chatId: normalizedChatId,
        displayName,
        phoneNumber,
        organization,
        title,
      };
    }

    if (this.messageService) {
      const res = await this.messageService.sendContact(ctx.sessionId, {
        chatId: normalizedChatId,
        contactName: displayName,
        contactNumber: phoneNumber,
      });
      return {
        sent: true,
        messageId: res?.messageId,
        chatId: normalizedChatId,
        displayName,
        phoneNumber,
        organization,
        title,
      };
    }

    throw new Error('No messaging service available to send the contact card');
  }

  private async actionSendDocument(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for send document');
    if (!ctx.chatId) throw new Error('No chat context for send document');

    const rawUrl = String(action.config['documentUrl'] || action.config['url'] || '');
    const url = this.interpolateVariables(rawUrl, ctx, run);
    const rawFileName = String(action.config['fileName'] || action.config['filename'] || 'document.pdf');
    const fileName = this.interpolateVariables(rawFileName, ctx, run);
    const rawCaption = String(action.config['caption'] || '');
    const caption = this.interpolateVariables(rawCaption, ctx, run);

    const targetChat = this.interpolateVariables(String(action.config['chatId'] || ctx.chatId || ''), ctx, run).trim();
    const cleanNumber = targetChat.replace(/[^0-9]/g, '');
    const normalizedChatId = targetChat.includes('@') ? targetChat : cleanNumber ? `${cleanNumber}@c.us` : ctx.chatId;

    if (!url) throw new Error('Send document action requires a document URL');
    if (ctx.metadata?.isTest || action.config['dryRun']) {
      return { sent: true, simulated: true, chatId: normalizedChatId, fileName, url, caption };
    }

    if (this.messageService && url) {
      const res = await this.messageService.sendDocument(ctx.sessionId, {
        chatId: normalizedChatId,
        url,
        filename: fileName,
        caption,
        mimetype: 'application/pdf',
      });
      return { sent: true, messageId: res?.messageId, chatId: normalizedChatId, fileName, url, caption };
    }

    throw new Error('No messaging service available to send the document');
  }

  private async actionSendVoiceNote(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for send voice note');
    if (!ctx.chatId) throw new Error('No chat context for send voice note');

    const rawUrl = String(action.config['audioUrl'] || action.config['url'] || '');
    const url = this.interpolateVariables(rawUrl, ctx, run);

    const targetChat = this.interpolateVariables(String(action.config['chatId'] || ctx.chatId || ''), ctx, run).trim();
    const cleanNumber = targetChat.replace(/[^0-9]/g, '');
    const normalizedChatId = targetChat.includes('@') ? targetChat : cleanNumber ? `${cleanNumber}@c.us` : ctx.chatId;

    if (!url) throw new Error('Send voice note action requires an audio URL');
    if (ctx.metadata?.isTest || action.config['dryRun']) {
      return { sent: true, simulated: true, chatId: normalizedChatId, url, ptt: true };
    }

    if (this.messageService && url) {
      const res = await this.messageService.sendAudio(ctx.sessionId, {
        chatId: normalizedChatId,
        url,
        ptt: true,
      });
      return { sent: true, messageId: res?.messageId, chatId: normalizedChatId, url, ptt: true };
    }

    throw new Error('No messaging service available to send the voice note');
  }

  private async actionWorkingHoursGateway(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const tz = String(action.config['timezone'] || 'Asia/Kolkata');
    const openTime = String(action.config['openTime'] || '09:00');
    const closeTime = String(action.config['closeTime'] || '20:00');
    const rawWorkingDays = action.config['workingDays'];
    const workingDays: number[] = Array.isArray(rawWorkingDays) ? rawWorkingDays.map(Number) : [1, 2, 3, 4, 5, 6];

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const parts = formatter.formatToParts(now);
    const hour = parts.find(p => p.type === 'hour')?.value || '12';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const currentTimeStr = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

    const localDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const dayOfWeek = localDate.getDay();

    const isDayWorking = workingDays.includes(dayOfWeek);
    const isWithinHours = currentTimeStr >= openTime && currentTimeStr <= closeTime;
    const isOpen = isDayWorking && isWithinHours;

    const branch = isOpen ? 'open' : 'closed';
    return {
      branch,
      isOpen,
      currentTime: currentTimeStr,
      dayOfWeek,
      timezone: tz,
      openTime,
      closeTime,
    };
  }

  private async actionInternalAlert(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for internal alert');

    const rawRecipient = String(
      action.config['recipientPhone'] || action.config['managerPhone'] || action.config['phone'] || '',
    );
    const cleanPhone = this.interpolateVariables(rawRecipient, ctx, run).replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      return { alerted: false, reason: 'No recipient phone provided for internal alert' };
    }

    const alertChatId = `${cleanPhone}@c.us`;
    const defaultTemplate =
      '🚨 *NEW LEAD ALERT!*\n\n' +
      '👤 *Name:* {{trigger.contactName}}\n' +
      '📍 *Pincode:* {{vars.pincode}}\n' +
      '📱 *Phone:* {{trigger.phone}}\n' +
      '🕒 *Time:* {{time}}\n\n' +
      '👉 *Direct Call:* tel:{{trigger.phone}}\n' +
      '👉 *Chat on WhatsApp:* https://wa.me/{{trigger.phone}}';

    const rawMsg = String(action.config['templateMessage'] || action.config['message'] || defaultTemplate);
    const message = this.interpolateVariables(rawMsg, ctx, run);

    if (ctx.metadata?.isTest || action.config['dryRun']) {
      return { alerted: true, simulated: true, recipient: alertChatId, message };
    }

    if (this.messageService) {
      await this.messageService.sendText(ctx.sessionId, {
        chatId: alertChatId,
        text: message,
      });
      return { alerted: true, recipient: alertChatId, message };
    }

    throw new Error('No messaging service available to send the internal alert');
  }

  private async actionABTestSplit(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const splitRatio = Number(action.config['splitRatio'] ?? action.config['ratioA'] ?? 50);
    const seed = String(ctx.chatId || ctx.messageBody || Math.random());

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const score = Math.abs(hash) % 100;
    const isVariantA = score < splitRatio;
    const branch = isVariantA ? 'variant_a' : 'variant_b';

    return {
      branch,
      variant: isVariantA ? 'A' : 'B',
      score,
      splitRatio,
    };
  }

  private async actionDNDManager(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawText = (ctx.messageBody || '').toLowerCase().trim();
    const defaultKeywords = ['stop', 'unsubscribe', 'bandh', 'rad', 'રદ', 'બંધ', 'dnd'];
    const customKeywords = (action.config['keywords'] as string[]) || [];
    const allKeywords = [...defaultKeywords, ...customKeywords.map(k => k.toLowerCase().trim())];

    // Whole words only: a prefix test opted out every "Radhe…" because it starts with "rad".
    const isMatch = allKeywords.some(kw => kw && containsKeyword(rawText, kw));
    const forceOptOut = Boolean(action.config['forceOptOut']);

    if (isMatch || forceOptOut) {
      this.logger.log(`Opt-out / DND triggered for ${ctx.chatId}`);
      // Record the opt-out on the conversation so it outlives this run.
      if (!this.isDryRun(ctx, action)) {
        await this.actionAddTag({ ...action, config: { tag: DND_TAG } }, ctx).catch(err =>
          this.logger.warn(`Could not tag DND opt-out: ${err instanceof Error ? err.message : String(err)}`),
        );
      }

      if (action.config['sendConfirmation'] !== false && ctx.sessionId && ctx.chatId && !this.isDryRun(ctx, action)) {
        const confirmMsg = String(
          action.config['confirmationMessage'] ||
            'તમારી વિનંતી મુજબ સેવાઓ બંધ કરવામાં આવી છે. ફરી શરૂ કરવા માટે START લખીને મોકલો.',
        );
        if (this.messageService) {
          await this.messageService
            .sendText(ctx.sessionId, {
              chatId: ctx.chatId,
              text: confirmMsg,
            })
            .catch(() => undefined);
        }
      }

      return {
        stopped: true,
        reason: 'User opted out (DND)',
        optedOut: true,
      };
    }

    return { optedOut: false, stopped: false };
  }

  private async actionFinancialCalculator(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const mode = String(action.config['mode'] || 'SIP').toUpperCase();
    const rawAmt = String(
      action.config['monthlyInvestment'] || action.config['amount'] || action.config['principal'] || '5000',
    );
    const rawYears = String(action.config['durationYears'] || action.config['years'] || '15');
    const rawRate = String(
      action.config['expectedReturnRate'] || action.config['interestRate'] || action.config['rate'] || '13.5',
    );

    const P = Math.max(0, parseFloat(this.interpolateVariables(rawAmt, ctx, run).replace(/[^0-9.]/g, '')) || 5000);
    const years = Math.max(1, parseFloat(this.interpolateVariables(rawYears, ctx, run).replace(/[^0-9.]/g, '')) || 15);
    const rate = Math.max(
      0.1,
      parseFloat(this.interpolateVariables(rawRate, ctx, run).replace(/[^0-9.]/g, '')) || 13.5,
    );

    let investedAmount = 0;
    let futureValue = 0;
    let wealthGain = 0;
    let monthlyEmi = 0;

    const formatRupees = (num: number) => {
      return '₹' + Math.round(num).toLocaleString('en-IN');
    };

    if (mode === 'SIP') {
      const months = years * 12;
      const monthlyRate = rate / 12 / 100;
      investedAmount = P * months;
      futureValue = P * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
      wealthGain = futureValue - investedAmount;
    } else if (mode === 'LOAN_EMI') {
      const months = years * 12;
      const monthlyRate = rate / 12 / 100;
      investedAmount = P;
      const emiFactor = Math.pow(1 + monthlyRate, months);
      monthlyEmi = (P * monthlyRate * emiFactor) / (emiFactor - 1);
      futureValue = monthlyEmi * months;
      wealthGain = futureValue - P;
    } else {
      investedAmount = P;
      futureValue = P * Math.pow(1 + rate / 100, years);
      wealthGain = futureValue - investedAmount;
    }

    return {
      mode,
      investedAmount: Math.round(investedAmount),
      futureValue: Math.round(futureValue),
      wealthGain: Math.round(wealthGain),
      monthlyEmi: Math.round(monthlyEmi),
      formattedInvested: formatRupees(investedAmount),
      formattedFutureValue: formatRupees(futureValue),
      formattedWealthGain: formatRupees(wealthGain),
      formattedMonthlyEmi: formatRupees(monthlyEmi),
      rate,
      years,
      monthlyAmount: P,
    };
  }

  private async actionPaymentLink(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for payment link');
    if (!ctx.chatId) throw new Error('No chat context for payment link');

    const provider = String(action.config['provider'] || 'UPI').toUpperCase();
    // Money goes to whatever payee and amount this node names, so neither may be guessed.
    const payeeVpa = String(action.config['payeeVpa'] || '').trim();
    if (!payeeVpa) throw new Error('Payment link action requires payeeVpa (the UPI ID that receives the money)');
    const rawAmount = String(action.config['amount'] || action.config['amountInRupees'] || '');
    const amount = parseFloat(this.interpolateVariables(rawAmount, ctx, run).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment link action requires a positive amount');
    const rawDesc = String(action.config['description'] || 'Expert Policy Audit & Consultation');
    const description = this.interpolateVariables(rawDesc, ctx, run);

    const payeeName = String(action.config['payeeName'] || 'PadosiAgent Consultation');
    const txnId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const upiLink = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(description)}`;

    const paymentUrl = action.config['razorpayUrl']
      ? this.interpolateVariables(String(action.config['razorpayUrl']), ctx, run, undefined, encodeURIComponent)
      : null;

    const defaultMsg =
      `💳 *ઓનલાઇન કન્સલ્ટેશન પેમેન્ટ*\n\n` +
      `📋 *વિગત:* ${description}\n` +
      `💰 *રકમ:* ₹${amount}\n\n` +
      `👇 *UPI એપ (GPay / PhonePe / Paytm) થી ચૂકવવા માટે:* \n` +
      `${upiLink}\n\n` +
      (paymentUrl ? `🌐 *ક્રેડિટ / ડેબિટ કાર્ડ અથવા નેટબેંકિંગ માટે:* \n${paymentUrl}\n\n` : '') +
      `_પેમેન્ટ સફળ થયા પછી તુરંત તમને રસીદ મોકલવામાં આવશે._`;

    const rawMessage = String(action.config['message'] || defaultMsg);
    const message = this.interpolateVariables(rawMessage, ctx, run);

    if (action.config['sendToChat'] !== false && this.messageService && !ctx.metadata?.isTest) {
      await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text: message,
      });
    }

    return {
      provider,
      amount,
      description,
      txnId,
      upiLink,
      paymentUrl,
      payeeVpa,
    };
  }

  private async actionAiDocumentOCR(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawUrl = String(action.config['imageUrl'] || action.config['url'] || '');
    const imageUrl = this.interpolateVariables(rawUrl, ctx, run);
    const docType = String(action.config['documentType'] || 'AUTO').toUpperCase();

    // No OCR provider is wired in, so the image is not read: numbers are only picked out of the text
    // the customer typed. Anything not found stays null — this node must never invent policy data.
    const text = ctx.messageBody || '';
    const vehicleMatch = /([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4})/i.exec(text);
    const policyMatch = /(OG-[0-9-]+|[0-9]{10,16})/i.exec(text);

    return {
      documentType: docType,
      source: 'message_text',
      ocr: false,
      policyNumber: policyMatch ? policyMatch[0] : null,
      vehicleNumber: vehicleMatch ? vehicleMatch[0].toUpperCase() : null,
      insuredName: (ctx.metadata?.['contactName'] as string) || null,
      insurerName: null,
      expiryDate: null,
      isValid: Boolean(policyMatch || vehicleMatch),
      imageUrl,
    };
  }

  private async actionDynamicPDFGenerator(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawTitle = String(action.config['title'] || 'PadosiAgent Advisor Comparison & Quotation');
    const title = this.interpolateVariables(rawTitle, ctx, run);
    // Nothing here renders a PDF; the node sends a document hosted elsewhere, so it must be given one
    // (it used to send a link to a file that was never created).
    const configuredUrl = String(action.config['pdfUrl'] || '').trim();
    if (!configuredUrl) throw new Error('PDF node requires pdfUrl: a link to an already generated PDF');
    const pdfUrl = this.interpolateVariables(configuredUrl, ctx, run, undefined, encodeURIComponent);
    const fileName = String(action.config['fileName'] || `Quotation_${Date.now()}.pdf`);
    const caption = `📄 *${title}*\nતમારા વિસ્તારના શ્રેષ્ઠ એડવાઈઝર્સની સરખામણી સ્લિપ.`;

    if (
      action.config['autoSend'] === true &&
      ctx.sessionId &&
      ctx.chatId &&
      this.messageService &&
      !this.isDryRun(ctx, action)
    ) {
      await this.messageService.sendDocument(ctx.sessionId, {
        chatId: ctx.chatId,
        url: pdfUrl,
        filename: fileName,
        caption,
        mimetype: 'application/pdf',
      });
    }

    return {
      pdfUrl,
      fileName,
      caption,
      title,
    };
  }

  private async actionSendCarouselTemplate(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for carousel template');
    if (!ctx.chatId) throw new Error('No chat context for carousel template');

    const cards = (action.config['cards'] as Array<Record<string, any>>) || [];
    const targetChat = this.interpolateVariables(String(action.config['chatId'] || ctx.chatId || ''), ctx, run).trim();
    const cleanNumber = targetChat.replace(/[^0-9]/g, '');
    const normalizedChatId = targetChat.includes('@') ? targetChat : cleanNumber ? `${cleanNumber}@c.us` : ctx.chatId;

    if (ctx.metadata?.isTest || action.config['dryRun']) {
      return { sent: true, simulated: true, cardCount: cards.length, chatId: normalizedChatId };
    }

    if (this.messageService) {
      const engine = (this.messageService as any).getEngine?.(ctx.sessionId);
      if (engine && typeof (engine as any).sendCarouselMessage === 'function') {
        const res = await (engine as any).sendCarouselMessage(normalizedChatId, cards);
        return { sent: true, native: true, cardCount: cards.length, messageId: res?.messageId };
      }

      for (const [idx, card] of cards.entries()) {
        const title = this.interpolateVariables(String(card.title || `Advisor #${idx + 1}`), ctx, run);
        const desc = this.interpolateVariables(String(card.description || ''), ctx, run);
        const phone = this.interpolateVariables(String(card.phone || card.phoneNumber || ''), ctx, run).replace(
          /[^0-9]/g,
          '',
        );

        let cardText =
          `╭───────────────────────────────╮\n` +
          `│ 🎴 *${title}*\n` +
          `├───────────────────────────────┤\n` +
          `│ ${desc.split('\n').join('\n│ ')}\n`;
        if (phone) {
          cardText +=
            `├───────────────────────────────┤\n` +
            `│ 📞 *Call:* tel:+${phone}\n` +
            `│ 💬 *WhatsApp:* https://wa.me/${phone}\n`;
        }
        cardText += `╰───────────────────────────────╯`;

        if (card.imageUrl) {
          await this.messageService
            .sendImage(ctx.sessionId, {
              chatId: normalizedChatId,
              url: this.interpolateVariables(String(card.imageUrl), ctx, run),
              caption: cardText,
              mimetype: 'image/jpeg',
            })
            .catch(async () => {
              await this.messageService!.sendText(ctx.sessionId!, { chatId: normalizedChatId, text: cardText });
            });
        } else {
          await this.messageService.sendText(ctx.sessionId, {
            chatId: normalizedChatId,
            text: cardText,
          });
        }
        await this.delay(350);
      }

      return { sent: true, fallbackCards: true, cardCount: cards.length, chatId: normalizedChatId };
    }

    throw new Error('No messaging service available to send carousel cards');
  }

  private async actionInteractiveCTATemplate(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!ctx.sessionId) throw new Error('No session context for CTA template');
    if (!ctx.chatId) throw new Error('No chat context for CTA template');

    const body = this.interpolateVariables(String(action.config['body'] || action.config['message'] || ''), ctx, run);
    const callPhone = this.interpolateVariables(String(action.config['callPhone'] || ''), ctx, run).replace(
      /[^0-9]/g,
      '',
    );
    const callLabel = String(action.config['callLabel'] || 'Call Advisor');
    const websiteUrl = this.interpolateVariables(
      String(action.config['websiteUrl'] || action.config['url'] || ''),
      ctx,
      run,
    );
    const urlLabel = String(action.config['urlLabel'] || 'Visit Website');

    let text = body;
    if (callPhone || websiteUrl) {
      text += '\n\n━━━━━━━━━━━━━━━━━━━━';
      if (callPhone) text += `\n📞 *${callLabel}:* tel:+${callPhone}`;
      if (websiteUrl) text += `\n🌐 *${urlLabel}:* ${websiteUrl}`;
    }

    if (this.messageService && !ctx.metadata?.isTest) {
      await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text,
      });
    }

    return { sent: true, body, callPhone, websiteUrl };
  }

  private async actionDynamicLanguageSwitcher(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawMsg = (ctx.messageBody || '').toLowerCase();
    const captured = (run?.triggerData?.['capturedVariables'] as Record<string, any>) || {};
    const prefLang = captured['language'] || captured['lang'] || action.config['defaultLanguage'] || 'gu';

    let resolved = prefLang;
    if (rawMsg.includes('gujarati') || rawMsg.includes('ગુજરાતી') || rawMsg === '1' || rawMsg === 'gu') {
      resolved = 'gu';
    } else if (rawMsg.includes('hindi') || rawMsg.includes('हिन्दी') || rawMsg === '2' || rawMsg === 'hi') {
      resolved = 'hi';
    } else if (rawMsg.includes('english') || rawMsg === '3' || rawMsg === 'en') {
      resolved = 'en';
    }

    return {
      branch: resolved,
      language: resolved,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    });
  }
}
