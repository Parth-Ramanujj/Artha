import { Module } from '@nestjs/common';
import { CloudApiWebhookController } from './cloud-api-webhook.controller';
import { CloudApiWebhookService } from './cloud-api-webhook.service';
import { WhatsAppLogsModule } from '../whatsapp-logs/whatsapp-logs.module';
import { WaBusinessModule } from '../wa-business/wa-business.module';

@Module({
  imports: [WhatsAppLogsModule, WaBusinessModule],
  controllers: [CloudApiWebhookController],
  providers: [CloudApiWebhookService],
})
export class CloudApiWebhookModule {}
