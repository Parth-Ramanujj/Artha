import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { SalesAgentService } from './sales-agent.service';
import {
  AddProspectsDto,
  ConversationStatusDto,
  DiscoverDto,
  EditOutboxDto,
  UpdateSalesAgentConfigDto,
} from './dto/sales-agent.dto';

/** Sales agent: business-wide (it can use any of the business's numbers), so session-restricted keys are fenced out. */
@ApiTags('sales-agent')
@Controller('sales-agent')
@RequireActiveBusiness()
@RequireUnscopedKey()
export class SalesAgentController {
  constructor(
    private readonly agent: SalesAgentService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  @Get('overview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Pipeline counts, channel status and what needs a person' })
  async overview(@CurrentApiKey() apiKey: ApiKey) {
    return this.agent.overview(await this.businessId(apiKey));
  }

  @Get('config')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Sales agent settings and the channels this build includes' })
  async getConfig(@CurrentApiKey() apiKey: ApiKey) {
    return {
      config: await this.agent.getConfig(await this.businessId(apiKey)),
      channels: this.agent.availableChannels(),
    };
  }

  @Put('config')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update settings. Turning approval off needs confirm: "autopilot"' })
  async updateConfig(@CurrentApiKey() apiKey: ApiKey, @Body() dto: UpdateSalesAgentConfigDto) {
    return this.agent.updateConfig(await this.businessId(apiKey), dto);
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Run one cycle now (read replies, profile, write, send)' })
  async run(@CurrentApiKey() apiKey: ApiKey) {
    return this.agent.runNow(await this.businessId(apiKey));
  }

  @Get('companies')
  @RequireRole(ApiKeyRole.OPERATOR)
  async companies(@CurrentApiKey() apiKey: ApiKey) {
    return this.agent.listCompanies(await this.businessId(apiKey));
  }

  @Post('discover')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Find businesses on OpenStreetMap (free) and add them as companies' })
  async discover(@CurrentApiKey() apiKey: ApiKey, @Body() dto: DiscoverDto) {
    return this.agent.discover(await this.businessId(apiKey), dto);
  }

  @Get('prospects')
  @RequireRole(ApiKeyRole.OPERATOR)
  async prospects(@CurrentApiKey() apiKey: ApiKey, @Query('status') status?: string) {
    return this.agent.listProspects(await this.businessId(apiKey), status);
  }

  @Post('prospects')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Add prospects by hand (phone with country code and/or email)' })
  async addProspects(@CurrentApiKey() apiKey: ApiKey, @Body() dto: AddProspectsDto) {
    return this.agent.addProspects(await this.businessId(apiKey), dto.prospects);
  }

  @Delete('prospects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole(ApiKeyRole.OPERATOR)
  async removeProspect(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.agent.removeProspect(await this.businessId(apiKey), id);
  }

  @Get('outbox')
  @RequireRole(ApiKeyRole.OPERATOR)
  async outbox(@CurrentApiKey() apiKey: ApiKey, @Query('status') status?: string) {
    return this.agent.listOutbox(await this.businessId(apiKey), status);
  }

  @Post('outbox/approve-all')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Approve every pending message except ones autopilot held for review' })
  async approveAll(@CurrentApiKey() apiKey: ApiKey) {
    return this.agent.approveAll(await this.businessId(apiKey));
  }

  @Post('outbox/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  async approve(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.agent.approve(await this.businessId(apiKey), id);
  }

  @Post('outbox/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  async reject(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.agent.reject(await this.businessId(apiKey), id);
  }

  @Put('outbox/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Edit a message waiting for review (does not approve it)' })
  async edit(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditOutboxDto) {
    return this.agent.edit(await this.businessId(apiKey), id, dto);
  }

  @Get('conversations')
  @RequireRole(ApiKeyRole.OPERATOR)
  async conversations(@CurrentApiKey() apiKey: ApiKey) {
    return this.agent.listConversations(await this.businessId(apiKey));
  }

  @Put('conversations/:id/status')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Hand a conversation back to the agent (open), to a person, or close it' })
  async setConversationStatus(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConversationStatusDto,
  ) {
    return this.agent.setConversationStatus(await this.businessId(apiKey), id, dto.status);
  }

  @Get('activity')
  @RequireRole(ApiKeyRole.OPERATOR)
  async activity(@CurrentApiKey() apiKey: ApiKey) {
    return this.agent.listActivity(await this.businessId(apiKey));
  }
}
