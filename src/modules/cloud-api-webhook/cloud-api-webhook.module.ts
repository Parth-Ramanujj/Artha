import { Module } from '@nestjs/common';
import { CloudApiWebhookController } from './cloud-api-webhook.controller';
import { CloudApiWebhookService } from './cloud-api-webhook.service';
import { WhatsAppLogsModule } from '../whatsapp-logs/whatsapp-logs.module';

@Module({
  imports: [WhatsAppLogsModule],
  controllers: [CloudApiWebhookController],
  providers: [CloudApiWebhookService],
})
export class CloudApiWebhookModule {}
