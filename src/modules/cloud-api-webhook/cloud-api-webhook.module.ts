import { Module } from '@nestjs/common';
import { CloudApiWebhookController } from './cloud-api-webhook.controller';
import { CloudApiWebhookService } from './cloud-api-webhook.service';

@Module({
  controllers: [CloudApiWebhookController],
  providers: [CloudApiWebhookService],
})
export class CloudApiWebhookModule {}
