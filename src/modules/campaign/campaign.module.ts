import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledMessage } from './entities/scheduled-message.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignRecipient } from './entities/campaign-recipient.entity';
import { ContactConsent } from './entities/contact-consent.entity';
import { Template } from '../template/entities/template.entity';
import { CampaignService } from './campaign.service';
import { ScheduledMessageController, CampaignController, ConsentController } from './campaign.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduledMessage, Campaign, CampaignRecipient, ContactConsent, Template], 'data')],
  controllers: [ScheduledMessageController, CampaignController, ConsentController],
  providers: [CampaignService],
  exports: [CampaignService],
})
export class CampaignModule {}
