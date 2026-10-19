import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { Public, RequireRole, CurrentApiKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { AiCallingService } from './ai-calling.service';
import { CallOutcomeService } from './call-outcome.service';
import { CallRunnerService } from './call-runner.service';
import { DialerService } from './dialer.service';
import { parseContactsFile } from './contacts';
import { isValidTwilioSignature, twilioConfigFromEnv } from './twilio.client';
import { BROWSER_STREAM_PATH } from './media-gateway.service';
import {
  BatchActionDto,
  CreateBatchDto,
  PublicUrlDto,
  QueueCallDto,
  TestCallDto,
  VoiceAgentDto,
} from './dto/ai-calling.dto';
import { createLogger } from '../../common/services/logger.service';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags('ai-calling')
@Controller('ai-calling')
@RequireActiveBusiness()
export class AiCallingController {
  constructor(
    private readonly calling: AiCallingService,
    private readonly outcome: CallOutcomeService,
    private readonly runner: CallRunnerService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  @Get('setup')
  @ApiOperation({ summary: 'Which keys, Twilio and tunnel settings are ready for AI calls' })
  setup() {
    return this.calling.setupStatus();
  }

  @Put('public-url')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Save the public https address (tunnel) Twilio uses to reach this server' })
  async setPublicUrl(@Body() dto: PublicUrlDto) {
    return { publicUrl: await this.calling.setPublicUrl(dto.url) };
  }

  @Get('stats')
  async stats(@CurrentApiKey() apiKey: ApiKey) {
    return this.calling.stats(await this.businessId(apiKey));
  }

  // ── agents ──

  @Get('agents')
  async listAgents(@CurrentApiKey() apiKey: ApiKey) {
    return this.calling.listAgents(await this.businessId(apiKey));
  }

  @Post('agents')
  @RequireRole(ApiKeyRole.OPERATOR)
  async createAgent(@Body() dto: VoiceAgentDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.calling.createAgent(await this.businessId(apiKey), dto);
  }

  @Put('agents/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoiceAgentDto,
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    return this.calling.updateAgent(await this.businessId(apiKey), id, dto);
  }

  @Delete('agents/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAgent(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    await this.calling.deleteAgent(await this.businessId(apiKey), id);
  }

  // ── calls ──

  @Post('calls')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Queue an AI call to one number (e.g. a lead)' })
  async queueCall(@Body() dto: QueueCallDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.calling.queueCall(await this.businessId(apiKey), dto);
  }

  @Get('calls')
  async listCalls(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: string,
    @Query('verified') verified?: string,
    @Query('batchId') batchId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.calling.listCalls(await this.businessId(apiKey), {
      status: status || undefined,
      verified: verified === 'true' ? true : verified === 'false' ? false : undefined,
      batchId: batchId || undefined,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('calls/:id')
  async getCall(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.calling.getCall(await this.businessId(apiKey), id);
  }

  @Post('calls/:id/cancel')
  @RequireRole(ApiKeyRole.OPERATOR)
  async cancelCall(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.calling.cancelCall(await this.businessId(apiKey), id);
  }

  @Post('calls/:id/whatsapp')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: "Send the agent's WhatsApp follow-up to this call's contact" })
  async sendWhatsapp(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.outcome.sendWhatsapp(await this.businessId(apiKey), id);
  }

  // ── lists ──

  @Post('uploads/preview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Read phone numbers and names from an .xlsx or .csv file' })
  async previewUpload(@UploadedFile() file?: { buffer?: Buffer; originalname?: string }) {
    if (!file?.buffer) throw new BadRequestException('Choose an .xlsx or .csv file');
    try {
      return await parseContactsFile(file.originalname ?? 'upload.csv', file.buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Could not read this file');
    }
  }

  @Post('batches')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Start calling a list of numbers' })
  async createBatch(@Body() dto: CreateBatchDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.calling.createBatch(await this.businessId(apiKey), {
      ...dto,
      contacts: dto.contacts.map(c => ({ phone: c.phone, name: c.name ?? null })),
    });
  }

  @Get('batches')
  async listBatches(@CurrentApiKey() apiKey: ApiKey) {
    return this.calling.listBatches(await this.businessId(apiKey));
  }

  @Post('batches/:id/action')
  @RequireRole(ApiKeyRole.OPERATOR)
  async batchAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchActionDto,
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    return this.calling.setBatchStatus(await this.businessId(apiKey), id, dto.action);
  }

  // ── browser test call ──

  @Post('test-call')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Start a test conversation with the agent from the browser microphone' })
  async startTestCall(@Body() dto: TestCallDto, @CurrentApiKey() apiKey: ApiKey) {
    const call = await this.calling.createTestCall(await this.businessId(apiKey), dto.agentId);
    return { callId: call.id, token: this.runner.tokens.issue(call.id, 60_000), path: BROWSER_STREAM_PATH };
  }

  @Get('test-calls')
  async listTestCalls(@CurrentApiKey() apiKey: ApiKey) {
    return this.calling.listTestCalls(await this.businessId(apiKey));
  }
}

/** Twilio's call status callbacks. Public, but every request must carry Twilio's signature. */
@ApiTags('ai-calling')
@Controller('ai-calling/twilio')
export class AiCallingTwilioController {
  private readonly logger = createLogger('AiCallingTwilio');

  constructor(
    private readonly calling: AiCallingService,
    private readonly dialer: DialerService,
    private readonly runner: CallRunnerService,
  ) {}

  /** Every Twilio request carries an HMAC of the exact URL it called; reject anything else. */
  private async assertFromTwilio(body: Record<string, string>, req: express.Request, what: string): Promise<void> {
    const twilio = twilioConfigFromEnv();
    const publicUrl = await this.calling.getPublicUrl();
    const signature = req.headers['x-twilio-signature'];
    if (
      !twilio ||
      !publicUrl ||
      !isValidTwilioSignature(
        twilio.authToken,
        `${publicUrl}${req.originalUrl}`,
        body ?? {},
        typeof signature === 'string' ? signature : undefined,
      )
    ) {
      this.logger.warn(`Rejected a Twilio ${what} request with a bad signature`, {
        signedUrl: publicUrl ? `${publicUrl}${req.originalUrl.replace(/key=[^&]+/, 'key=…')}` : null,
        params: Object.keys(body ?? {})
          .sort()
          .join(','),
      });
      throw new ForbiddenException('Invalid Twilio signature');
    }
  }

  @Public()
  @Post('twiml')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/xml')
  async twiml(
    @Body() body: Record<string, string>,
    @Query('callId') callId: string | undefined,
    @Query('key') key: string | undefined,
    @Req() req: express.Request,
  ): Promise<string> {
    // The URL carries a key only we can make for this call; Twilio's signature is the fallback.
    if (!this.runner.tokens.isCallKey(callId, key)) await this.assertFromTwilio(body, req, 'TwiML');
    return this.dialer.twimlFor(callId);
  }

  /** Twilio Media Stream events for a call; logged, because a stream error is otherwise invisible. */
  @Public()
  @Post('stream-status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async streamStatus(
    @Body() body: Record<string, string>,
    @Query('callId') callId: string | undefined,
    @Query('key') key: string | undefined,
    @Req() req: express.Request,
  ): Promise<void> {
    if (!this.runner.tokens.isCallKey(callId, key)) await this.assertFromTwilio(body, req, 'stream status');
    const event = body?.StreamEvent ?? 'unknown';
    const detail = body?.StreamError ? ` — ${body.StreamError}` : '';
    if (event === 'stream-error') this.logger.warn(`Twilio stream error for call ${callId}${detail}`);
    else this.logger.log(`Twilio stream ${event} for call ${callId}${detail}`);
    await this.dialer.onStreamEvent(callId, event, body?.StreamError);
  }

  @Public()
  @Post('status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async status(@Body() body: Record<string, string>, @Req() req: express.Request): Promise<void> {
    await this.assertFromTwilio(body, req, 'status callback');
    await this.dialer.onTwilioStatus(body);
  }
}
