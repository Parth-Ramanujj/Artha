import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { MessageModule } from '../message/message.module';
import { IntegrationModule } from '../integrations/integration.module';
import { GbpConfig, GbpReview } from './entities/google-business.entity';
import { GoogleBusinessService } from './google-business.service';
import { GoogleBusinessController } from './google-business.controller';

/**
 * Google Business Profile automation: review sync, AI replies (approval or autopilot), low-rating
 * WhatsApp alerts, WhatsApp review requests and profile posts. Uses a google_business integration
 * (Integrations → Google Business Profile). Opt-out via GOOGLE_BUSINESS_ENABLED=false.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GbpConfig, GbpReview], 'data'),
    AiModule,
    BusinessModule,
    MessageModule,
    IntegrationModule,
  ],
  controllers: [GoogleBusinessController],
  providers: [GoogleBusinessService],
})
export class GoogleBusinessModule {}
