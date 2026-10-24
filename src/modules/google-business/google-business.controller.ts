import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { GoogleBusinessService } from './google-business.service';

/** Google Business Profile: reviews, AI replies, review requests and posts. Business-wide, so unscoped keys only. */
@ApiTags('google-business')
@Controller('google-business')
@RequireActiveBusiness()
@RequireUnscopedKey()
export class GoogleBusinessController {
  constructor(
    private readonly gbp: GoogleBusinessService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  private by(apiKey?: ApiKey): string {
    return apiKey?.name ? `user:${apiKey.name}` : 'user';
  }

  @Get('overview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Rating, review counts and reply stats' })
  async overview(@CurrentApiKey() apiKey: ApiKey) {
    return this.gbp.overview(await this.businessId(apiKey));
  }

  @Get('config')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Automation settings and the Google Business connections to pick from' })
  async getConfig(@CurrentApiKey() apiKey: ApiKey) {
    const businessId = await this.businessId(apiKey);
    return { config: await this.gbp.getConfig(businessId), connections: await this.gbp.connections(businessId) };
  }

  @Put('config')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update automation settings' })
  async updateConfig(@CurrentApiKey() apiKey: ApiKey, @Body() body: Record<string, unknown>) {
    return this.gbp.updateConfig(await this.businessId(apiKey), body ?? {});
  }

  @Get('accounts')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Business Profile accounts of the chosen Google connection' })
  async accounts(@CurrentApiKey() apiKey: ApiKey, @Query('integrationId') integrationId?: string) {
    return this.gbp.accounts(await this.businessId(apiKey), integrationId);
  }

  @Get('locations')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Locations of a Business Profile account' })
  async locations(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('account') account: string,
    @Query('integrationId') integrationId?: string,
  ) {
    return this.gbp.locations(await this.businessId(apiKey), String(account ?? ''), integrationId);
  }

  @Post('sync')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Fetch reviews now, then draft, auto-reply and alert' })
  async sync(@CurrentApiKey() apiKey: ApiKey) {
    return this.gbp.syncNow(await this.businessId(apiKey));
  }

  @Get('reviews')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Reviews, newest first' })
  async reviews(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: string,
    @Query('stars') stars?: string,
    @Query('location') location?: string,
    @Query('search') search?: string,
  ) {
    return this.gbp.list(await this.businessId(apiKey), {
      status: status || undefined,
      stars: Number(stars) || undefined,
      location: location || undefined,
      search: search?.trim() || undefined,
    });
  }

  @Post('reviews/publish-all')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Publish every waiting draft' })
  async publishAll(@CurrentApiKey() apiKey: ApiKey) {
    return this.gbp.publishAll(await this.businessId(apiKey), this.by(apiKey));
  }

  @Post('reviews/:id/draft')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Write a new AI draft for a review' })
  async redraft(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.gbp.redraft(await this.businessId(apiKey), id);
  }

  @Put('reviews/:id/draft')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Save an edited draft without publishing it' })
  async saveDraft(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { text?: string },
  ) {
    return this.gbp.saveDraft(await this.businessId(apiKey), id, String(body?.text ?? ''));
  }

  @Post('reviews/:id/publish')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Publish the reply (the given text, or the saved draft) on Google' })
  async publish(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { text?: string },
  ) {
    const text = typeof body?.text === 'string' ? body.text : undefined;
    return this.gbp.publish(await this.businessId(apiKey), id, text, this.by(apiKey));
  }

  @Delete('reviews/:id/reply')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Remove the live reply from Google (kept as a draft)' })
  async deleteReply(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.gbp.deleteReply(await this.businessId(apiKey), id);
  }

  @Post('reviews/:id/skip')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Mark a review as not needing a reply (or undo with {"skipped": false})' })
  async skip(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { skipped?: boolean },
  ) {
    return this.gbp.setSkipped(await this.businessId(apiKey), id, body?.skipped !== false);
  }

  @Post('review-requests')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Ask customers for a Google review over WhatsApp' })
  async requestReviews(
    @CurrentApiKey() apiKey: ApiKey,
    @Body()
    body: {
      sessionId?: string;
      locationName?: string;
      message?: string;
      contacts?: Array<{ name?: string; phone?: string }>;
    },
  ) {
    return this.gbp.requestReviews(await this.businessId(apiKey), body ?? {});
  }

  @Post('posts/write')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Let the AI write a profile post' })
  async writePost(@CurrentApiKey() apiKey: ApiKey, @Body() body: { topic?: string }) {
    return this.gbp.writePost(await this.businessId(apiKey), String(body?.topic ?? ''));
  }

  @Post('posts')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Publish a post on one or more locations' })
  async createPost(
    @CurrentApiKey() apiKey: ApiKey,
    @Body() body: { summary?: string; url?: string; locationNames?: string[] },
  ) {
    return this.gbp.createPost(await this.businessId(apiKey), body ?? {});
  }
}
