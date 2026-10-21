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
import { GoogleWorkspaceService } from './google/google-workspace.service';
import { GoogleController, GoogleOAuthCallbackController } from './google/google.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Integration, SyncConfig, Contact, Conversation], 'data')],
  controllers: [IntegrationController, SyncController, GoogleController, GoogleOAuthCallbackController],
  providers: [IntegrationService, SyncService, GoogleWorkspaceService],
  exports: [IntegrationService, SyncService, GoogleWorkspaceService],
})
export class IntegrationModule {}
