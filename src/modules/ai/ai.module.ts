import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfig } from './entities/ai-config.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { Session } from '../session/entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiAgent } from './entities/ai-agent.entity';
import { AiAgentService } from './ai-agent.service';
import { AiCopilotService } from './ai-copilot.service';
import { AiAgentController } from './ai-agent.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiConfig, KnowledgeDocument, AiAgent, Session, Message], 'data')],
  controllers: [AiController, AiAgentController],
  providers: [AiService, AiAgentService, AiCopilotService],
  exports: [AiService, AiAgentService],
})
export class AiModule {}
