import { Module } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { SessionModule } from '../session/session.module';
import { SocialAutomationModule } from '../social-automation/social-automation.module';
import { IntegrationModule } from '../integrations/integration.module';
import { BusinessModule } from '../business/business.module';

/**
 * Unified platform connection API.
 *
 * Wraps the existing Session, SocialAutomation, and Integration modules behind a
 * single `/api/platforms` namespace for partner apps.
 */
@Module({
  imports: [
    SessionModule,
    SocialAutomationModule,
    IntegrationModule, // IntegrationModule from integrations/ (exports IntegrationService + GoogleWorkspaceService)
    BusinessModule,
  ],
  controllers: [PlatformsController],
})
export class PlatformsModule {}
