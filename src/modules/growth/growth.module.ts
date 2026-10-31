import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { CampaignModule } from '../campaign/campaign.module';
import { ContactConsent } from '../campaign/entities/contact-consent.entity';
import { ConversationModule } from '../conversation/conversation.module';
import { Contact } from '../conversation/entities/contact.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Deal } from '../conversation/entities/deal.entity';
import { Feedback } from '../conversation/entities/feedback.entity';
import { Message } from '../message/entities/message.entity';
import { MessageModule } from '../message/message.module';
import { Session } from '../session/entities/session.entity';
import { Lead } from '../workflow/entities/lead.entity';
import { GrowthGreetingLog, GrowthLink, GrowthSettings } from './entities/growth.entity';
import { GrowthInboundService } from './growth-inbound.service';
import { GrowthPublicController } from './growth-public.controller';
import { GrowthSchedulerService } from './growth-scheduler.service';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';

/**
 * Growth: trackable click-to-chat links (QR + website widget), birthday/anniversary/win-back greetings,
 * the owner's daily WhatsApp summary, opt-in compliance, and voice-note → action.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        GrowthSettings,
        GrowthLink,
        GrowthGreetingLog,
        Session,
        Message,
        Contact,
        Conversation,
        ContactConsent,
        Deal,
        Feedback,
        Lead,
      ],
      'data',
    ),
    AiModule,
    BusinessModule,
    CampaignModule,
    ConversationModule,
    MessageModule,
  ],
  controllers: [GrowthController, GrowthPublicController],
  providers: [GrowthService, GrowthSchedulerService, GrowthInboundService],
})
export class GrowthModule {}
