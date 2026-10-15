import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from './entities/integration.entity';
import { SyncConfig } from './entities/sync-config.entity';
import { Contact } from '../conversation/entities/contact.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { IntegrationService } from './integration.service';
import { SyncService } from './sync.service';
import { IntegrationController } from './integration.controller';
import { SyncController } from './sync.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Integration, SyncConfig, Contact, Conversation], 'data')],
  controllers: [IntegrationController, SyncController],
  providers: [IntegrationService, SyncService],
  exports: [IntegrationService, SyncService],
})
export class IntegrationModule {}
