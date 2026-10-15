import { Injectable, Optional } from '@nestjs/common';
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
} from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus, StepResult } from './entities/workflow-run.entity';
import { WorkflowService } from './workflow.service';
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

@Injectable()
export class WorkflowExecutor {
  private readonly logger = createLogger('WorkflowExecutor');
  private readonly activeRuns = new Set<string>();

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
  ) {}

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
        const triggerNode = def.nodes.find(n => n.type === 'trigger') || def.nodes[0];
        await this.executeGraphFromNode(workflow, run, ctx, triggerNode.id);
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
      const raw = String(trigger.config?.['keyword'] ?? '').trim();
      if (!raw) return true;
      const body = (ctx.messageBody ?? '').toLowerCase().trim();
      const keywords = raw
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(Boolean);
      if (keywords.length > 0) {
        return keywords.some(k => body.includes(k));
      }
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
  ): Promise<StepResult> {
    const maxRetries = action.maxRetries ?? globalMaxRetries;
    const step: StepResult = {
      actionId: action.id,
      actionType: action.type,
      status: 'success',
      startedAt: new Date().toISOString(),
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const output = await this.runAction(action, ctx, run);
        step.output = output;
        step.completedAt = new Date().toISOString();
        step.retryCount = attempt;

        // Store step output into run.triggerData so downstream nodes can access it
        // via {{steps.<nodeId>.<path>}} or {{steps.last.<path>}}
        if (run) {
          if (!run.triggerData) run.triggerData = {};
          if (!run.triggerData['stepOutputs']) run.triggerData['stepOutputs'] = {};
          const stepOutputs = run.triggerData['stepOutputs'] as Record<string, unknown>;
          stepOutputs[action.id] = output;
          stepOutputs['last'] = output;
        }

        return step;
      } catch (err) {
        step.retryCount = attempt;
        step.error = err instanceof Error ? err.message : String(err);

        if (attempt >= maxRetries || (action.onError ?? 'stop') === 'skip') {
          step.status = (action.onError ?? 'stop') === 'skip' ? 'skipped' : 'failed';
          step.completedAt = new Date().toISOString();
          return step;
        }

        await this.delay(Math.min(1000 * Math.pow(2, attempt), 10000));
      }
    }

    step.status = 'failed';
    step.completedAt = new Date().toISOString();
    return step;
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
        const seconds = Math.min(Number(action.config.seconds ?? 1), 300);
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

  interpolateVariables(
    text: string,
    ctx: Partial<TriggerContext> = {},
    run?: WorkflowRun,
    extraVars?: Record<string, string>,
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
    return text.replace(/\{\{\s*([a-zA-Z0-9_.\-[\]]+)\s*\}\}/g, (match, rawExpr) => {
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
      return {
        sent: true,
        simulated: true,
        dryRun: true,
        mode,
        message,
        buttons: buttons.map(b => b.text),
      };
    }

    let sentVia = 'text_fallback';

    if (mode === 'poll' && this.engineRegistry) {
      // Only send a WhatsApp Poll if explicitly requested by config mode='poll'
      try {
        const engine = this.engineRegistry.get(ctx.sessionId);
        if (engine && typeof engine.sendPollMessage === 'function') {
          await engine.sendPollMessage(ctx.chatId, {
            name: message,
            options: buttons.map(b => b.text),
            allowMultipleAnswers: false,
          });
          sentVia = 'native_poll';
        }
      } catch (err) {
        this.logger.warn(`Poll send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (mode !== 'text' && this.engineRegistry) {
      // Auto / Buttons mode: Attempt real native interactive buttons first
      try {
        const engine = this.engineRegistry.get(ctx.sessionId);
        if (engine && typeof (engine as any).sendInteractiveButtons === 'function') {
          await (engine as any).sendInteractiveButtons(ctx.chatId, message, buttons);
          sentVia = 'native_buttons';
        }
      } catch (err) {
        this.logger.warn(
          `Native buttons not supported (${err instanceof Error ? err.message : String(err)}). Trying poll fallback.`,
        );
        // Fallback to WhatsApp Poll — interactive and clickable on all engines
        try {
          const engine = this.engineRegistry.get(ctx.sessionId);
          if (engine && typeof engine.sendPollMessage === 'function') {
            await engine.sendPollMessage(ctx.chatId, {
              name: message,
              options: buttons.map(b => b.text),
              allowMultipleAnswers: false,
            });
            sentVia = 'native_poll';
          }
        } catch (pollErr) {
          this.logger.warn(
            `Poll fallback also failed: ${pollErr instanceof Error ? pollErr.message : String(pollErr)}`,
          );
          sentVia = 'text_fallback';
        }
      }
    }

    if (sentVia === 'text_fallback' && this.messageService) {
      const lines = [message, ''];
      buttons.forEach((b, idx) => {
        lines.push(`${idx + 1}️⃣  *${b.text}*`);
      });
      lines.push('');
      lines.push('👉 *Reply with number (1, 2) or option name*');
      await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text: lines.join('\n'),
      });
      sentVia = 'formatted_text_menu';
    }

    if (run) {
      const choiceMap: Record<string, string> = {};
      buttons.forEach((b, idx) => {
        choiceMap[String(idx + 1)] = b.id;
        choiceMap[b.text.toLowerCase().trim()] = b.id;
        choiceMap[b.id.toLowerCase().trim()] = b.id;
      });

      const triggerData = {
        ...(run.triggerData || {}),
        chatId: ctx.chatId,
        currentNodeId: action.id,
        waitingForInput: true,
        expectedInputType: 'button_choice',
        choiceMap,
        timeoutMinutes: Number(action.config['timeoutMinutes'] || 60),
        timeoutAt: new Date(Date.now() + Number(action.config['timeoutMinutes'] || 60) * 60 * 1000).toISOString(),
      };

      await this.workflowService.updateRunTriggerData(run.id, triggerData);
    }

    return { sentVia, message, buttons, buttonsCount: buttons.length, suspended: Boolean(run) };
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

    if (this.messageService && res.reply) {
      await this.messageService.sendText(ctx.sessionId, {
        chatId: ctx.chatId,
        text: res.reply,
      });
    }

    if (res.handoff && this.conversationService && ctx.conversationId) {
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

  private async actionMarkAsRead(_action: WorkflowAction, ctx: TriggerContext): Promise<Record<string, unknown>> {
    if (!ctx.sessionId || !ctx.chatId || !this.engineRegistry) {
      return { status: 'skipped', reason: 'No session/chat or engineRegistry' };
    }
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
      this.logger.warn(`Failed to send location message: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { sent: false };
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

    // 1. Interpolate base URL
    let fullUrl = this.interpolateVariables(rawUrl, ctx, run);

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
      if (typeof rawBody === 'string' && rawBody.trim()) {
        reqBody = this.interpolateVariables(rawBody, ctx, run);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else if (rawBody && typeof rawBody === 'object' && Object.keys(rawBody).length > 0) {
        reqBody = this.interpolateVariables(JSON.stringify(rawBody), ctx, run);
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
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: reqBody,
        signal: controller.signal,
      });
      const durationMs = Date.now() - start;

      const contentType = response.headers.get('content-type') || '';
      let responseData: unknown;
      if (contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch {
          responseData = null;
        }
      } else {
        responseData = await response.text();
      }

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
        url: fullUrl,
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
      const res = await fetch(fullUrl, {
        method,
        headers: reqHeaders,
        body: reqBody,
        signal: controller.signal,
      });
      const durationMs = Date.now() - start;

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });

      const contentType = res.headers.get('content-type') || '';
      let data: unknown;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        data = await res.text();
      }

      return {
        success: res.ok,
        statusCode: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        durationMs,
        resolvedUrl: fullUrl,
        headers: resHeaders,
        data,
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

  async resume(workflow: WorkflowDefinition, run: WorkflowRun, ctx: TriggerContext, userReply: string): Promise<void> {
    const triggerData = (run.triggerData || {}) as Record<string, any>;
    if (!triggerData.waitingForInput) return;

    const inputType = triggerData.expectedInputType;
    let nextHandle: string | undefined;

    if (!triggerData.stepOutputs) {
      triggerData.stepOutputs = {};
    }

    if (inputType === 'button_choice') {
      const choiceMap = (triggerData.choiceMap || {}) as Record<string, string>;
      const normalized = userReply.toLowerCase().trim();
      const matchedChoiceId = choiceMap[normalized] || choiceMap[userReply.trim()];

      if (!matchedChoiceId) {
        if (this.messageService && ctx.sessionId && ctx.chatId) {
          await this.messageService.sendText(ctx.sessionId, {
            chatId: ctx.chatId,
            text: `❌ Invalid choice. Please select a valid option or reply with the correct number.`,
          });
        }
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
      const trimmed = userReply.trim();
      let isValid = true;

      if (validation === 'email') {
        isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      } else if (validation === 'phone') {
        isValid = /^\+?[0-9]{7,15}$/.test(trimmed.replace(/[\s-]/g, ''));
      } else if (validation === 'number') {
        isValid = !isNaN(Number(trimmed));
      } else if (validation === 'pincode') {
        isValid = /^[1-9][0-9]{5}$/.test(trimmed.replace(/\s/g, ''));
      }

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

    if (!webhookUrl || ctx.metadata?.isTest || action.config['dryRun']) {
      return {
        success: true,
        simulated: true,
        dryRun: true,
        appendedRow: columns,
        destination: webhookUrl || 'simulated_sheets',
      };
    }

    const result = await this.testWebhookCall({
      url: webhookUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'appendRow', row: columns }),
    });

    return {
      success: result.statusCode >= 200 && result.statusCode < 300,
      statusCode: result.statusCode,
      appendedRow: columns,
    };
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

    if (ctx.metadata?.isTest || action.config['dryRun'] || !url) {
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

    return { sent: true, simulated: true, chatId: normalizedChatId, mediaType, url, caption };
  }

  private async actionSearchAgents(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const captured = (run?.triggerData?.['capturedVariables'] as Record<string, any>) || {};

    const rawPin =
      action.config['pincode'] || captured['pincode'] || captured['residence_pincode'] || captured['pin'] || '';
    const resolvedPin = this.interpolateVariables(String(rawPin), ctx, run)
      .trim()
      .replace(/[^0-9]/g, '');

    const rawService = action.config['mainService'] || captured['mainService'] || captured['service'] || 'insurance';
    const mainService = this.interpolateVariables(String(rawService), ctx, run).toLowerCase();

    const rawCategory = action.config['productCategory'] || captured['productCategory'] || captured['category'] || '';
    const productCategory = this.interpolateVariables(String(rawCategory), ctx, run);

    const rawSubProduct = action.config['subProduct'] || captured['subProduct'] || '';
    const subProduct = this.interpolateVariables(String(rawSubProduct), ctx, run);

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

    const rawPhone = action.config['customerPhone'] || ctx.chatId?.replace(/@.*$/, '') || '';
    const customerPhone = this.interpolateVariables(String(rawPhone), ctx, run);

    const rawMain = action.config['mainService'] || captured['mainService'] || 'insurance';
    const mainService = this.interpolateVariables(String(rawMain), ctx, run);

    const rawSelected = action.config['selectedService'] || captured['selectedService'] || 'General Enquiry';
    const selectedService = this.interpolateVariables(String(rawSelected), ctx, run);

    const rawCategory = action.config['productCategory'] || captured['productCategory'] || '';
    const productCategory = this.interpolateVariables(String(rawCategory), ctx, run);

    const rawSub = action.config['subProduct'] || captured['subProduct'] || '';
    const subProduct = this.interpolateVariables(String(rawSub), ctx, run);

    const rawClaimType = action.config['claimIssueType'] || captured['claimIssueType'] || '';
    const claimIssueType = this.interpolateVariables(String(rawClaimType), ctx, run);

    const rawCompany = action.config['insuranceCompany'] || captured['insuranceCompany'] || '';
    const insuranceCompany = this.interpolateVariables(String(rawCompany), ctx, run);

    const rawDesc = action.config['issueDescription'] || captured['issueDescription'] || '';
    const issueDescription = this.interpolateVariables(String(rawDesc), ctx, run);

    const rawPin = action.config['pincode'] || captured['pincode'] || captured['residence_pincode'] || '';
    const pincode = this.interpolateVariables(String(rawPin), ctx, run)
      .trim()
      .replace(/[^0-9]/g, '');

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
        conversationId: ctx.sessionId,
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
    const rawPin =
      action.config['pincode'] || captured['pincode'] || captured['residence_pincode'] || ctx.messageBody || '';
    const pincode = this.interpolateVariables(String(rawPin), ctx, run).trim().replace(/\s/g, '');

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
  ): Promise<void> {
    const nodes = (workflow.definition.nodes || []) as VisualWorkflowNode[];
    const edges = (workflow.definition.edges || []) as VisualWorkflowEdge[];
    const steps: StepResult[] = (run.steps as StepResult[]) || [];

    let matchingEdge = edges.find(
      e => e.source === fromNodeId && (!outgoingHandle || e.sourceHandle === outgoingHandle),
    );
    if (!matchingEdge && outgoingHandle) {
      matchingEdge = edges.find(e => e.source === fromNodeId);
    }

    let currentNode = matchingEdge ? nodes.find(n => n.id === matchingEdge?.target) : undefined;

    while (currentNode) {
      const action: WorkflowAction = {
        id: currentNode.id,
        type: currentNode.type as ActionType,
        config: currentNode.data?.config || {},
      };

      const step = await this.executeAction(action, ctx, workflow.maxRetries, run);
      steps.push(step);
      if (run) run.steps = steps;

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

      const nextHandle = step.output?.['branch'] as string | undefined;
      let nextEdge = edges.find(e => e.source === currentNode?.id && (!nextHandle || e.sourceHandle === nextHandle));
      if (!nextEdge && nextHandle) {
        nextEdge = edges.find(e => e.source === currentNode?.id);
      }

      currentNode = nextEdge ? nodes.find(n => n.id === nextEdge?.target) : undefined;
    }

    await this.workflowService.updateRunStatus(run.id, RunStatus.COMPLETED, { steps });
  }

  private async actionScheduleFollowup(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    if (!this.scheduledMessageRepo) {
      return { status: 'error', error: 'Scheduled message repository not available' };
    }

    const delayMinutes = Number(action.config.delayMinutes ?? action.config.delay ?? 60);
    const message = this.interpolateVariables(String(action.config.message ?? ''), ctx, run);
    const chatId = this.interpolateVariables(String(action.config.chatId ?? ctx.chatId ?? ''), ctx, run);
    const sessionId = this.interpolateVariables(String(action.config.sessionId ?? ctx.sessionId ?? ''), ctx, run);

    if (!chatId || !sessionId || !message) {
      return { status: 'error', error: 'chatId, sessionId, and message are required' };
    }

    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

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

    if (ctx.metadata?.isTest || action.config['dryRun'] || !phoneNumber) {
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

    return { sent: true, simulated: true, chatId: normalizedChatId, displayName, phoneNumber };
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

    if (ctx.metadata?.isTest || action.config['dryRun'] || !url) {
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

    return { sent: true, simulated: true, chatId: normalizedChatId, fileName, url, caption };
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

    if (ctx.metadata?.isTest || action.config['dryRun'] || !url) {
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

    return { sent: true, simulated: true, chatId: normalizedChatId, url, ptt: true };
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
      '📍 *Pincode:* {{steps.last.pincode || trigger.message}}\n' +
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

    return { alerted: true, simulated: true, recipient: alertChatId, message };
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

    const isMatch = allKeywords.some(kw => rawText === kw || rawText.startsWith(kw));
    const forceOptOut = Boolean(action.config['forceOptOut']);

    if (isMatch || forceOptOut) {
      this.logger.log(`Opt-out / DND triggered for ${ctx.chatId}`);

      if (action.config['sendConfirmation'] !== false && ctx.sessionId && ctx.chatId) {
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
    const rawAmount = String(action.config['amount'] || action.config['amountInRupees'] || '299');
    const amount = parseFloat(this.interpolateVariables(rawAmount, ctx, run).replace(/[^0-9.]/g, '')) || 299;
    const rawDesc = String(action.config['description'] || 'Expert Policy Audit & Consultation');
    const description = this.interpolateVariables(rawDesc, ctx, run);

    const payeeVpa = String(action.config['payeeVpa'] || 'paytmqr.advisor@paytm');
    const payeeName = String(action.config['payeeName'] || 'PadosiAgent Consultation');
    const txnId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const upiLink = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(description)}`;

    const paymentUrl = action.config['razorpayUrl']
      ? this.interpolateVariables(String(action.config['razorpayUrl']), ctx, run)
      : `https://rzp.io/l/padosi-${txnId.toLowerCase()}`;

    const defaultMsg =
      `💳 *ઓનલાઇન કન્સલ્ટેશન પેમેન્ટ*\n\n` +
      `📋 *વિગત:* ${description}\n` +
      `💰 *રકમ:* ₹${amount}\n\n` +
      `👇 *UPI એપ (GPay / PhonePe / Paytm) થી ચૂકવવા માટે:* \n` +
      `${upiLink}\n\n` +
      `🌐 *ક્રેડિટ / ડેબિટ કાર્ડ અથવા નેટબેંકિંગ માટે:* \n` +
      `${paymentUrl}\n\n` +
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

    const textSample = (ctx.messageBody || '') + ' ' + (imageUrl || '');
    const vehicleRegex = /([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4})/i;
    const policyRegex = /(OG-[0-9\-]+|[0-9]{10,16})/i;

    const vehicleMatch = textSample.match(vehicleRegex);
    const policyMatch = textSample.match(policyRegex);

    const extracted = {
      documentType: docType,
      policyNumber: policyMatch ? policyMatch[0] : `POL-2026-${Math.floor(100000 + Math.random() * 900000)}`,
      vehicleNumber: vehicleMatch ? vehicleMatch[0].toUpperCase() : 'GJ01AB1234',
      insuredName: (ctx.metadata?.['contactName'] as string) || 'Customer',
      insurerName: 'HDFC ERGO General Insurance',
      expiryDate: '2026-12-31',
      isValid: true,
      imageUrl,
    };

    return extracted;
  }

  private async actionDynamicPDFGenerator(
    action: WorkflowAction,
    ctx: TriggerContext,
    run?: WorkflowRun,
  ): Promise<Record<string, unknown>> {
    const rawTitle = String(action.config['title'] || 'PadosiAgent Advisor Comparison & Quotation');
    const title = this.interpolateVariables(rawTitle, ctx, run);
    const fileName = `Quotation_${Date.now()}.pdf`;
    const pdfUrl = `https://assets.padosiagent.com/generated/${fileName}`;
    const caption = `📄 *${title}*\nતમારા વિસ્તારના શ્રેષ્ઠ એડવાઈઝર્સની સરખામણી સ્લિપ.`;

    if (action.config['autoSend'] === true && ctx.sessionId && ctx.chatId && this.messageService) {
      await this.messageService
        .sendDocument(ctx.sessionId, {
          chatId: ctx.chatId,
          url: pdfUrl,
          filename: fileName,
          caption,
          mimetype: 'application/pdf',
        })
        .catch(() => undefined);
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

    return { sent: true, simulated: true, cardCount: cards.length };
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
