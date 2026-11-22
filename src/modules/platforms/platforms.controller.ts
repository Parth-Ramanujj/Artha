import {
  BadRequestException,
  Body,
  NotFoundException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { SessionService } from '../session/session.service';
import { EngineType } from '../session/entities/session.entity';
import { BusinessService } from '../business/business.service';
import { SocialAutomationService } from '../social-automation/social-automation.service';
import { IntegrationService } from '../integrations/integration.service';
import { GoogleWorkspaceService } from '../integrations/google/google-workspace.service';
import { ConnectWhatsAppDto, ConnectGoogleDto } from './dto/platforms.dto';
import { CreateSocialAccountDto } from '../social-automation/dto/social-automation.dto';
import { returnOriginFor, serverOriginFor } from '../integrations/google/google.controller';

/**
 * Unified platform connection API.
 *
 * A single namespace (`/api/platforms`) where partner apps can connect, list and
 * disconnect every supported channel (WhatsApp Cloud API, Instagram, Facebook,
 * Telegram, Google Business Profile + Workspace) with a consistent interface.
 */
@ApiTags('platforms')
@Controller('platforms')
@RequireActiveBusiness()
@RequireUnscopedKey()
export class PlatformsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly socialService: SocialAutomationService,
    private readonly integrationService: IntegrationService,
    private readonly googleService: GoogleWorkspaceService,
    private readonly businessService: BusinessService,
  ) {}

  private async resolveBusiness(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  /** A business key only reaches its own business's WhatsApp sessions; the super admin key reaches all. */
  private async findOwnedSession(apiKey: ApiKey, id: string) {
    const session = await this.sessionService.findOne(id);
    if (apiKey.businessId && session.businessId !== apiKey.businessId) {
      throw new NotFoundException(`Session with id '${id}' not found`);
    }
    return session;
  }

  // ------------------------------------------------- unified listing

  @Get('connected')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'List all connected platforms for this business' })
  @ApiResponse({ status: 200, description: 'Connected accounts grouped by platform' })
  async listConnected(@CurrentApiKey() apiKey: ApiKey) {
    const businessId = await this.resolveBusiness(apiKey);

    const [sessions, socialAccounts, integrations] = await Promise.all([
      this.sessionService.findAll(null, {}, businessId),
      this.socialService.listAccounts(businessId),
      this.integrationService.findAll(businessId),
    ]);

    return {
      whatsapp: sessions
        .filter(s => s.engineType === EngineType.CLOUD_API)
        .map(s => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          status: s.status,
          platform: 'whatsapp-cloud-api' as const,
          createdAt: s.createdAt,
        })),
      instagram: socialAccounts
        .filter(a => a.platform === 'instagram')
        .map(a => ({
          id: a.id,
          name: a.accountName,
          accountId: a.accountId,
          status: a.status,
          platform: 'instagram' as const,
          createdAt: a.createdAt,
        })),
      facebook: socialAccounts
        .filter(a => a.platform === 'facebook')
        .map(a => ({
          id: a.id,
          name: a.accountName,
          accountId: a.accountId,
          status: a.status,
          platform: 'facebook' as const,
          createdAt: a.createdAt,
        })),
      telegram: socialAccounts
        .filter(a => a.platform === 'telegram')
        .map(a => ({
          id: a.id,
          name: a.accountName,
          status: a.status,
          platform: 'telegram' as const,
          createdAt: a.createdAt,
        })),
      google: integrations
        .filter(i => i.type.startsWith('google_'))
        .map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          status: i.status,
          platform: i.type,
          createdAt: i.createdAt,
        })),
    };
  }

  // ------------------------------------------------- connect WhatsApp (Cloud API)

  @Post('connect/whatsapp')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Connect an official WhatsApp number via Cloud API' })
  @ApiResponse({ status: 201, description: 'WhatsApp session created' })
  @ApiResponse({ status: 400, description: 'Missing credentials' })
  @ApiResponse({ status: 409, description: 'Session name already exists' })
  async connectWhatsApp(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ConnectWhatsAppDto) {
    const businessId = await this.resolveBusiness(apiKey);
    const session = await this.sessionService.create(
      {
        name: dto.name,
        engineType: 'cloud-api',
        config: {
          cloudApi: {
            accessToken: dto.accessToken,
            phoneNumberId: dto.phoneNumberId,
            wabaId: dto.wabaId,
            appSecret: dto.appSecret,
            verifyToken: dto.verifyToken,
            graphApiVersion: dto.graphApiVersion,
          },
        },
      },
      businessId,
    );

    return {
      id: session.id,
      name: session.name,
      status: session.status,
      platform: 'whatsapp-cloud-api',
      createdAt: session.createdAt,
    };
  }

  // ------------------------------------------------- connect social (Instagram / Facebook / Telegram)

  @Post('connect/social')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Connect an Instagram, Facebook or Telegram account' })
  @ApiResponse({ status: 201, description: 'Social account connected' })
  @ApiResponse({ status: 400, description: 'Invalid credentials or platform' })
  async connectSocial(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateSocialAccountDto) {
    const businessId = await this.resolveBusiness(apiKey);
    const account = await this.socialService.createAccount(businessId, dto);
    return {
      id: account.id,
      name: account.accountName,
      accountId: account.accountId,
      platform: account.platform,
      status: account.status,
      createdAt: account.createdAt,
    };
  }

  // ------------------------------------------------- connect Google (OAuth)

  @Post('connect/google')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Start Google OAuth and get the consent URL' })
  @ApiResponse({ status: 200, description: 'Returns the Google consent URL to redirect the user to' })
  async connectGoogle(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ConnectGoogleDto, @Req() req: Request) {
    return this.googleService.startAuth(
      await this.resolveBusiness(apiKey),
      { services: dto.services, integrationId: null },
      returnOriginFor(req),
      serverOriginFor(req),
    );
  }

  // ------------------------------------------------- test connection

  @Post('test/:platform/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Test a platform connection' })
  async testConnection(@CurrentApiKey() apiKey: ApiKey, @Param('platform') platform: string, @Param('id') id: string) {
    const businessId = await this.resolveBusiness(apiKey);
    switch (platform) {
      case 'whatsapp': {
        const session = await this.findOwnedSession(apiKey, id);
        return { id: session.id, status: session.status, platform: 'whatsapp-cloud-api' };
      }
      case 'instagram':
      case 'facebook':
      case 'telegram':
        return this.socialService.testAccountConnection(businessId, id);
      case 'google':
        return this.integrationService.testConnection(id, businessId);
      default:
        throw new BadRequestException(`Unknown platform: ${platform}`);
    }
  }

  // ------------------------------------------------- disconnect

  @Delete(':platform/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Disconnect / remove a platform account' })
  @ApiResponse({ status: 200, description: 'Disconnected' })
  async disconnect(@CurrentApiKey() apiKey: ApiKey, @Param('platform') platform: string, @Param('id') id: string) {
    const businessId = await this.resolveBusiness(apiKey);
    switch (platform) {
      case 'whatsapp':
        await this.findOwnedSession(apiKey, id);
        await this.sessionService.delete(id);
        break;
      case 'instagram':
      case 'facebook':
      case 'telegram':
        await this.socialService.deleteAccount(businessId, id);
        break;
      case 'google':
        await this.integrationService.disconnect(id, businessId);
        break;
      default:
        throw new BadRequestException(`Unknown platform: ${platform}`);
    }
    return { success: true, platform, id };
  }
}
