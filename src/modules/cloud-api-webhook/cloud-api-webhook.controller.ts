import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Query, Body, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { createLogger } from '../../common/services/logger.service';
import { Public } from '../auth/decorators/auth.decorators';
import { CloudApiWebhookService } from './cloud-api-webhook.service';

@Controller('cloud-api/webhook')
export class CloudApiWebhookController {
  private readonly logger = createLogger('CloudApiWebhookController');
  private readonly verifyToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookService: CloudApiWebhookService,
  ) {
    this.verifyToken = this.configService.get<string>('engine.cloudApi.verifyToken') ?? '';
  }

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: express.Response,
  ): void {
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('Cloud API webhook verified', {
        action: 'cloud_api_webhook_verified',
      });
      res.status(HttpStatus.OK).send(challenge);
    } else {
      this.logger.warn('Cloud API webhook verification failed', {
        action: 'cloud_api_webhook_verify_failed',
      });
      res.status(HttpStatus.FORBIDDEN).send('Verification failed');
    }
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  receive(@Body() body: Record<string, unknown>, @Req() req: express.Request): string {
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
    if (this.webhookService.isSignatureValidationEnabled && rawBody) {
      const signature = req.headers['x-hub-signature-256'] as string;
      if (!this.webhookService.validateSignature(rawBody, signature)) {
        this.logger.warn('Cloud API webhook signature validation failed', {
          action: 'cloud_api_webhook_sig_failed',
        });
        throw new ForbiddenException('Invalid webhook signature');
      }
    }

    this.webhookService.dispatchToAdapters(body);

    return 'OK';
  }
}
