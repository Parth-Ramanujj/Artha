import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookManager } from '../../core/hooks';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { TriggerType } from './entities/workflow-definition.entity';
import { Session } from '../session/entities/session.entity';
import { createLogger } from '../../common/services/logger.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { createHash } from 'crypto';
import { BusinessService } from '../business/business.service';
import { ConversationService } from '../conversation/conversation.service';
import { Optional } from '@nestjs/common';

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
  ) {}

  onModuleInit(): void {
    this.hookIds.push(
      this.hookManager.register(
        'workflow-trigger',
        'message:received',
        hookCtx => {
          const msg = hookCtx.data as IncomingMessage;
          if (!hookCtx.sessionId || msg.fromMe) {
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

    // 1. Check if there is an active paused run waiting for user input in this chat
    const activePausedRun = await this.workflowService.findActivePausedRun(businessId, msg.chatId);
    if (activePausedRun) {
      try {
        const pausedWf = await this.workflowService.findOne(activePausedRun.workflowId, businessId);
        if (pausedWf) {
          const ctx: TriggerContext = {
            businessId,
            sessionId,
            chatId: msg.chatId,
            messageBody: msg.body,
            messageType: msg.type,
            metadata: {
              from: msg.from,
              to: msg.to,
              messageId: msg.id,
              timestamp: msg.timestamp,
            },
          };
          await this.executor.resume(pausedWf, activePausedRun, ctx, msg.body || '');
          return;
        }
      } catch (err) {
        this.logger.error(
          `Failed to resume paused workflow: ${activePausedRun.id}`,
          err instanceof Error ? err.message : String(err),
        );
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

    const allWorkflows = [...messageReceivedWorkflows, ...keywordMatchWorkflows];
    if (allWorkflows.length === 0) return;

    let conversationId: string | undefined;
    let conversationStatus: string | undefined;
    let assignedTo: string | undefined;
    let contactTags: string[] = [];
    const contactName = msg.contact?.pushName || msg.contact?.name;

    if (this.conversationService) {
      try {
        const conv = await this.conversationService.getOrCreateConversation(
          businessId,
          sessionId,
          msg.chatId,
          contactName,
        );
        conversationId = conv?.id;
        conversationStatus = conv?.status;
        assignedTo = conv?.assignedTo || undefined;
        contactTags = conv?.tags || [];
      } catch {
        // conversation creation is non-blocking
      }
    }

    const ctx: TriggerContext = {
      businessId,
      sessionId,
      chatId: msg.chatId,
      conversationId,
      conversationStatus,
      assignedTo,
      contactTags,
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

    for (const workflow of allWorkflows) {
      // Early check for keyword match workflows
      if (workflow.definition.trigger.type === TriggerType.KEYWORD_MATCH) {
        const kw = String(workflow.definition.trigger.config?.['keyword'] ?? '').trim();
        if (kw) {
          const body = (msg.body ?? '').toLowerCase().trim();
          const keywords = kw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
          if (keywords.length > 0 && !keywords.some(k => body.includes(k))) {
            continue;
          }
        }
      }

      const idempotencyKey = this.buildIdempotencyKey(workflow.id, msg.id, sessionId);

      const run = await this.workflowService.createRun(workflow, ctx.metadata ?? {}, sessionId, idempotencyKey);
      if (!run) continue;

      void this.executor
        .execute(workflow, run, ctx)
        .catch(err =>
          this.logger.error(
            `Workflow execution failed: workflow=${workflow.id} run=${run.id}`,
            err instanceof Error ? err.message : String(err),
          ),
        );
    }
  }

  private buildIdempotencyKey(workflowId: string, messageId: string | undefined, sessionId: string): string {
    const raw = `${workflowId}:${sessionId}:${messageId ?? 'unknown'}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 64);
  }
}
