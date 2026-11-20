import { WhatsAppLogsModule } from '../whatsapp-logs/whatsapp-logs.module';
import { MessageCostsModule } from '../message-costs/message-costs.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { SessionService } from './session.service';
import { SessionLidResolver } from './session-lid-resolver.service';
import { SessionLivenessWatchdog } from './session-liveness-watchdog.service';
import { MessageProjector } from './message-projector.service';
import { SessionErrorStore } from './session-error-store.service';
import { SessionController } from './session.controller';
import { WebhookModule } from '../webhook/webhook.module';
import { StatusStoreModule } from '../status-store/status-store.module';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  // WebhookModule/StatusStoreModule/ConversationModule do not import SessionModule back, so the
  // dependency is one-directional — no forwardRef() needed.
  imports: [
    TypeOrmModule.forFeature([Session, Message], 'data'),
    WebhookModule,
    StatusStoreModule,
    ConversationModule,
    MessageCostsModule,
    WhatsAppLogsModule,
  ],
  controllers: [SessionController],
  providers: [SessionService, SessionErrorStore, SessionLidResolver, SessionLivenessWatchdog, MessageProjector],
  exports: [SessionService, MessageProjector],
})
export class SessionModule {}
