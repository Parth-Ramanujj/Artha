import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EngineRegistry } from '../../engine/engine-registry.service';
import type { IncomingMessage, IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { HookManager } from '../../core/hooks';
import { createLogger } from '../../common/services/logger.service';
import { isUniqueConstraintError } from '../../common/utils/unique-constraint.util';
import { Session } from '../session/entities/session.entity';
import { BusinessService } from '../business/business.service';
import { WhatsAppForm } from './entities/whatsapp-form.entity';
import { WhatsAppFormSubmission } from './entities/whatsapp-form-submission.entity';
import {
  FlowCategory,
  FormDefinition,
  buildFlowJson,
  buildFlowMessage,
  formIdFromToken,
  makeFlowToken,
  validateFormDefinition,
} from './flow-definition';

export interface FlowValidationError {
  error?: string;
  message?: string;
  line_start?: number;
}

/** The Cloud API calls a form needs. Other engines don't have them, so they get a clear error. */
type FlowEngine = IWhatsAppEngine & {
  createFlow?: (name: string, categories: string[]) => Promise<string>;
  uploadFlowJson?: (flowId: string, flowJson: Record<string, unknown>) => Promise<FlowValidationError[]>;
  publishFlow?: (flowId: string) => Promise<void>;
  sendInteractiveMessage?: (chatId: string, interactive: Record<string, unknown>) => Promise<{ id: string }>;
};

export interface PublishResult {
  published: boolean;
  metaFlowId: string | null;
  /** Meta's validation messages when the flow was rejected. Empty when published. */
  errors: string[];
}

export interface SentForm {
  messageId: string;
  /** Identifies this one send; the customer's submission carries it back. */
  flowToken: string;
  formName: string;
}

// shortcut: newest 500 submissions only, add paging when a form collects more.
const SUBMISSION_LIST_LIMIT = 500;

@Injectable()
export class WhatsAppFormService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('WhatsAppFormService');
  private readonly hookIds: string[] = [];

  constructor(
    @InjectRepository(WhatsAppForm, 'data') private readonly forms: Repository<WhatsAppForm>,
    @InjectRepository(WhatsAppFormSubmission, 'data')
    private readonly submissions: Repository<WhatsAppFormSubmission>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    private readonly engines: EngineRegistry,
    private readonly businessService: BusinessService,
    private readonly hookManager: HookManager,
  ) {}

  onModuleInit(): void {
    this.hookIds.push(
      this.hookManager.register(
        'whatsapp-form-submissions',
        'message:received',
        hookCtx => {
          const msg = hookCtx.data as IncomingMessage;
          if (hookCtx.sessionId && msg?.flowReply) {
            void this.recordSubmission(hookCtx.sessionId, msg).catch(err =>
              this.logger.error('Could not record form submission', err instanceof Error ? err.message : String(err)),
            );
          }
          return Promise.resolve({ continue: true });
        },
        905,
      ),
    );
  }

  onModuleDestroy(): void {
    for (const id of this.hookIds) this.hookManager.unregister(id);
  }

  list(businessId: string): Promise<WhatsAppForm[]> {
    return this.forms.find({ where: { businessId }, order: { updatedAt: 'DESC' } });
  }

  async get(businessId: string, id: string): Promise<WhatsAppForm> {
    const form = await this.forms.findOne({ where: { id, businessId } });
    if (!form) throw new NotFoundException(`WhatsApp form '${id}' not found`);
    return form;
  }

  create(businessId: string, input: { name: string; category?: FlowCategory; definition: Record<string, unknown> }) {
    return this.forms.save(
      this.forms.create({
        businessId,
        name: input.name,
        category: input.category ?? 'OTHER',
        status: 'draft',
        definition: input.definition as unknown as FormDefinition,
        metaFlowId: null,
        publishedAt: null,
      }),
    );
  }

  /** Editing a published form turns it back into a draft: customers keep the live version until it is republished. */
  async update(
    businessId: string,
    id: string,
    input: { name?: string; category?: FlowCategory; definition?: Record<string, unknown> },
  ): Promise<WhatsAppForm> {
    const form = await this.get(businessId, id);
    if (input.name !== undefined) form.name = input.name;
    if (input.category !== undefined) form.category = input.category;
    if (input.definition !== undefined) {
      form.definition = input.definition as unknown as FormDefinition;
      form.status = 'draft';
    }
    return this.forms.save(form);
  }

  async delete(businessId: string, id: string): Promise<void> {
    const form = await this.get(businessId, id);
    await this.forms.remove(form);
  }

  /**
   * Uploads the form to Meta and publishes it. A form that was never published reuses its Meta
   * draft; a form published before gets a new Meta flow, because Meta won't change a live one.
   */
  async publish(businessId: string, id: string, sessionId: string): Promise<PublishResult> {
    const form = await this.get(businessId, id);
    const issues = validateFormDefinition(form.definition);
    if (issues.length) throw new BadRequestException(issues);

    const engine = await this.flowEngine(businessId, sessionId);
    if (!engine.createFlow || !engine.uploadFlowJson || !engine.publishFlow) {
      throw new BadRequestException('WhatsApp Forms can only be published from a Cloud API number');
    }

    const reuse = form.metaFlowId && !form.publishedAt;
    const metaFlowId = reuse ? form.metaFlowId! : await engine.createFlow(form.name, [form.category]);
    form.metaFlowId = metaFlowId;

    const errors = await engine.uploadFlowJson(metaFlowId, buildFlowJson(form.definition));
    if (errors.length) {
      form.status = 'draft';
      await this.forms.save(form);
      const messages = errors.map(e => e.message ?? e.error ?? 'Unknown error');
      this.logger.warn('Meta rejected WhatsApp form', { formId: id, metaFlowId, errors: messages });
      return { published: false, metaFlowId, errors: messages };
    }

    await engine.publishFlow(metaFlowId);
    form.status = 'published';
    form.publishedAt = new Date();
    await this.forms.save(form);
    this.logger.log('WhatsApp form published', { formId: id, metaFlowId });
    return { published: true, metaFlowId, errors: [] };
  }

  /** Sends a published form to a phone number. Customers can only be messaged inside the 24-hour window or with an approved template. */
  async send(
    businessId: string,
    id: string,
    input: { sessionId: string; phone: string; bodyText?: string },
  ): Promise<{ messageId: string }> {
    const digits = input.phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      throw new BadRequestException('Enter the phone number with country code');
    }
    const sent = await this.deliver(businessId, id, input.sessionId, `${digits}@c.us`, input.bodyText);
    return { messageId: sent.messageId };
  }

  /** Sends a published form into the chat a workflow is running in. */
  sendForWorkflow(input: {
    businessId: string;
    formId: string;
    sessionId: string;
    chatId: string;
    bodyText?: string;
  }): Promise<SentForm> {
    return this.deliver(input.businessId, input.formId, input.sessionId, input.chatId, input.bodyText);
  }

  async listSubmissions(businessId: string, formId: string): Promise<WhatsAppFormSubmission[]> {
    await this.get(businessId, formId);
    return this.submissions.find({
      where: { businessId, formId },
      order: { createdAt: 'DESC' },
      take: SUBMISSION_LIST_LIMIT,
    });
  }

  /**
   * Stores a customer's answers. Ignores a token from another app and a submission that arrived on a
   * number of a different business (a flow token is not a secret, so it alone must not pick the form).
   */
  async recordSubmission(sessionId: string, msg: IncomingMessage): Promise<WhatsAppFormSubmission | null> {
    const reply = msg.flowReply;
    if (!reply || msg.fromMe) return null;
    const formId = formIdFromToken(reply.flowToken);
    if (!formId) return null;

    const form = await this.forms.findOne({ where: { id: formId } });
    if (!form) return null;
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    const businessId = session?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
    if (businessId !== form.businessId) return null;

    try {
      return await this.submissions.save(
        this.submissions.create({
          businessId,
          formId,
          sessionId,
          chatId: msg.chatId,
          messageId: msg.id,
          flowToken: reply.flowToken,
          answers: reply.answers,
        }),
      );
    } catch (err) {
      // Meta redelivered a webhook we already stored.
      if (isUniqueConstraintError(err)) return null;
      throw err;
    }
  }

  private async deliver(
    businessId: string,
    formId: string,
    sessionId: string,
    chatId: string,
    bodyText?: string,
  ): Promise<SentForm> {
    const form = await this.get(businessId, formId);
    if (form.status !== 'published' || !form.metaFlowId) {
      throw new BadRequestException('Publish the form before sending it');
    }
    const engine = await this.flowEngine(businessId, sessionId);
    if (!engine.sendInteractiveMessage) {
      throw new BadRequestException('WhatsApp Forms can only be sent from a Cloud API number');
    }

    const flowToken = makeFlowToken(form.id, randomUUID());
    const message = buildFlowMessage({
      flowId: form.metaFlowId,
      flowToken,
      bodyText: bodyText?.trim() || `Please fill in: ${form.name}`,
      ctaText: 'Open form',
    });
    const sent = await engine.sendInteractiveMessage(chatId, message);
    return { messageId: sent.id, flowToken, formName: form.name };
  }

  /** The live engine of a session that belongs to this business. */
  private async flowEngine(businessId: string, sessionId: string): Promise<FlowEngine> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new BadRequestException('WhatsApp number not found');
    const defaultBusiness = await this.businessService.getOrCreateDefaultBusiness();
    if ((session.businessId ?? defaultBusiness.id) !== businessId) {
      throw new BadRequestException('That WhatsApp number does not belong to this business');
    }
    const engine = this.engines.get(sessionId);
    if (!engine) throw new BadRequestException('This WhatsApp number is not connected');
    return engine;
  }
}
