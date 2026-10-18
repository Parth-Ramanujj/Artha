import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { Lead } from './entities/lead.entity';
import { Agent } from './entities/agent.entity';
import { FollowupAttempt } from '../conversation/entities/followup-attempt.entity';
import { Session } from '../session/entities/session.entity';
import { ScheduledMessage } from '../campaign/entities/scheduled-message.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor } from './workflow-executor.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowAnalyticsController } from './workflow-analytics.controller';
import { AbTestController } from './ab-test.controller';
import { AbTestService } from './ab-test.service';
import { AbTest } from './entities/ab-test.entity';
import { AgentService } from './agent.service';
import { LeadService } from './lead.service';
import { LeadCaptureService } from './lead-capture.service';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageModule } from '../message/message.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [WorkflowDefinition, WorkflowRun, Session, Lead, Agent, ScheduledMessage, AbTest, FollowupAttempt],
      'data',
    ),
    ConversationModule,
    MessageModule,
    AiModule,
  ],
  controllers: [WorkflowController, WorkflowAnalyticsController, AbTestController],
  providers: [
    WorkflowService,
    WorkflowExecutor,
    WorkflowTriggerService,
    AgentService,
    LeadService,
    LeadCaptureService,
    AbTestService,
  ],
  exports: [WorkflowService, WorkflowExecutor, AgentService, LeadService, AbTestService],
})
export class WorkflowModule {}
