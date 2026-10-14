import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import {
  CreateScheduledMessageDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  AddCampaignRecipientsDto,
  UpdateConsentDto,
  ScheduleCampaignDto,
} from './dto/campaign.dto';
import { RequireRole, CurrentApiKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { ScheduledMessageStatus } from './entities/scheduled-message.entity';
import { CampaignStatus } from './entities/campaign.entity';
import { RecipientStatus } from './entities/campaign-recipient.entity';
import { ConsentStatus } from './entities/contact-consent.entity';

@ApiTags('scheduled-messages')
@Controller('scheduled-messages')
@RequireActiveBusiness()
export class ScheduledMessageController {
  constructor(private readonly campaignService: CampaignService) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Schedule a message for future delivery' })
  async create(@Body() dto: CreateScheduledMessageDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.createScheduledMessage(this.getBusinessId(apiKey), dto, apiKey?.id);
  }

  @Get()
  @ApiOperation({ summary: 'List scheduled messages' })
  @ApiQuery({ name: 'status', required: false, enum: ScheduledMessageStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: ScheduledMessageStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campaignService.findScheduledMessages(this.getBusinessId(apiKey), {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post(':id/cancel')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Cancel a scheduled message' })
  @ApiParam({ name: 'id' })
  async cancel(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.cancelScheduledMessage(id, this.getBusinessId(apiKey));
  }
}

@ApiTags('campaigns')
@Controller('campaigns')
@RequireActiveBusiness()
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a campaign' })
  async create(@Body() dto: CreateCampaignDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.createCampaign(this.getBusinessId(apiKey), dto, apiKey?.id);
  }

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  @ApiQuery({ name: 'status', required: false, enum: CampaignStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: CampaignStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campaignService.findCampaigns(this.getBusinessId(apiKey), {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.findOneCampaign(id, this.getBusinessId(apiKey));
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a draft campaign' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.updateCampaign(id, this.getBusinessId(apiKey), dto);
  }

  @Post(':id/start')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Start sending a campaign now' })
  @ApiParam({ name: 'id' })
  async start(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.startCampaign(id, this.getBusinessId(apiKey));
  }

  @Post(':id/schedule')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Schedule a campaign' })
  @ApiParam({ name: 'id' })
  async schedule(@Param('id') id: string, @Body() dto: ScheduleCampaignDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.scheduleCampaign(id, this.getBusinessId(apiKey), dto);
  }

  @Post(':id/pause')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Pause a running campaign' })
  @ApiParam({ name: 'id' })
  async pause(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.pauseCampaign(id, this.getBusinessId(apiKey));
  }

  @Post(':id/cancel')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Cancel a campaign' })
  @ApiParam({ name: 'id' })
  async cancelCampaign(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.cancelCampaign(id, this.getBusinessId(apiKey));
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft campaign' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    await this.campaignService.deleteCampaign(id, this.getBusinessId(apiKey));
  }

  @Post(':id/recipients')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Add recipients to a campaign' })
  @ApiParam({ name: 'id' })
  async addRecipients(@Param('id') id: string, @Body() dto: AddCampaignRecipientsDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.campaignService.addRecipients(id, this.getBusinessId(apiKey), dto);
  }

  @Get(':id/recipients')
  @ApiOperation({ summary: 'List campaign recipients' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'status', required: false, enum: RecipientStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findRecipients(
    @Param('id') id: string,
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: RecipientStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campaignService.findRecipients(id, this.getBusinessId(apiKey), {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}

@ApiTags('consent')
@Controller('consent')
@RequireActiveBusiness()
export class ConsentController {
  constructor(private readonly campaignService: CampaignService) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Get()
  @ApiOperation({ summary: 'List consent records' })
  @ApiQuery({ name: 'status', required: false, enum: ConsentStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: ConsentStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campaignService.findConsents(this.getBusinessId(apiKey), {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':waContactId')
  @ApiOperation({ summary: 'Get consent status for a contact' })
  @ApiParam({ name: 'waContactId' })
  @ApiQuery({ name: 'channel', required: false })
  async getConsent(
    @Param('waContactId') waContactId: string,
    @CurrentApiKey() apiKey: ApiKey,
    @Query('channel') channel?: string,
  ) {
    const consent = await this.campaignService.getConsent(
      this.getBusinessId(apiKey),
      waContactId,
      channel ?? 'whatsapp',
    );
    return consent ?? { status: 'unknown', waContactId };
  }

  @Put(':waContactId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update consent status for a contact' })
  @ApiParam({ name: 'waContactId' })
  @ApiQuery({ name: 'channel', required: false })
  async updateConsent(
    @Param('waContactId') waContactId: string,
    @Body() dto: UpdateConsentDto,
    @CurrentApiKey() apiKey: ApiKey,
    @Query('channel') channel?: string,
  ) {
    return this.campaignService.updateConsent(this.getBusinessId(apiKey), waContactId, dto, channel ?? 'whatsapp');
  }
}
