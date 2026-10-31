import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistantLink, CustomerCareSetting, MissedCall } from './entities/customer-care.entity';
import { Session } from '../session/entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Lead } from '../workflow/entities/lead.entity';
import { AiCall } from '../ai-calling/entities/ai-call.entity';
import { AiModule } from '../ai/ai.module';
import { AiCallingModule } from '../ai-calling/ai-calling.module';
import { MessageModule } from '../message/message.module';
import { BusinessModule } from '../business/business.module';
import { CustomerCareService } from './customer-care.service';
import { AssistantService } from './assistant.service';
import { AssistantPublicController, CustomerCareController } from './customer-care.controller';

/** Missed-call follow-up (WhatsApp, then an AI call) and the WhatsApp → web AI assistant link. */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [CustomerCareSetting, MissedCall, AssistantLink, Session, Message, Conversation, Lead, AiCall],
      'data',
    ),
    AiModule,
    AiCallingModule,
    MessageModule,
    BusinessModule,
  ],
  controllers: [CustomerCareController, AssistantPublicController],
  providers: [CustomerCareService, AssistantService],
})
export class CustomerCareModule {}
