import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../session/entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { Campaign } from '../campaign/entities/campaign.entity';
import { CampaignRecipient } from '../campaign/entities/campaign-recipient.entity';
import { Notification } from '../conversation/entities/notification.entity';
import { BusinessModule } from '../business/business.module';
import { MessageCharge } from './entities/message-charge.entity';
import { MessageCostSetting } from './entities/message-cost-setting.entity';
import { MessageCostsService } from './message-costs.service';
import { MessageCostsController } from './message-costs.controller';

/**
 * WhatsApp message costs. Imported by the session module (to receive status webhooks) and the
 * campaign/studio modules (to attribute sends), so it must not import any of them.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [MessageCharge, MessageCostSetting, Session, Message, Campaign, CampaignRecipient, Notification],
      'data',
    ),
    BusinessModule,
  ],
  controllers: [MessageCostsController],
  providers: [MessageCostsService],
  exports: [MessageCostsService],
})
export class MessageCostsModule {}
