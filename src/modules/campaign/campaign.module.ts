import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledMessage } from './entities/scheduled-message.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignRecipient } from './entities/campaign-recipient.entity';
import { ContactConsent } from './entities/contact-consent.entity';
import { Template } from '../template/entities/template.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { CampaignService } from './campaign.service';
import { ScheduledMessageController, CampaignController, ConsentController } from './campaign.controller';
import { CampaignAnalyticsController } from './campaign-analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [ScheduledMessage, Campaign, CampaignRecipient, ContactConsent, Template, Conversation],
      'data',
    ),
  ],
  controllers: [ScheduledMessageController, CampaignController, ConsentController, CampaignAnalyticsController],
  providers: [CampaignService],
  exports: [CampaignService],
})
export class CampaignModule {}
