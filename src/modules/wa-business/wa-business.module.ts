import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from '../business/business.module';
import { ConversationModule } from '../conversation/conversation.module';
import { Session } from '../session/entities/session.entity';
import { AdReferral } from './entities/ad-referral.entity';
import { WaCall } from './entities/wa-call.entity';
import { Invoice } from './entities/invoice.entity';
import { WaBusinessService } from './wa-business.service';
import { WaBusinessController } from './wa-business.controller';

/** Ads leads, WhatsApp calling, quality alerts and invoices. Fed by the Cloud API webhook module. */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdReferral, WaCall, Invoice, Session], 'data'),
    BusinessModule,
    ConversationModule,
  ],
  controllers: [WaBusinessController],
  providers: [WaBusinessService],
  exports: [WaBusinessService],
})
export class WaBusinessModule {}
