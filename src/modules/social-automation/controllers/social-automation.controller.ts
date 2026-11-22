import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { dashboardBaseFor, serverOriginFor } from '../../integrations/google/google.controller';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../../auth/guards/business-scope.guard';
import { BusinessService } from '../../business/business.service';
import {
  CreateCommentRuleDto,
  CreateSocialAccountDto,
  CreateSocialPostDto,
  SendSocialMediaDto,
  SocialBroadcastDto,
  SendSocialMessageDto,
  SimulateCommentDto,
  ToggleCommentRuleDto,
  UpdateCommentRuleDto,
  UpdateSocialAccountDto,
  UpdateSocialPostDto,
} from '../dto/social-automation.dto';
import { SocialAutomationService } from '../social-automation.service';
import { SocialInboxService } from '../social-inbox.service';
import type { SocialPlatform } from '../entities/social-automation.entity';

@ApiTags('social-automation')
@Controller('social-automation')
@RequireActiveBusiness()
@RequireUnscopedKey()
export class SocialAutomationController {
  constructor(
    private readonly socialService: SocialAutomationService,
    private readonly businessService: BusinessService,
    private readonly inbox: SocialInboxService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  // --- OVERVIEW ---
  @Get('overview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Social automation statistics and overview' })
  async getOverview(@CurrentApiKey() apiKey: ApiKey) {
    return this.socialService.getOverview(await this.businessId(apiKey));
  }

  // --- ACCOUNTS ---
  @Get('accounts')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'List connected Instagram & Facebook accounts' })
  async listAccounts(@CurrentApiKey() apiKey: ApiKey) {
    return this.socialService.listAccounts(await this.businessId(apiKey));
  }

  @Post('accounts')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Connect Instagram / Facebook account' })
  async createAccount(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateSocialAccountDto) {
    return this.socialService.createAccount(await this.businessId(apiKey), dto);
  }

  @Put('accounts/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update connected account credentials' })
  async updateAccount(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSocialAccountDto,
  ) {
    return this.socialService.updateAccount(await this.businessId(apiKey), id, dto);
  }

  @Delete('accounts/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Disconnect / delete account' })
  async deleteAccount(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.socialService.deleteAccount(await this.businessId(apiKey), id);
    return { success: true };
  }

  @Get('linkedin/connect')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'LinkedIn sign-in link to connect a member profile for posting' })
  async linkedinConnect(@CurrentApiKey() apiKey: ApiKey, @Req() req: Request) {
    return this.socialService.linkedinConnectUrl(
      await this.businessId(apiKey),
      serverOriginFor(req),
      dashboardBaseFor(req),
    );
  }

  @Post('accounts/:id/test')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Verify account token and connection' })
  async testAccount(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.testAccountConnection(await this.businessId(apiKey), id);
  }

  // --- POSTS ---
  @Get('posts')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'List automated & scheduled posts' })
  async listPosts(@CurrentApiKey() apiKey: ApiKey) {
    return this.socialService.listPosts(await this.businessId(apiKey));
  }

  @Post('posts')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create or schedule a social media post' })
  async createPost(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateSocialPostDto) {
    const creator = apiKey?.name || 'user';
    return this.socialService.createPost(await this.businessId(apiKey), dto, creator);
  }

  @Put('posts/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update post caption, media or schedule' })
  async updatePost(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSocialPostDto,
  ) {
    return this.socialService.updatePost(await this.businessId(apiKey), id, dto);
  }

  @Post('posts/:id/publish-now')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Publish post immediately to Instagram or Facebook' })
  async publishPostNow(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.socialService.publishPostNow(await this.businessId(apiKey), id);
  }

  @Delete('posts/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Delete scheduled or draft post' })
  async deletePost(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.socialService.deletePost(await this.businessId(apiKey), id);
    return { success: true };
  }

  // --- RULES ---
  @Get('rules')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'List comment auto-reply & like rules' })
  async listRules(@CurrentApiKey() apiKey: ApiKey) {
    return this.socialService.listRules(await this.businessId(apiKey));
  }

  @Post('rules')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Create auto-reply & like rule' })
  async createRule(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateCommentRuleDto) {
    return this.socialService.createRule(await this.businessId(apiKey), dto);
  }

  @Put('rules/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update auto-reply & like rule' })
  async updateRule(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentRuleDto,
  ) {
    return this.socialService.updateRule(await this.businessId(apiKey), id, dto);
  }

  @Patch('rules/:id/toggle')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Enable or disable rule' })
  async toggleRule(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleCommentRuleDto,
  ) {
    return this.socialService.toggleRule(await this.businessId(apiKey), id, dto.enabled);
  }

  @Delete('rules/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Delete comment rule' })
  async deleteRule(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.socialService.deleteRule(await this.businessId(apiKey), id);
    return { success: true };
  }

  // --- SIMULATION & LOGS ---
  @Post('simulate-comment')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Simulate comment text against rules for instant testing' })
  async simulateComment(@CurrentApiKey() apiKey: ApiKey, @Body() dto: SimulateCommentDto) {
    return this.socialService.simulateComment(await this.businessId(apiKey), dto);
  }

  @Get('logs')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'List comment activity logs' })
  async listLogs(@CurrentApiKey() apiKey: ApiKey, @Query('limit') limit?: string) {
    return this.socialService.listLogs(await this.businessId(apiKey), Number(limit) || 50);
  }

  // --- INBOX (Instagram DMs, Messenger) ---
  @Get('inbox')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Instagram or Facebook conversations, newest first' })
  async listInbox(@CurrentApiKey() apiKey: ApiKey, @Query('platform') platform: string) {
    const p: SocialPlatform = platform === 'facebook' ? 'facebook' : 'instagram';
    return this.inbox.listThreads(await this.businessId(apiKey), p);
  }

  @Get('inbox/broadcast-audience')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'How many Instagram / Facebook customers a broadcast would reach now (24-hour window)' })
  async broadcastAudience(@CurrentApiKey() apiKey: ApiKey, @Query('platform') platform: string) {
    const p: SocialPlatform = platform === 'facebook' ? 'facebook' : 'instagram';
    return { count: (await this.inbox.broadcastAudience(await this.businessId(apiKey), p)).length };
  }

  @Post('inbox/broadcast')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: "Message every Instagram / Facebook customer inside Meta's 24-hour window" })
  async broadcast(@CurrentApiKey() apiKey: ApiKey, @Body() dto: SocialBroadcastDto) {
    return this.inbox.broadcast(await this.businessId(apiKey), dto.platform, dto.text);
  }

  @Get('inbox/:accountId/:threadId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Messages of one Instagram / Facebook conversation' })
  async listInboxMessages(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.inbox.listMessages(await this.businessId(apiKey), accountId, threadId);
  }

  @Post('inbox/:accountId/:threadId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Reply in an Instagram / Facebook conversation' })
  async sendInboxMessage(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('threadId') threadId: string,
    @Body() dto: SendSocialMessageDto,
  ) {
    return this.inbox.sendMessage(await this.businessId(apiKey), accountId, threadId, dto.text);
  }

  @Post('inbox/:accountId/:threadId/media')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send a photo, video, audio or file in an Instagram / Facebook conversation' })
  async sendInboxMedia(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('threadId') threadId: string,
    @Body() dto: SendSocialMediaDto,
  ) {
    return this.inbox.sendMedia(await this.businessId(apiKey), accountId, threadId, dto);
  }
}
