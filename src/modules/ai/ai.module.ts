import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfig } from './entities/ai-config.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { Session } from '../session/entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiConfig, KnowledgeDocument, Session, Message], 'data')],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}

