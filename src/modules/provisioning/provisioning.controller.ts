import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AuthService } from '../auth/auth.service';
import { BusinessService } from '../business/business.service';
import { UpdateBusinessDto } from '../business/dto/update-business.dto';
import { CreateTenantDto, CreateTenantKeyDto } from './dto/provisioning.dto';

/**
 * Tenant provisioning for partner integrations.
 *
 * Every endpoint requires an **unscoped ADMIN** key — the platform owner's key,
 * never a tenant's own key. Each tenant receives its own scoped key(s) that
 * isolate it from other tenants via `businessId`.
 */
@ApiTags('provisioning')
@Controller('provisioning')
@RequireUnscopedKey()
export class ProvisioningController {
  constructor(
    private readonly businessService: BusinessService,
    private readonly authService: AuthService,
  ) {}

  // ------------------------------------------------------------------ tenants

  @Post('tenants')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Create a new tenant business and its admin API key' })
  @ApiResponse({ status: 201, description: 'Tenant created with API key' })
  @ApiResponse({ status: 409, description: 'Business name or slug already exists' })
  async createTenant(@Body() dto: CreateTenantDto) {
    const business = await this.businessService.create({
      name: dto.businessName,
      slug: dto.slug,
      plan: dto.plan ?? 'free',
    });

    // Business keys can never be ADMIN (AuthService refuses it), so the tenant's first key is an OPERATOR.
    // Roll the business back if the key fails, so a retry with the same name does not hit 409.
    let created: Awaited<ReturnType<AuthService['createApiKey']>>;
    try {
      created = await this.authService.createApiKey({
        name: `${dto.businessName} Owner`,
        role: ApiKeyRole.OPERATOR,
        businessId: business.id,
      });
    } catch (err) {
      await this.businessService.remove(business.id);
      throw err;
    }
    const { apiKey, rawKey } = created;

    return {
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        plan: business.plan,
      },
      apiKey: {
        id: apiKey.id,
        key: rawKey,
        name: apiKey.name,
        role: apiKey.role,
        keyPrefix: apiKey.keyPrefix,
      },
    };
  }

  @Get('tenants')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'List all tenant businesses' })
  async listTenants() {
    return this.businessService.findAll();
  }

  @Get('tenants/:businessId')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Get a single tenant business' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getTenant(@Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.businessService.findOne(businessId);
  }

  @Put('tenants/:businessId')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update a tenant business' })
  async updateTenant(@Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: UpdateBusinessDto) {
    return this.businessService.update(businessId, dto);
  }

  // -------------------------------------------------------------- tenant keys

  @Post('tenants/:businessId/api-keys')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Issue a scoped API key for a tenant' })
  @ApiResponse({ status: 201, description: 'Key created — the raw key is shown only once' })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async createTenantKey(@Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: CreateTenantKeyDto) {
    await this.businessService.findOne(businessId);

    const role = dto.role === 'viewer' ? ApiKeyRole.VIEWER : ApiKeyRole.OPERATOR;

    const { apiKey, rawKey } = await this.authService.createApiKey({
      name: dto.name,
      role,
      businessId,
      allowedFeatures: dto.allowedFeatures,
    });

    return {
      id: apiKey.id,
      key: rawKey,
      name: apiKey.name,
      role: apiKey.role,
      keyPrefix: apiKey.keyPrefix,
      businessId,
    };
  }

  @Get('tenants/:businessId/api-keys')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'List API keys for a tenant' })
  async listTenantKeys(@Param('businessId', ParseUUIDPipe) businessId: string) {
    await this.businessService.findOne(businessId);
    const allKeys = await this.authService.findAll();
    return allKeys.filter(k => k.businessId === businessId);
  }

  @Delete('tenants/:businessId/api-keys/:keyId')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a tenant API key' })
  async deleteTenantKey(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    await this.businessService.findOne(businessId);
    const key = await this.authService.findOne(keyId);
    if (key.businessId !== businessId) {
      throw new NotFoundException('API key not found for this business');
    }
    await this.authService.delete(keyId);
  }
}
