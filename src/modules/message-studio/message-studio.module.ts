import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudioMessage } from './entities/studio-message.entity';
import { StudioProduct } from './entities/studio-product.entity';
import { StudioSetting } from './entities/studio-setting.entity';
import { Session } from '../session/entities/session.entity';
import { WorkflowDefinition } from '../workflow/entities/workflow-definition.entity';
import { ContactConsent } from '../campaign/entities/contact-consent.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../message/entities/message.entity';
import { MessageModule } from '../message/message.module';
import { BusinessModule } from '../business/business.module';
import { MessageStudioService } from './message-studio.service';
import { MessageStudioController } from './message-studio.controller';

/**
 * Message Studio: reusable WhatsApp messages, the product catalog they draw from, and the sender
 * workflows use. It must not import WorkflowModule — the workflow engine imports this module.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [StudioMessage, StudioProduct, StudioSetting, Session, WorkflowDefinition, ContactConsent, Conversation, Message],
      'data',
    ),
    MessageModule,
    BusinessModule,
  ],
  controllers: [MessageStudioController],
  providers: [MessageStudioService],
  exports: [MessageStudioService],
})
export class MessageStudioModule {}
