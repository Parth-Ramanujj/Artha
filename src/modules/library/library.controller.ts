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
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { LibraryService } from './library.service';
import {
  LibraryTargetDto,
  SaveLibraryAutomationDto,
  SaveLibraryItemDto,
  ToggleLibraryAutomationDto,
  WriteLibraryPostDto,
} from './dto/library.dto';

/** Library: reusable posts plus scheduled WhatsApp Status posts and messages. Business-wide, so unscoped keys only. */
@ApiTags('library')
@Controller('library')
@RequireActiveBusiness()
@RequireUnscopedKey()
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  @Get('overview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Post counts, active automations and this week’s deliveries' })
  async overview(@CurrentApiKey() apiKey: ApiKey) {
    return this.library.overview(await this.businessId(apiKey));
  }

  @Get('items')
  @RequireRole(ApiKeyRole.OPERATOR)
  async listItems(@CurrentApiKey() apiKey: ApiKey) {
    return this.library.listItems(await this.businessId(apiKey));
  }

  @Post('items')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Save a post (text, or image/video with a caption)' })
  async createItem(@CurrentApiKey() apiKey: ApiKey, @Body() dto: SaveLibraryItemDto) {
    return this.library.saveItem(await this.businessId(apiKey), dto);
  }

  @Put('items/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateItem(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveLibraryItemDto,
  ) {
    return this.library.saveItem(await this.businessId(apiKey), dto, id);
  }

  @Delete('items/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async deleteItem(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.library.deleteItem(await this.businessId(apiKey), id);
    return { deleted: true };
  }

  @Get('items/:id/media')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Stream the post’s image/video' })
  async itemMedia(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimetype } = await this.library.itemMedia(await this.businessId(apiKey), id);
    res.set({ 'Content-Type': mimetype, 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(buffer);
  }

  @Post('items/:id/post')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Post now to WhatsApp Status and/or chats' })
  async postNow(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LibraryTargetDto,
  ) {
    return this.library.postNow(await this.businessId(apiKey), id, dto);
  }

  @Post('write')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Draft post text with AI' })
  async write(@Body() dto: WriteLibraryPostDto) {
    return this.library.writePost(dto);
  }

  @Get('automations')
  @RequireRole(ApiKeyRole.OPERATOR)
  async listAutomations(@CurrentApiKey() apiKey: ApiKey) {
    return this.library.listAutomations(await this.businessId(apiKey));
  }

  @Post('automations')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Schedule posts: once, daily or weekly; several posts rotate one per run' })
  async createAutomation(@CurrentApiKey() apiKey: ApiKey, @Body() dto: SaveLibraryAutomationDto) {
    return this.library.saveAutomation(await this.businessId(apiKey), dto, undefined, apiKey?.id);
  }

  @Put('automations/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateAutomation(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveLibraryAutomationDto,
  ) {
    return this.library.saveAutomation(await this.businessId(apiKey), dto, id);
  }

  @Post('automations/:id/toggle')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  async toggleAutomation(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleLibraryAutomationDto,
  ) {
    return this.library.toggleAutomation(await this.businessId(apiKey), id, dto.enabled);
  }

  @Post('automations/:id/run')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Post the automation’s next item now (schedule unchanged)' })
  async runAutomation(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.runAutomationNow(await this.businessId(apiKey), id);
  }

  @Delete('automations/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async deleteAutomation(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.library.deleteAutomation(await this.businessId(apiKey), id);
    return { deleted: true };
  }

  @Get('runs')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Last 100 deliveries' })
  async runs(@CurrentApiKey() apiKey: ApiKey) {
    return this.library.listRuns(await this.businessId(apiKey));
  }
}
