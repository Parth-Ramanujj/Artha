import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HookManager } from '../../core/hooks';
import { Session } from '../session/entities/session.entity';
import { BusinessService } from '../business/business.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';
import { LeadService } from './lead.service';

// History replayed on reconnect arrives as message:received too; only recent messages are new leads.
const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000;

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
    if (msg.fromMe || msg.isGroup || msg.isStatusBroadcast || msg.kind !== 'individual') return false;
    if (msg.timestamp && now - msg.timestamp * 1000 > MAX_MESSAGE_AGE_MS) return false;
    return true;
  }

  async capture(sessionId: string, msg: IncomingMessage): Promise<void> {
    const phone = msg.senderPhone || msg.contact?.number || (msg.chatId.endsWith('@c.us') ? msg.chatId : '');
    if (!phone) return;

    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: { id: true, businessId: true },
    });
    const businessId = session?.businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;

    // A burst of messages from one chat must not race into duplicate leads.
    const key = `${businessId}:${phone.replace(/[^0-9]/g, '')}`;
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    try {
      await this.leadService.captureInboundLead({
        businessId,
        sessionId,
        chatId: msg.chatId,
        customerPhone: phone,
        customerName: msg.contact?.pushName || msg.contact?.name,
      });
    } finally {
      this.inFlight.delete(key);
    }
  }
}
