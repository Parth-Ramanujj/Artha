import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from './entities/integration.entity';
import { SyncConfig } from './entities/sync-config.entity';
import { IntegrationService } from './integration.service';
import { SyncService } from './sync.service';
import { IntegrationController } from './integration.controller';
import { SyncController } from './sync.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Integration, SyncConfig], 'data')],
  controllers: [IntegrationController, SyncController],
  providers: [IntegrationService, SyncService],
  exports: [IntegrationService, SyncService],
})
export class IntegrationModule {}
