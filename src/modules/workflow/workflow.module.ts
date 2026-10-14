import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { Session } from '../session/entities/session.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor } from './workflow-executor.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowController } from './workflow.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageModule } from '../message/message.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowDefinition, WorkflowRun, Session], 'data'),
    ConversationModule,
    MessageModule,
    AiModule,
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowExecutor, WorkflowTriggerService],
  exports: [WorkflowService, WorkflowExecutor],
})
export class WorkflowModule {}
