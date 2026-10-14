import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { Contact } from './entities/contact.entity';
import { CannedResponse } from './entities/canned-response.entity';
import { AssignmentRule } from './entities/assignment-rule.entity';
import { Notification } from './entities/notification.entity';
import { ContactSegment } from './entities/contact-segment.entity';
import { SlaPolicy } from './entities/sla-policy.entity';
import { SlaEvent } from './entities/sla-event.entity';
import { ConversationService } from './conversation.service';
import { CannedResponseService } from './canned-response.service';
import { AssignmentRuleService } from './assignment-rule.service';
import { NotificationService } from './notification.service';
import { ContactSegmentService } from './contact-segment.service';
import { SlaService } from './sla.service';
import { ConversationController, ContactController, ExportController } from './conversation.controller';
import { CannedResponseController } from './canned-response.controller';
import { AssignmentRuleController } from './assignment-rule.controller';
import { NotificationController } from './notification.controller';
import { ContactSegmentController } from './contact-segment.controller';
import { SlaController } from './sla.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Conversation, Contact, CannedResponse, AssignmentRule, Notification, ContactSegment, SlaPolicy, SlaEvent],
      'data',
    ),
  ],
  controllers: [
    ConversationController,
    ContactController,
    ExportController,
    CannedResponseController,
    AssignmentRuleController,
    NotificationController,
    ContactSegmentController,
    SlaController,
  ],
  providers: [
    ConversationService,
    CannedResponseService,
    AssignmentRuleService,
    NotificationService,
    ContactSegmentService,
    SlaService,
  ],
  exports: [ConversationService, NotificationService, AssignmentRuleService, SlaService],
})
export class ConversationModule {}
