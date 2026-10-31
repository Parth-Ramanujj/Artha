import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as qrcode from 'qrcode';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { SaveGrowthLinkDto, UpdateGrowthSettingsDto } from './dto/growth.dto';
import { GrowthSchedulerService } from './growth-scheduler.service';
import { GrowthService } from './growth.service';

/** Growth: click-to-chat links/QR, greetings, owner summary, compliance, voice actions. Business-wide. */
@ApiTags('growth')
@Controller('growth')
@RequireActiveBusiness()
@RequireUnscopedKey()
export class GrowthController {
  constructor(
    private readonly growth: GrowthService,
    private readonly scheduler: GrowthSchedulerService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  @Get('settings')
  @RequireRole(ApiKeyRole.OPERATOR)
  async getSettings(@CurrentApiKey() apiKey: ApiKey) {
    return this.growth.getSettings(await this.businessId(apiKey));
  }

  @Put('settings')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateSettings(@CurrentApiKey() apiKey: ApiKey, @Body() dto: UpdateGrowthSettingsDto) {
    return this.growth.updateSettings(await this.businessId(apiKey), dto);
  }

  // ── Links ──

  @Get('links')
  @RequireRole(ApiKeyRole.OPERATOR)
  async listLinks(@CurrentApiKey() apiKey: ApiKey) {
    return this.growth.listLinks(await this.businessId(apiKey));
  }

  @Post('links')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a trackable click-to-chat link (QR code / website widget)' })
  async createLink(@CurrentApiKey() apiKey: ApiKey, @Body() dto: SaveGrowthLinkDto) {
    return this.growth.saveLink(await this.businessId(apiKey), dto);
  }

  @Put('links/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateLink(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveGrowthLinkDto,
  ) {
    return this.growth.saveLink(await this.businessId(apiKey), dto, id);
  }

  @Delete('links/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async deleteLink(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.growth.deleteLink(await this.businessId(apiKey), id);
    return { deleted: true };
  }

  @Get('links/:id/qr.svg')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'QR code (SVG) for a link; pass the public base URL the QR should point at' })
  async qr(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('base') base: string | undefined,
    @Res() res: Response,
  ) {
    const link = await this.growth.getLink(await this.businessId(apiKey), id);
    const origin = /^https?:\/\/[^/\s]+$/i.test(base ?? '') ? base : `${res.req.protocol}://${res.req.get('host')}`;
    const svg = await qrcode.toString(`${origin}/api/g/${link.ref}`, { type: 'svg', margin: 2, width: 512 });
    res.type('image/svg+xml').send(svg);
  }

  // ── Greetings / summary ──

  @Get('greetings')
  @RequireRole(ApiKeyRole.OPERATOR)
  async greetings(@CurrentApiKey() apiKey: ApiKey) {
    return this.growth.recentGreetings(await this.businessId(apiKey));
  }

  @Get('summary/preview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: "Today's owner summary, without sending it" })
  async previewSummary(@CurrentApiKey() apiKey: ApiKey) {
    return this.scheduler.composeSummary(await this.growth.getSettings(await this.businessId(apiKey)));
  }

  @Post('summary/send')
  @RequireRole(ApiKeyRole.OPERATOR)
  async sendSummary(@CurrentApiKey() apiKey: ApiKey) {
    return this.scheduler.sendSummary(await this.growth.getSettings(await this.businessId(apiKey)));
  }

  // ── Compliance ──

  @Get('compliance')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Estimated sender health, opt-ins/opt-outs and opt-in proof' })
  async compliance(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.growth.compliance(await this.businessId(apiKey), Math.min(90, Math.max(1, days)));
  }
}
