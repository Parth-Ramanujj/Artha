import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../session/entities/session.entity';
import { BusinessModule } from '../business/business.module';
import { WhatsAppEvent } from './entities/whatsapp-event.entity';
import { AiConfig } from '../ai/entities/ai-config.entity';
import { WhatsAppLogsService } from './whatsapp-logs.service';
import { WhatsAppHealthService } from './whatsapp-health.service';
import { WhatsAppLogsController } from './whatsapp-logs.controller';

/** Message logs. Imported by the session and Cloud API webhook modules, so it imports neither. */
@Module({
  imports: [TypeOrmModule.forFeature([WhatsAppEvent, Session, AiConfig], 'data'), BusinessModule],
  controllers: [WhatsAppLogsController],
  providers: [WhatsAppLogsService, WhatsAppHealthService],
  exports: [WhatsAppLogsService],
})
export class WhatsAppLogsModule {}
