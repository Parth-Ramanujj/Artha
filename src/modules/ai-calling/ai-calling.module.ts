import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoiceAgent } from './entities/voice-agent.entity';
import { AiCall } from './entities/ai-call.entity';
import { AiCallBatch } from './entities/ai-call-batch.entity';
import { AiCallingSetting } from './entities/ai-calling-setting.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { ContactConsent } from '../campaign/entities/contact-consent.entity';
import { Session } from '../session/entities/session.entity';
import { AiModule } from '../ai/ai.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { MessageModule } from '../message/message.module';
import { ConversationModule } from '../conversation/conversation.module';
import { BusinessModule } from '../business/business.module';
import { AiCallingService } from './ai-calling.service';
import { CallOutcomeService } from './call-outcome.service';
import { CallRunnerService } from './call-runner.service';
import { DialerService } from './dialer.service';
import { MediaGatewayService } from './media-gateway.service';
import { AiCallingController, AiCallingTwilioController } from './ai-calling.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [VoiceAgent, AiCall, AiCallBatch, AiCallingSetting, Conversation, ContactConsent, Session],
      'data',
    ),
    AiModule,
    WorkflowModule,
    MessageModule,
    ConversationModule,
    BusinessModule,
  ],
  controllers: [AiCallingController, AiCallingTwilioController],
  providers: [AiCallingService, CallOutcomeService, CallRunnerService, DialerService, MediaGatewayService],
  exports: [AiCallingService, CallRunnerService],
})
export class AiCallingModule {}
