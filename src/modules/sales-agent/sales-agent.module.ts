import { DynamicModule, Module, Type } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageModule } from '../message/message.module';
import { IntegrationModule } from '../integrations/integration.module';
import {
  SalesActivity,
  SalesAgentConfig,
  SalesCompany,
  SalesConversation,
  SalesOutboxItem,
  SalesProspect,
} from './entities/sales-agent.entity';
import { SALES_CHANNELS, SalesChannel } from './channels/sales-channel';
import { WhatsAppSalesChannel } from './channels/whatsapp.channel';
import { EmailSalesChannel } from './channels/email.channel';
import { SalesAgentService } from './sales-agent.service';
import { SalesAgentController } from './sales-agent.controller';
import { SalesDiscoveryService } from './discovery.service';
import { SalesWriterService } from './writer.service';
import { SalesSenderService } from './sender.service';
import { SalesReplyHandlerService } from './reply-handler.service';

/**
 * Autonomous sales agent (a port of Harvey): finds businesses, writes personal outreach, sends it over
 * WhatsApp and/or email from an approval outbox, and answers replies.
 *
 * Switches (env, read at startup):
 * - SALES_AGENT_ENABLED=false        → the whole module is left out (see app.module.ts)
 * - SALES_AGENT_EMAIL_ENABLED=false  → the email channel (SMTP + IMAP) is left out of the build;
 *                                      WhatsApp keeps working. Per business, email can also be
 *                                      switched off at runtime in the dashboard settings.
 */
@Module({})
export class SalesAgentModule {
  static register(): DynamicModule {
    const emailEnabled = process.env.SALES_AGENT_EMAIL_ENABLED !== 'false';
    // Order is the preference when a prospect can be reached on more than one channel.
    const channels: Type<SalesChannel>[] = [WhatsAppSalesChannel, ...(emailEnabled ? [EmailSalesChannel] : [])];
    return {
      module: SalesAgentModule,
      imports: [
        TypeOrmModule.forFeature(
          [SalesAgentConfig, SalesCompany, SalesProspect, SalesOutboxItem, SalesConversation, SalesActivity],
          'data',
        ),
        AiModule,
        BusinessModule,
        ConversationModule,
        MessageModule,
        ...(emailEnabled ? [IntegrationModule] : []),
      ],
      controllers: [SalesAgentController],
      providers: [
        ...channels,
        { provide: SALES_CHANNELS, useFactory: (...list: SalesChannel[]) => list, inject: channels },
        SalesDiscoveryService,
        SalesWriterService,
        SalesSenderService,
        SalesReplyHandlerService,
        SalesAgentService,
      ],
    };
  }
}
