import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookManager } from '../../core/hooks';
import { Session } from '../session/entities/session.entity';
import { BusinessService } from '../business/business.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';
import { LeadService } from './lead.service';
import { LeadClassifierService } from './lead-classifier.service';
import { isFreshPersonalMessage, LEAD_MAX_MESSAGE_AGE_MS } from './inbound-message-filter';

@Injectable()
export class LeadCaptureService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('LeadCapture');
  private readonly hookIds: string[] = [];
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly hookManager: HookManager,
    private readonly leadService: LeadService,
    private readonly businessService: BusinessService,
    @InjectRepository(Session, 'data')
    private readonly sessionRepo: Repository<Session>,
    @Optional()
    private readonly engineRegistry?: EngineRegistry,
    @Optional()
    private readonly classifier?: LeadClassifierService,
  ) {}

  onModuleInit(): void {
    this.hookIds.push(
      this.hookManager.register(
        'lead-capture',
        'message:received',
        hookCtx => {
          const msg = hookCtx.data as IncomingMessage;
          if (hookCtx.sessionId && this.isLeadMessage(msg)) {
            void this.capture(hookCtx.sessionId, msg).catch(err =>
              this.logger.error('Lead capture failed', err instanceof Error ? err.message : String(err)),
            );
          }
          return Promise.resolve({ continue: true });
        },
        910,
      ),
    );
  }

  onModuleDestroy(): void {
    for (const id of this.hookIds) this.hookManager.unregister(id);
  }

  isLeadMessage(msg: IncomingMessage, now = Date.now()): boolean {
    return isFreshPersonalMessage(msg, LEAD_MAX_MESSAGE_AGE_MS, now);
  }

  async capture(sessionId: string, msg: IncomingMessage): Promise<void> {
    const createdLeadId = await this.saveLead(sessionId, msg);
    if (!createdLeadId || !this.classifier) return;
    const result = await this.classifier.classify(msg.body ?? '');
    await this.leadService.applyAutoClassification(createdLeadId, result);
    this.logger.log(
      `Lead ${createdLeadId} classified ${result.temperature}/${result.interest} by ${result.classifiedBy}`,
    );
  }

  private async saveLead(sessionId: string, msg: IncomingMessage): Promise<string | null> {
    // A burst of messages from one chat must not race into duplicate leads.
    const key = `${sessionId}:${msg.chatId}`;
    if (this.inFlight.has(key)) return null;
    this.inFlight.add(key);
    try {
      const phone = await this.resolvePhone(sessionId, msg);
      // Without a phone only a privacy-id (@lid) chat is a real person; anything else (e.g. "0@c.us") is noise.
      if (!phone && !msg.chatId.endsWith('@lid')) return null;

      const session = await this.sessionRepo.findOne({
        where: { id: sessionId },
        select: { id: true, businessId: true },
      });
      const businessId = session?.businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;

      const { lead, created } = await this.leadService.captureInboundLead({
        businessId,
        sessionId,
        chatId: msg.chatId,
        customerPhone: phone ?? undefined,
        customerName: msg.contact?.pushName || msg.contact?.name,
        firstMessage: msg.body,
      });
      return created ? lead.id : null;
    } finally {
      this.inFlight.delete(key);
    }
  }

  // Most chats now arrive as @lid privacy ids with no phone; ask the engine before giving up on the number.
  private async resolvePhone(sessionId: string, msg: IncomingMessage): Promise<string | null> {
    const usable = (value: string | null | undefined) => {
      const digits = (value ?? '').replace(/[^0-9]/g, '');
      return digits.length >= 7 ? digits : null;
    };
    const known = usable(msg.senderPhone) ?? (msg.chatId.endsWith('@c.us') ? usable(msg.chatId) : null);
    if (known || msg.chatId.endsWith('@c.us')) return known;
    try {
      return usable(await this.engineRegistry?.get(sessionId)?.resolveContactPhone(msg.chatId));
    } catch {
      return null;
    }
  }
}
