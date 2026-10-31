import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EngineRegistry } from '../../engine/engine-registry.service';
import type { IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';
import { scalarToString } from '../../common/utils/scalar-string';
import { MessageService } from '../message/message.service';
import { Message } from '../message/entities/message.entity';
import { EngineType, Session } from '../session/entities/session.entity';
import { ContactConsent, ConsentStatus } from '../campaign/entities/contact-consent.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { hasDndTag } from '../conversation/dnd';
import { WorkflowDefinition } from '../workflow/entities/workflow-definition.entity';
import { StudioMessage, StudioMessageStatus, StudioTestResult } from './entities/studio-message.entity';
import { StudioProduct } from './entities/studio-product.entity';
import { StudioSetting } from './entities/studio-setting.entity';
import {
  ReadinessResult,
  ResolvedProduct,
  STUDIO_KINDS,
  SendCapabilities,
  StudioContent,
  StudioKind,
  TemplateInfo,
  checkReadiness,
  countTemplateVariables,
  isHttpsUrl,
  normalizeContent,
  referencedProductIds,
} from './studio-content';
import { SendPart, SendPlan, buildSendPlan } from './send-plan';
import type {
  ListStudioMessagesQueryDto,
  ProductDto,
  ProductQueryDto,
  StudioMessageDto,
  StudioSettingsDto,
  UpdateProductDto,
  UpdateStudioMessageDto,
} from './dto/message-studio.dto';

/** The node type a workflow uses to send a studio message. */
export const STUDIO_NODE_TYPE = 'send_studio_message';

const TEMPLATE_CACHE_MS = 2 * 60 * 1000;

type CloudLikeEngine = IWhatsAppEngine & {
  sendInteractiveMessage?: (chatId: string, interactive: Record<string, unknown>) => Promise<{ id: string }>;
  sendReaction?: (chatId: string, messageId: string, emoji: string) => Promise<{ id: string }>;
  listMessageTemplates?: () => Promise<
    Array<{
      name: string;
      language: string;
      status: string;
      category: string;
      components: Array<Record<string, unknown>>;
    }>
  >;
};

export interface SessionCaps extends SendCapabilities {
  sessionId: string;
  engine: string;
  connected: boolean;
}

export interface UsedIn {
  workflowId: string;
  name: string;
  status: string;
}

/** Converts Meta's template JSON into what the composer and the checks need. */
export function toTemplateInfo(t: {
  name: string;
  language: string;
  status: string;
  category: string;
  components: Array<Record<string, unknown>>;
}): TemplateInfo {
  const find = (type: string) => t.components.find(c => String(c.type).toUpperCase() === type);
  const body = find('BODY');
  const header = find('HEADER');
  const footer = find('FOOTER');
  const buttons = find('BUTTONS');
  const bodyText = scalarToString(body?.text);
  return {
    name: t.name,
    language: t.language,
    status: t.status.toUpperCase(),
    category: t.category,
    bodyText,
    bodyVariableCount: countTemplateVariables(bodyText),
    headerFormat: header
      ? (scalarToString(header.format, 'TEXT').toUpperCase() as TemplateInfo['headerFormat'])
      : 'NONE',
    ...(header?.text ? { headerText: scalarToString(header.text) } : {}),
    ...(footer?.text ? { footerText: scalarToString(footer.text) } : {}),
    buttons: Array.isArray(buttons?.buttons)
      ? (buttons.buttons as Array<Record<string, unknown>>).map(b => ({
          type: String(b.type),
          text: scalarToString(b.text),
        }))
      : [],
    isCarousel: Boolean(find('CAROUSEL')),
    ...(find('CAROUSEL') ? { carouselCards: carouselCards(find('CAROUSEL')) } : {}),
  };
}

/** Each card's header kind and body variable count, read from Meta's CAROUSEL component. */
function carouselCards(component: Record<string, unknown> | undefined): NonNullable<TemplateInfo['carouselCards']> {
  const cards = Array.isArray(component?.cards) ? (component.cards as Array<Record<string, unknown>>) : [];
  return cards.map(card => {
    const parts = Array.isArray(card.components) ? (card.components as Array<Record<string, unknown>>) : [];
    const header = parts.find(p => String(p.type).toUpperCase() === 'HEADER');
    const format = scalarToString(header?.format).toUpperCase();
    const body = parts.find(p => String(p.type).toUpperCase() === 'BODY');
    return {
      headerFormat: format === 'VIDEO' ? 'VIDEO' : format === 'IMAGE' ? 'IMAGE' : 'NONE',
      bodyVariableCount: countTemplateVariables(scalarToString(body?.text)),
    };
  });
}

@Injectable()
export class MessageStudioService {
  private readonly logger = createLogger('MessageStudioService');
  private readonly templateCache = new Map<string, { at: number; templates: TemplateInfo[] }>();
  /** Message ids with a test send in flight — a double click must not send twice. */
  private readonly sending = new Set<string>();

  constructor(
    @InjectRepository(StudioMessage, 'data') private readonly messages: Repository<StudioMessage>,
    @InjectRepository(StudioProduct, 'data') private readonly products: Repository<StudioProduct>,
    @InjectRepository(StudioSetting, 'data') private readonly settings: Repository<StudioSetting>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(WorkflowDefinition, 'data') private readonly workflows: Repository<WorkflowDefinition>,
    @InjectRepository(ContactConsent, 'data') private readonly consents: Repository<ContactConsent>,
    @InjectRepository(Conversation, 'data') private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message, 'data') private readonly sentMessages: Repository<Message>,
    private readonly engines: EngineRegistry,
    @Optional() private readonly messageService?: MessageService,
  ) {}

  // ── sessions & capabilities ──

  /** The session, if it belongs to this business (a session with no business belongs to the default one). */
  async requireSession(businessId: string, sessionId: string, defaultBusinessId: string): Promise<Session> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new BadRequestException('WhatsApp number not found');
    if ((session.businessId ?? defaultBusinessId) !== businessId) {
      throw new ForbiddenException('That WhatsApp number does not belong to this business');
    }
    return session;
  }

  async capabilities(businessId: string, session: Session | null): Promise<SessionCaps> {
    const catalogConfigured = Boolean((await this.getSettings(businessId)).metaCatalogId);
    if (!session) {
      return { sessionId: '', engine: 'none', connected: false, cloudApi: false, catalogConfigured };
    }
    const engine: CloudLikeEngine | undefined = this.engines.get(session.id);
    // The live engine is the real answer; the stored type covers a number that is offline right now.
    const cloudApi = engine
      ? typeof engine.sendInteractiveMessage === 'function'
      : (session.engineType ?? process.env.ENGINE_TYPE) === EngineType.CLOUD_API;
    return {
      sessionId: session.id,
      engine: session.engineType ?? process.env.ENGINE_TYPE ?? EngineType.WHATSAPP_WEB_JS,
      connected: Boolean(engine),
      cloudApi,
      catalogConfigured,
    };
  }

  /**
   * Meta templates for a Cloud API number. Returns null when they can't be read (not Cloud API, not
   * connected, or no WABA id) together with the reason.
   */
  async templates(sessionId: string, refresh = false): Promise<{ templates: TemplateInfo[] | null; reason?: string }> {
    const engine: CloudLikeEngine | undefined = this.engines.get(sessionId);
    if (!engine) return { templates: null, reason: 'This WhatsApp number is not connected.' };
    if (typeof engine.listMessageTemplates !== 'function') {
      return { templates: null, reason: 'Approved templates are only available on WhatsApp Cloud API numbers.' };
    }
    const cached = this.templateCache.get(sessionId);
    if (!refresh && cached && Date.now() - cached.at < TEMPLATE_CACHE_MS) return { templates: cached.templates };
    try {
      const templates = (await engine.listMessageTemplates()).map(toTemplateInfo);
      this.templateCache.set(sessionId, { at: Date.now(), templates });
      return { templates };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not list templates for ${sessionId}: ${reason}`);
      return { templates: null, reason: `Could not load templates from Meta: ${reason}` };
    }
  }

  // ── readiness ──

  private async resolveProducts(businessId: string, content: StudioContent): Promise<Map<string, ResolvedProduct>> {
    const ids = referencedProductIds(content);
    const map = new Map<string, ResolvedProduct>();
    if (!ids.length) return map;
    const rows = await this.products.find({ where: { businessId, id: In(ids) } });
    for (const p of rows) map.set(p.id, toResolved(p));
    return map;
  }

  /** Server-side check of a message for a number; the dashboard shows exactly this. */
  async validate(
    businessId: string,
    kind: StudioKind,
    rawContent: unknown,
    session: Session | null,
  ): Promise<ReadinessResult & { content: StudioContent; capabilities: SessionCaps; products: ResolvedProduct[] }> {
    const content = normalizeContent(kind, rawContent);
    const caps = await this.capabilities(businessId, session);
    const products = await this.resolveProducts(businessId, content);
    const templates = kind === 'template' && session ? (await this.templates(session.id)).templates : null;
    const result = checkReadiness({ kind, content, products, templates, caps });
    if (!session) {
      result.issues.unshift({
        field: 'session',
        message: 'Choose the WhatsApp number this message is sent from.',
        severity: 'error',
      });
      if (result.readiness === 'ready') result.readiness = 'needs_attention';
    }
    return { ...result, content, capabilities: caps, products: [...products.values()] };
  }

  // ── messages ──

  async list(businessId: string, query: ListStudioMessagesQueryDto): Promise<StudioMessage[]> {
    const qb = this.messages.createQueryBuilder('m').where('m.businessId = :businessId', { businessId });
    if (query.status === 'active' || !query.status) {
      qb.andWhere('m.status != :archived', { archived: StudioMessageStatus.ARCHIVED });
    } else {
      qb.andWhere('m.status = :status', { status: query.status });
    }
    if (query.search?.trim()) qb.andWhere('LOWER(m.name) LIKE :q', { q: `%${query.search.trim().toLowerCase()}%` });
    if (query.sort === 'recent') qb.andWhere('m.lastUsedAt IS NOT NULL').orderBy('m.lastUsedAt', 'DESC');
    else qb.orderBy('m.updatedAt', 'DESC');
    // Content can hold an uploaded file; the list only needs names and badges.
    const rows = await qb.take(200).getMany();
    return rows.map(r => ({ ...r, content: stripUploads(r.content) }));
  }

  async get(businessId: string, id: string): Promise<StudioMessage & { usedIn: UsedIn[] }> {
    const message = await this.messages.findOne({ where: { id, businessId } });
    if (!message) throw new NotFoundException('Message not found');
    return { ...message, usedIn: await this.usedIn(businessId, id) };
  }

  async create(businessId: string, dto: StudioMessageDto, session: Session | null): Promise<StudioMessage> {
    const check = await this.validate(businessId, dto.kind, dto.content, session);
    const message = this.messages.create({
      businessId,
      name: dto.name.trim(),
      kind: dto.kind,
      content: check.content,
      presetKey: dto.presetKey ?? null,
      status: StudioMessageStatus.DRAFT,
      readiness: check.readiness,
    });
    return this.messages.save(message);
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateStudioMessageDto,
    session: Session | null,
  ): Promise<StudioMessage> {
    const message = await this.requireMessage(businessId, id);
    if (dto.name !== undefined) message.name = dto.name.trim();
    if (dto.content !== undefined) {
      const check = await this.validate(businessId, message.kind, dto.content, session);
      message.content = check.content;
      message.readiness = check.readiness;
      // A published message that no longer passes goes back to draft, so automations stop sending it.
      if (message.status === StudioMessageStatus.READY && check.readiness !== 'ready') {
        message.status = StudioMessageStatus.DRAFT;
      }
    }
    return this.messages.save(message);
  }

  async duplicate(businessId: string, id: string): Promise<StudioMessage> {
    const source = await this.requireMessage(businessId, id);
    const copy = this.messages.create({
      businessId,
      name: `${source.name} (copy)`.slice(0, 120),
      kind: source.kind,
      content: source.content,
      presetKey: source.presetKey,
      status: StudioMessageStatus.DRAFT,
      readiness: source.readiness,
    });
    return this.messages.save(copy);
  }

  /** Publish: the message must be ready on the number it will be sent from. */
  async publish(businessId: string, id: string, session: Session): Promise<StudioMessage> {
    const message = await this.requireMessage(businessId, id);
    const check = await this.validate(businessId, message.kind, message.content, session);
    message.readiness = check.readiness;
    if (check.readiness !== 'ready') {
      await this.messages.save(message);
      throw new BadRequestException({
        message: 'Fix the highlighted problems before publishing.',
        readiness: check.readiness,
        issues: check.issues,
      });
    }
    message.status = StudioMessageStatus.READY;
    return this.messages.save(message);
  }

  async unpublish(businessId: string, id: string): Promise<StudioMessage> {
    const message = await this.requireMessage(businessId, id);
    message.status = StudioMessageStatus.DRAFT;
    return this.messages.save(message);
  }

  async archive(businessId: string, id: string, force = false): Promise<StudioMessage> {
    const message = await this.requireMessage(businessId, id);
    const used = (await this.usedIn(businessId, id)).filter(w => w.status === 'published');
    if (used.length && !force) {
      throw new ConflictException({
        message: `Used by ${used.length} live automation(s): ${used.map(u => u.name).join(', ')}. Archiving stops them sending it.`,
        usedIn: used,
      });
    }
    message.status = StudioMessageStatus.ARCHIVED;
    return this.messages.save(message);
  }

  async restore(businessId: string, id: string): Promise<StudioMessage> {
    const message = await this.requireMessage(businessId, id);
    message.status = StudioMessageStatus.DRAFT;
    return this.messages.save(message);
  }

  /** Workflows of this business that send the message. */
  async usedIn(businessId: string, messageId: string): Promise<UsedIn[]> {
    const rows = await this.workflows.find({
      where: { businessId },
      select: { id: true, name: true, status: true, definition: true },
    });
    return rows
      .filter(w =>
        (w.definition?.nodes ?? []).some(
          n =>
            n.type === STUDIO_NODE_TYPE &&
            (n.data?.config as Record<string, unknown> | undefined)?.studioMessageId === messageId,
        ),
      )
      .map(w => ({ workflowId: w.id, name: w.name, status: w.status }));
  }

  private async requireMessage(businessId: string, id: string): Promise<StudioMessage> {
    const message = await this.messages.findOne({ where: { id, businessId } });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  // ── sending ──

  /** True when the customer opted out (DND tag on the chat or an opted-out consent record). */
  private async isOptedOut(businessId: string, sessionId: string, chatId: string): Promise<boolean> {
    const phone = chatId.replace(/@.*$/, '');
    const ids = [...new Set([chatId, phone, `${phone}@c.us`])];
    const consent = await this.consents.findOne({
      where: { businessId, waContactId: In(ids), channel: 'whatsapp', status: ConsentStatus.OPTED_OUT },
      select: { id: true },
    });
    if (consent) return true;
    const conversations = await this.conversations.find({
      where: { sessionId, chatId: In(ids) },
      select: { id: true, tags: true },
    });
    return conversations.some(c => hasDndTag(c.tags));
  }

  private async plan(
    businessId: string,
    message: StudioMessage,
    session: Session,
    fill?: (t: string) => string,
    targetMessageId?: string,
  ): Promise<{ plan: SendPlan; check: ReadinessResult }> {
    const caps = await this.capabilities(businessId, session);
    const products = await this.resolveProducts(businessId, message.content);
    const templates = message.kind === 'template' ? (await this.templates(session.id)).templates : null;
    const check = checkReadiness({ kind: message.kind, content: message.content, products, templates, caps });
    const settings = await this.getSettings(businessId);
    const plan = buildSendPlan({
      kind: message.kind,
      content: message.content,
      products,
      templates,
      caps,
      catalogId: settings.metaCatalogId,
      fill,
      targetMessageId,
    });
    return { plan, check };
  }

  /** Hands each part to WhatsApp in order; stops at the first one that fails. */
  private async deliver(sessionId: string, chatId: string, parts: SendPart[]): Promise<StudioTestResult['parts']> {
    const results: StudioTestResult['parts'] = [];
    for (const part of parts) {
      try {
        const messageId = await this.sendPart(sessionId, chatId, part);
        results.push({ type: part.type, status: 'submitted', ...(messageId ? { messageId } : {}) });
      } catch (err) {
        results.push({ type: part.type, status: 'failed', error: err instanceof Error ? err.message : String(err) });
        break;
      }
    }
    return results;
  }

  private async sendPart(sessionId: string, chatId: string, part: SendPart): Promise<string | undefined> {
    const ms = this.messageService;
    if (!ms) throw new Error('Messaging is not available');
    switch (part.type) {
      case 'text':
        return (await ms.sendText(sessionId, { chatId, text: part.text })).messageId;
      case 'media': {
        const dto = {
          chatId,
          ...(part.url ? { url: part.url } : { base64: part.base64 }),
          mimetype: part.mimetype,
          ...(part.filename ? { filename: part.filename } : {}),
          ...(part.caption ? { caption: part.caption } : {}),
        };
        const res =
          part.mediaKind === 'image'
            ? await ms.sendImage(sessionId, dto)
            : part.mediaKind === 'video'
              ? await ms.sendVideo(sessionId, dto)
              : part.mediaKind === 'audio'
                ? await ms.sendAudio(sessionId, dto)
                : part.mediaKind === 'sticker'
                  ? await ms.sendSticker(sessionId, dto)
                  : await ms.sendDocument(sessionId, dto);
        return res.messageId;
      }
      case 'location':
        return (
          await ms.sendLocation(sessionId, {
            chatId,
            latitude: part.latitude,
            longitude: part.longitude,
            ...(part.name ? { description: part.name } : {}),
            ...(part.address ? { address: part.address } : {}),
          })
        ).messageId;
      case 'contact':
        return (await ms.sendContact(sessionId, { chatId, contactName: part.name, contactNumber: part.phone }))
          .messageId;
      case 'interactive': {
        const engine: CloudLikeEngine | undefined = this.engines.get(sessionId);
        if (!engine?.sendInteractiveMessage) throw new Error('This number cannot send interactive messages');
        return (await engine.sendInteractiveMessage(chatId, part.interactive)).id;
      }
      case 'reaction': {
        const engine: CloudLikeEngine | undefined = this.engines.get(sessionId);
        if (!engine?.sendReaction) throw new Error('This number cannot send reactions');
        return (await engine.sendReaction(chatId, part.messageId, part.emoji)).id;
      }
      case 'template': {
        const engine: CloudLikeEngine | undefined = this.engines.get(sessionId);
        if (!engine?.sendTemplateMessage) throw new Error('This number cannot send approved templates');
        return (await engine.sendTemplateMessage(chatId, part.name, part.language, part.components)).id;
      }
    }
  }

  /** Sends one test copy to a phone number the user typed and confirmed. */
  async testSend(businessId: string, id: string, session: Session, phone: string): Promise<StudioTestResult> {
    const message = await this.requireMessage(businessId, id);
    if (message.kind === 'reaction') {
      throw new BadRequestException('A reaction goes on a customer message, so it can only be sent from a workflow.');
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15)
      throw new BadRequestException('Enter the phone number with country code');
    const chatId = `${digits}@c.us`;
    if (!this.engines.get(session.id)) throw new BadRequestException('This WhatsApp number is not connected');
    if (await this.isOptedOut(businessId, session.id, chatId)) {
      throw new ForbiddenException('This contact opted out of messages, so no test was sent');
    }
    if (this.sending.has(id)) throw new ConflictException('A test send for this message is already in progress');
    this.sending.add(id);
    try {
      const { plan, check } = await this.plan(businessId, message, session);
      if (check.readiness !== 'ready') {
        throw new BadRequestException({ message: 'Fix the highlighted problems before sending a test.', ...check });
      }
      const parts = await this.deliver(session.id, chatId, plan.parts);
      const result: StudioTestResult = {
        at: new Date().toISOString(),
        sessionId: session.id,
        recipient: `+${digits.slice(0, 2)}••••${digits.slice(-3)}`,
        parts,
      };
      message.lastTest = result;
      message.lastUsedAt = new Date();
      await this.messages.save(message);
      return result;
    } finally {
      this.sending.delete(id);
    }
  }

  /** Live status of the last test's messages, as reported back by WhatsApp. */
  async testStatus(
    businessId: string,
    id: string,
  ): Promise<{ lastTest: StudioTestResult | null; statuses: Record<string, string> }> {
    const message = await this.requireMessage(businessId, id);
    const test = message.lastTest;
    const ids = (test?.parts ?? []).map(p => p.messageId).filter((x): x is string => Boolean(x));
    const statuses: Record<string, string> = {};
    if (test && ids.length) {
      const rows = await this.sentMessages.find({
        where: { sessionId: test.sessionId, waMessageId: In(ids) },
        select: { id: true, waMessageId: true, status: true },
      });
      for (const r of rows) statuses[r.waMessageId] = r.status;
    }
    return { lastTest: test, statuses };
  }

  /**
   * Sends a published message from a workflow. Throws when the message is a draft, archived, or no
   * longer passes its checks, so the workflow step fails visibly instead of sending something broken.
   */
  async sendForWorkflow(input: {
    businessId: string;
    messageId: string;
    sessionId: string;
    chatId: string;
    fill?: (text: string) => string;
    /** The customer message a reaction goes on (workflows pass the trigger message id). */
    targetMessageId?: string;
  }): Promise<{ name: string; parts: StudioTestResult['parts']; choices: SendPlan['choices'] }> {
    const message = await this.messages.findOne({ where: { id: input.messageId, businessId: input.businessId } });
    if (!message) throw new Error('The Message Studio message was not found');
    if (message.status !== StudioMessageStatus.READY) {
      throw new Error(`"${message.name}" is not published in Message Studio`);
    }
    const session = await this.sessions.findOne({ where: { id: input.sessionId } });
    if (!session) throw new Error('WhatsApp number not found');
    const { plan, check } = await this.plan(input.businessId, message, session, input.fill, input.targetMessageId);
    if (check.readiness !== 'ready') {
      const first = check.issues.find(i => i.severity === 'error');
      throw new Error(`"${message.name}" cannot be sent from this number: ${first?.message ?? check.readiness}`);
    }
    const parts = await this.deliver(input.sessionId, input.chatId, plan.parts);
    const failed = parts.find(p => p.status === 'failed');
    if (failed) throw new Error(`Sending "${message.name}" failed: ${failed.error}`);
    await this.messages.update({ id: message.id }, { lastUsedAt: new Date() });
    return { name: message.name, parts, choices: plan.choices };
  }

  /** Published messages an automation can use. */
  async publishedForWorkflows(
    businessId: string,
  ): Promise<Array<Pick<StudioMessage, 'id' | 'name' | 'kind'> & { choices: SendPlan['choices'] }>> {
    const rows = await this.messages.find({
      where: { businessId, status: StudioMessageStatus.READY },
      order: { name: 'ASC' },
    });
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      choices: buildSendPlan({
        kind: r.kind,
        content: r.content,
        products: new Map(),
        templates: null,
        caps: { cloudApi: true, catalogConfigured: true },
        catalogId: null,
      }).choices,
    }));
  }

  // ── products ──

  async listProducts(
    businessId: string,
    query: ProductQueryDto,
  ): Promise<{ items: StudioProduct[]; total: number; page: number; limit: number; categories: string[] }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const qb = this.products.createQueryBuilder('p').where('p.businessId = :businessId', { businessId });
    if (query.archived !== 'true') qb.andWhere('p.archived = :archived', { archived: false });
    if (query.category) qb.andWhere('p.category = :category', { category: query.category });
    if (query.search?.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(p.name) LIKE :q OR LOWER(p.sku) LIKE :q)', { q });
    }
    const [items, total] = await qb
      .orderBy('p.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const cats = await this.products
      .createQueryBuilder('p')
      .select('DISTINCT p.category', 'category')
      .where('p.businessId = :businessId AND p.category IS NOT NULL AND p.archived = :archived', {
        businessId,
        archived: false,
      })
      .getRawMany<{ category: string }>();
    return {
      items,
      total,
      page,
      limit,
      categories: cats
        .map(c => c.category)
        .filter(Boolean)
        .sort(),
    };
  }

  async createProduct(businessId: string, dto: ProductDto): Promise<StudioProduct> {
    const product = this.products.create({ businessId, ...cleanProduct(dto) });
    return this.products.save(product);
  }

  async updateProduct(businessId: string, id: string, dto: UpdateProductDto): Promise<StudioProduct> {
    const product = await this.products.findOne({ where: { id, businessId } });
    if (!product) throw new NotFoundException('Product not found');
    Object.assign(product, cleanProduct(dto));
    return this.products.save(product);
  }

  // ── settings ──

  async getSettings(businessId: string): Promise<{ metaCatalogId: string | null }> {
    const row = await this.settings.findOne({ where: { businessId } });
    return { metaCatalogId: row?.metaCatalogId ?? null };
  }

  async updateSettings(businessId: string, dto: StudioSettingsDto): Promise<{ metaCatalogId: string | null }> {
    const row = (await this.settings.findOne({ where: { businessId } })) ?? this.settings.create({ businessId });
    if (dto.metaCatalogId !== undefined) row.metaCatalogId = dto.metaCatalogId || null;
    await this.settings.save(row);
    return { metaCatalogId: row.metaCatalogId };
  }

  static isKind(value: string): value is StudioKind {
    return (STUDIO_KINDS as readonly string[]).includes(value);
  }
}

function toResolved(p: StudioProduct): ResolvedProduct {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    currency: p.currency,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    inStock: p.inStock,
    retailerId: p.retailerId,
    archived: p.archived,
  };
}

/** Product fields as stored: trimmed, empty → null, and only https links. */
function cleanProduct(dto: Partial<ProductDto> & { archived?: boolean }): Partial<StudioProduct> {
  const out: Partial<StudioProduct> = {};
  // undefined leaves a field alone; null or blank clears it (the dashboard sends null for empty inputs).
  const opt = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  for (const key of ['imageUrl', 'productUrl'] as const) {
    const value = opt(dto[key]);
    if (value && !isHttpsUrl(value)) {
      throw new BadRequestException(`${key === 'imageUrl' ? 'Image' : 'Product'} link must start with https://`);
    }
    if (value !== undefined) out[key] = value;
  }
  if (dto.name !== undefined) out.name = dto.name.trim();
  for (const key of ['sku', 'description', 'category', 'retailerId'] as const) {
    const value = opt(dto[key]);
    if (value !== undefined) out[key] = value;
  }
  if (dto.price !== undefined) out.price = dto.price;
  if (dto.currency !== undefined) out.currency = dto.currency;
  if (dto.inStock !== undefined) out.inStock = dto.inStock;
  if (dto.archived !== undefined) out.archived = dto.archived;
  return out;
}

function stripUploads(content: StudioContent): StudioContent {
  if (!content?.media?.base64) return content;
  return { ...content, media: { ...content.media, base64: undefined } };
}
