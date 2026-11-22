import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentApiKey, Public, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { serverOriginFor } from '../integrations/google/google.controller';
import { ConnectShopifyDto, ShopifyRecoveryDto, ShopifyTestDto } from './dto/shopify.dto';
import { ShopifyService } from './shopify.service';

@ApiTags('commerce')
@Controller('commerce/shopify')
@RequireActiveBusiness()
@RequireUnscopedKey()
export class ShopifyController {
  constructor(
    private readonly shopify: ShopifyService,
    private readonly businesses: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businesses.getOrCreateDefaultBusiness()).id;
  }

  @Get()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Shopify store, cart recovery settings and results' })
  async overview(@CurrentApiKey() apiKey: ApiKey, @Req() req: Request) {
    return this.shopify.overview(await this.businessId(apiKey), serverOriginFor(req));
  }

  @Post('connect')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Connect (or update) the Shopify store and subscribe its webhooks' })
  async connect(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ConnectShopifyDto, @Req() req: Request) {
    return this.shopify.connect(await this.businessId(apiKey), dto, serverOriginFor(req));
  }

  @Delete()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Disconnect the Shopify store' })
  async disconnect(@CurrentApiKey() apiKey: ApiKey) {
    await this.shopify.disconnect(await this.businessId(apiKey));
    return { success: true };
  }

  @Post('sync')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Copy Shopify products into the product catalog' })
  async sync(@CurrentApiKey() apiKey: ApiKey) {
    return this.shopify.syncCatalog(await this.businessId(apiKey));
  }

  @Put('recovery')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Abandoned-cart WhatsApp reminder settings' })
  async recovery(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ShopifyRecoveryDto, @Req() req: Request) {
    return this.shopify.saveRecovery(await this.businessId(apiKey), dto, serverOriginFor(req));
  }

  @Post('recovery/test')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Send the reminder with sample details to a phone number' })
  async test(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ShopifyTestDto) {
    return this.shopify.sendTest(await this.businessId(apiKey), dto.phone);
  }
}

/** Shopify webhook deliveries (checkouts and orders), signed with the store's app client secret. */
@ApiExcludeController()
@Controller('commerce/shopify/webhook')
export class ShopifyWebhookController {
  // shortcut: recent delivery ids kept in memory (one API instance) so a repeat delivery is ignored.
  private readonly seen = new Set<string>();

  constructor(private readonly shopify: ShopifyService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-shopify-shop-domain') shop?: string,
    @Headers('x-shopify-topic') topic?: string,
    @Headers('x-shopify-hmac-sha256') hmac?: string,
    @Headers('x-shopify-webhook-id') webhookId?: string,
  ): Promise<{ ok: true }> {
    if (webhookId && this.seen.has(webhookId)) return { ok: true };
    const accepted = await this.shopify.handleWebhook(shop ?? '', topic ?? '', req.rawBody, hmac);
    if (!accepted) throw new UnauthorizedException('Invalid Shopify webhook');
    if (webhookId) {
      this.seen.add(webhookId);
      if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value as string);
    }
    return { ok: true };
  }
}
