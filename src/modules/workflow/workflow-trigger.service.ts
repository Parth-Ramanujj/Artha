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

@Injectable()
export class WorkflowTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('WorkflowTrigger');
  private readonly hookIds: string[] = [];

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
        if (outcome !== 'restart') return;
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
    if (conv?.assignedTo || conv?.tags?.includes(SALES_AGENT_TAG)) return;

    // A business agent whose keyword (or chat) this is answers instead of the general assistant, never both.
    const agentOutcome = this.aiAgents ? await this.aiAgents.autoReply(sessionId, businessId, msg) : 'skipped';
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

  private buildIdempotencyKey(workflowId: string, messageId: string | undefined, sessionId: string): string {
    const raw = `${workflowId}:${sessionId}:${messageId ?? 'unknown'}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 64);
  }
}
