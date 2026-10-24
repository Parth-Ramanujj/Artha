import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppForm } from './entities/whatsapp-form.entity';
import { WhatsAppFormSubmission } from './entities/whatsapp-form-submission.entity';
import { Session } from '../session/entities/session.entity';
import { BusinessModule } from '../business/business.module';
import { WhatsAppFormService } from './whatsapp-form.service';
import { WhatsAppFormController } from './whatsapp-form.controller';

/** WhatsApp Forms: visual builder for Meta WhatsApp Flows (Cloud API numbers only). */
@Module({
  imports: [TypeOrmModule.forFeature([WhatsAppForm, WhatsAppFormSubmission, Session], 'data'), BusinessModule],
  controllers: [WhatsAppFormController],
  providers: [WhatsAppFormService],
  exports: [WhatsAppFormService],
})
export class WhatsAppFormModule {}
