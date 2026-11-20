import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WebhookModule } from '../webhook/webhook.module';
import { Session } from '../session/entities/session.entity';
import { BusinessModule } from '../business/business.module';
import { SocialAutomationController } from './controllers/social-automation.controller';
import { SocialWebhookController } from './controllers/social-webhook.controller';
import {
  SocialAccount,
  SocialCommentLog,
  SocialCommentRule,
  SocialMessage,
  SocialPost,
} from './entities/social-automation.entity';
import { MetaGraphService } from './services/meta-graph.service';
import { SocialAutomationService } from './social-automation.service';
import { SocialInboxService } from './social-inbox.service';

/**
 * Social Media Automation Module
 * Enables automated scheduled posting to Instagram & Facebook (Meta Graph API)
 * and intelligent auto-replying & auto-liking of comments via webhooks or AI.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [SocialAccount, SocialPost, SocialCommentRule, SocialCommentLog, SocialMessage, Session],
      'data',
    ),
    BusinessModule,
    AiModule,
    ConversationModule,
    WorkflowModule,
    WebhookModule,
  ],
  controllers: [SocialAutomationController, SocialWebhookController],
  providers: [SocialAutomationService, MetaGraphService, SocialInboxService],
  exports: [SocialAutomationService, MetaGraphService],
})
export class SocialAutomationModule {}
