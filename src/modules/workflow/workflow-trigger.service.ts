import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookManager } from '../../core/hooks';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { TriggerType, WorkflowDefinition } from './entities/workflow-definition.entity';
import { RunStatus } from './entities/workflow-run.entity';
import { Session } from '../session/entities/session.entity';
import { createLogger } from '../../common/services/logger.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { createHash } from 'crypto';
import { BusinessService } from '../business/business.service';
import { ConversationService } from '../conversation/conversation.service';
import { Conversation, ConversationStatus } from '../conversation/entities/conversation.entity';
import { AiService } from '../ai/ai.service';
import { AiAgentService } from '../ai/ai-agent.service';
import { Optional } from '@nestjs/common';
import { isFreshPersonalMessage, WORKFLOW_MAX_MESSAGE_AGE_MS } from './inbound-message-filter';
import { DND_TAG, hasDndTag, isOptInMessage } from '../conversation/dnd';
import { SALES_AGENT_TAG } from '../sales-agent/sales-rules';
import { WhatsAppLogsService, type EventLevel } from '../whatsapp-logs/whatsapp-logs.service';

/** Messages already answered, so a repeat of the same message gets no second reply. */
const SEEN_MAX = 5000;

@Injectable()
export class WorkflowTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('WorkflowTrigger');
  private readonly hookIds: string[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly hookManager: HookManager,
    private readonly workflowService: WorkflowService,
    private readonly executor: WorkflowExecutor,
    @InjectRepository(Session, 'data')
    private readonly sessionRepo: Repository<Session>,
    private readonly businessService: BusinessService,
    @Optional()
    private readonly conversationService?: ConversationService,
    @Optional()
    private readonly aiService?: AiService,
    @Optional()
    private readonly aiAgents?: AiAgentService,
    @Optional()
    private readonly logs?: WhatsAppLogsService,
  ) {}

  onModuleInit(): void {
    this.hookIds.push(
      this.hookManager.register(
        'workflow-trigger',
        'message:received',
        hookCtx => {
          const msg = hookCtx.data as IncomingMessage;
          if (!hookCtx.sessionId || !isFreshPersonalMessage(msg, WORKFLOW_MAX_MESSAGE_AGE_MS)) {
            return Promise.resolve({ continue: true });
          }

          // Meta re-sends a webhook it thinks we missed (e.g. while the server was waking up), and a
          // number connected twice delivers each message to both sessions: answer each message once.
          if (!this.firstTime(msg)) {
            this.note(
              hookCtx.sessionId,
              msg,
              'automation.duplicate',
              'warning',
              'The same message arrived again (Meta re-sent it, or this number is connected twice); it was not answered again.',
            );
            return Promise.resolve({ continue: true });
          }
          void this.handleMessageTrigger(hookCtx.sessionId, msg).catch(err =>
            this.logger.error('Workflow trigger error', err instanceof Error ? err.message : String(err)),
          );
          return Promise.resolve({ continue: true });
        },
        900,
      ),
    );

    this.logger.log('Workflow triggers registered');
  }

  onModuleDestroy(): void {
    for (const id of this.hookIds) {
      this.hookManager.unregister(id);
    }
  }

  /**
   * Runs workflows for an Instagram / Facebook DM: answers a waiting question first, otherwise starts the
   * first matching published "message received" / "keyword" workflow. Returns true when a workflow took
   * the message, so the caller's own auto-reply stays quiet. WhatsApp messages never come through here.
   */
  async handleSocialMessage(input: {
    businessId: string;
    accountId: string;
    chatId: string;
    text: string;
    messageId: string;
    contactName?: string;
    channel: 'instagram' | 'facebook' | 'telegram' | 'youtube' | 'x';
  }): Promise<boolean> {
    const { businessId, accountId, chatId } = input;
    const ctx: TriggerContext = {
      businessId,
      sessionId: accountId,
      chatId,
      contactTags: [],
      messageBody: input.text,
      messageType: 'text',
      metadata: {
        contactName: input.contactName,
        name: input.contactName,
        channel: input.channel,
        messageId: input.messageId,
      },
    };

    const paused = await this.workflowService.findActivePausedRun(businessId, accountId, chatId);
    if (paused) {
      const wf = await this.workflowService.findOne(paused.workflowId, businessId).catch(() => null);
      if (!wf) {
        await this.workflowService.updateRunStatus(paused.id, RunStatus.FAILED, {
          failureReason: 'Workflow no longer exists',
        });
      } else {
        const outcome = await this.executor.resume(wf, paused, ctx, input.text, {
          id: input.messageId,
          timestamp: Date.now(),
        });
        if (outcome !== 'restart') return true;
      }
    }

    const workflows = [
      ...(await this.workflowService.getPublishedWorkflowsForTrigger(businessId, TriggerType.KEYWORD_MATCH)),
      ...(await this.workflowService.getPublishedWorkflowsForTrigger(businessId, TriggerType.MESSAGE_RECEIVED)),
    ];
    for (const workflow of workflows) {
      const def = workflow.definition;
      if (
        !this.executor.evaluateTrigger(def.trigger, ctx) ||
        !this.executor.evaluateConditions(def.conditions ?? [], ctx)
      ) {
        continue;
      }
      const run = await this.workflowService.createRun(
        workflow,
        { ...(ctx.metadata ?? {}), messageBody: input.text.slice(0, 500) },
        accountId,
        this.buildIdempotencyKey(workflow.id, input.messageId, accountId),
        chatId,
      );
      if (run) {
        void this.executor
          .execute(workflow, run, ctx)
          .catch(err =>
            this.logger.error(
              `Workflow execution failed: workflow=${workflow.id} run=${run.id}`,
              err instanceof Error ? err.message : String(err),
            ),
          );
      }
      return true;
    }
    return false;
  }

  private async handleMessageTrigger(sessionId: string, msg: IncomingMessage): Promise<void> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: { id: true, businessId: true },
    });
    const businessId = session?.businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;

    const contactName = msg.contact?.pushName || msg.contact?.name;
    let conv: Conversation | null = null;
    if (this.conversationService) {
      try {
        conv = await this.conversationService.getOrCreateConversation(businessId, sessionId, msg.chatId, contactName);
      } catch {
        // conversation creation is non-blocking
      }
    }

    // The opt-out confirmation tells the customer to send START to resume; honour it here so campaigns
    // and follow-ups reach them again.
    if (conv && this.conversationService && hasDndTag(conv.tags) && isOptInMessage(msg.body)) {
      try {
        const tags = (conv.tags ?? []).filter(t => t !== DND_TAG);
        conv = await this.conversationService.updateConversation(conv.id, businessId, { tags });
        this.logger.log(`Opt-in: removed DND for ${msg.chatId}`);
      } catch (err) {
        this.logger.warn(`Could not clear DND for ${msg.chatId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Shared by a resumed run and a new one, so tags, assignment, handoff and {{name}} keep working
    // after the first question.
    const ctx: TriggerContext = {
      businessId,
      sessionId,
      chatId: msg.chatId,
      conversationId: conv?.id,
      conversationStatus: conv?.status,
      assignedTo: conv?.assignedTo || undefined,
      contactTags: conv?.tags || [],
      messageBody: msg.body,
      messageType: msg.type,
      metadata: {
        from: msg.from,
        to: msg.to,
        messageId: msg.id,
        timestamp: msg.timestamp,
        contactName,
        name: contactName,
      },
    };

    // 1. A run in this chat waiting for the customer's answer gets the message first.
    const activePausedRun = await this.workflowService.findActivePausedRun(businessId, sessionId, msg.chatId);
    if (activePausedRun) {
      let pausedWf: WorkflowDefinition | null = null;
      try {
        pausedWf = await this.workflowService.findOne(activePausedRun.workflowId, businessId);
      } catch (err) {
        // The workflow was deleted while the customer was answering; close the orphan and start fresh.
        this.logger.error(
          `Failed to load workflow for paused run ${activePausedRun.id}`,
          err instanceof Error ? err.message : String(err),
        );
        await this.workflowService.updateRunStatus(activePausedRun.id, RunStatus.FAILED, {
          failureReason: 'Workflow no longer exists',
        });
      }
      if (pausedWf) {
        const outcome = await this.executor.resume(pausedWf, activePausedRun, ctx, msg.body || '', {
          id: msg.id,
          timestamp: msg.timestamp,
          flowReply: msg.flowReply,
        });
        // 'restart' ("menu", "hi"…) ended the wait; let the message start workflows like a new chat.
        if (outcome !== 'restart') {
          this.note(
            sessionId,
            msg,
            'automation.handled',
            'info',
            `The waiting workflow “${pausedWf.name}” took this message as its answer.`,
          );
          return;
        }
      }
    }

    const messageReceivedWorkflows = await this.workflowService.getPublishedWorkflowsForTrigger(
      businessId,
      TriggerType.MESSAGE_RECEIVED,
    );
    const keywordMatchWorkflows = await this.workflowService.getPublishedWorkflowsForTrigger(
      businessId,
      TriggerType.KEYWORD_MATCH,
    );
    // A keyword workflow is the more specific match, so it is tried before catch-all ones.
    const allWorkflows = [...keywordMatchWorkflows, ...messageReceivedWorkflows];

    let matched = 0;
    for (const workflow of allWorkflows) {
      // The same checks execute() makes, made up front: no run for a workflow that would not act, and
      // the AI assistant only answers when no workflow claims the message.
      const def = workflow.definition;
      if (
        !this.executor.evaluateTrigger(def.trigger, ctx) ||
        !this.executor.evaluateConditions(def.conditions ?? [], ctx)
      ) {
        continue;
      }
      matched++;

      const idempotencyKey = this.buildIdempotencyKey(workflow.id, msg.id, sessionId);

      const run = await this.workflowService.createRun(
        workflow,
        // the message text makes a run findable in Execution History ("who wrote report?")
        { ...(ctx.metadata ?? {}), messageBody: (ctx.messageBody ?? '').slice(0, 500) },
        sessionId,
        idempotencyKey,
        msg.chatId,
      );
      if (run) {
        void this.executor
          .execute(workflow, run, ctx)
          .catch(err =>
            this.logger.error(
              `Workflow execution failed: workflow=${workflow.id} run=${run.id}`,
              err instanceof Error ? err.message : String(err),
            ),
          );
      }
      // One workflow per message: two matching flows would each greet the customer and leave two
      // waiting runs in one chat.
      this.note(
        sessionId,
        msg,
        'automation.handled',
        'info',
        `Workflow “${workflow.name}” answered this message (AI stays quiet when a workflow matches).`,
      );
      break;
    }

    if (matched === 0) await this.replyWithAi(sessionId, businessId, msg, conv);
  }

  private async replyWithAi(
    sessionId: string,
    businessId: string,
    msg: IncomingMessage,
    conv: Conversation | null,
  ): Promise<void> {
    if (!this.aiService) return;
    // Once a person owns the chat the assistant must not talk over them; the same for the sales agent's prospects.
    if (conv?.assignedTo || conv?.tags?.includes(SALES_AGENT_TAG)) {
      this.note(
        sessionId,
        msg,
        'ai.skipped',
        'warning',
        conv.assignedTo
          ? 'AI did not reply: this chat is assigned to a person (unassign it in Shared Inbox to let AI answer).'
          : 'AI did not reply: this chat belongs to the Sales Agent.',
      );
      return;
    }

    // A business agent whose keyword (or chat) this is answers instead of the general assistant, never both.
    const agentOutcome = this.aiAgents ? await this.aiAgents.autoReply(sessionId, businessId, msg) : 'skipped';
    if (agentOutcome !== 'skipped') {
      const failed = agentOutcome === 'failed';
      this.note(
        sessionId,
        msg,
        failed ? 'ai.failed' : 'ai.replied',
        failed ? 'error' : 'success',
        failed
          ? 'An AI agent (AI Agents page) took this message but could not answer — check its model / webhook there.'
          : 'An AI agent (AI Agents page) answered this message.',
      );
    }
    const outcome =
      agentOutcome === 'skipped' ? await this.aiService.autoReply(sessionId, businessId, msg) : agentOutcome;
    if (
      (outcome === 'handoff' || outcome === 'failed') &&
      conv &&
      this.conversationService &&
      conv.status !== ConversationStatus.PENDING
    ) {
      await this.conversationService.updateConversation(conv.id, businessId, { status: ConversationStatus.PENDING });
    }
  }

  /** True the first time a message (by chat + id) is seen; ids without a value are always new. */
  private firstTime(msg: IncomingMessage): boolean {
    if (!msg.id) return true;
    const key = `${msg.chatId}:${msg.id}`;
    if (this.seen.has(key)) return false;
    // shortcut: memory only, so it covers one server; two servers on the same number still both reply.
    if (this.seen.size >= SEEN_MAX) this.seen.delete(this.seen.values().next().value as string);
    this.seen.add(key);
    return true;
  }

  /** Why a customer message got (or did not get) an automatic answer, for Message Logs. */
  private note(sessionId: string, msg: IncomingMessage, kind: string, level: EventLevel, summary: string) {
    this.logs?.record({
      sessionId,
      kind,
      level,
      phone: msg.chatId.replace(/@.*$/, ''),
      summary: summary.slice(0, 300),
    });
  }

  private buildIdempotencyKey(workflowId: string, messageId: string | undefined, sessionId: string): string {
    const raw = `${workflowId}:${sessionId}:${messageId ?? 'unknown'}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 64);
  }
}
