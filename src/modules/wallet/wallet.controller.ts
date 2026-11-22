import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { CurrentApiKey, Public, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { BusinessService } from '../business/business.service';
import { WalletService } from './wallet.service';
import type { WalletTxType } from './entities/wallet-transaction.entity';

class TxQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsIn(['recharge', 'charge', 'adjustment']) type?: WalletTxType;
}

class RechargeOrderDto {
  @IsNumber() @Min(1) @Max(10_000_000) amountInr: number;
}

class VerifyDto {
  @IsString() @IsNotEmpty() @MaxLength(100) orderId: string;
  @IsString() @IsNotEmpty() @MaxLength(100) paymentId: string;
  @IsString() @IsNotEmpty() @MaxLength(200) signature: string;
}

class AlertDto {
  @IsNumber() @Min(0) @Max(10_000_000) lowBalanceAlertInr: number;
}

class RatesDto {
  @IsInt() @Min(0) @Max(100_000) marketing: number;
  @IsInt() @Min(0) @Max(100_000) utility: number;
  @IsInt() @Min(0) @Max(100_000) authentication: number;
  @IsInt() @Min(0) @Max(100_000) service: number;
}

class VolumeTierDto {
  @IsInt() @Min(1) @Max(100_000_000) fromMessages: number;
  @IsInt() @Min(1) @Max(90) discountPercent: number;
}

class VolumeTiersDto {
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => VolumeTierDto) tiers: VolumeTierDto[];
}

class AdminWalletDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() blockWhenEmpty?: boolean;
  /** null = use the platform default rates. */
  @IsOptional() @ValidateNested() @Type(() => RatesDto) ratesPaise?: RatesDto | null;
}

class AdjustDto {
  @IsNumber() @Min(-10_000_000) @Max(10_000_000) amountInr: number;
  @IsString() @MaxLength(200) note: string;
}

/**
 * Customer wallet (balance, Razorpay recharge, history) and the platform admin's controls. The
 * platform admin is an ADMIN key with no business; a customer only ever sees its own business.
 */
@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  private static isPlatformAdmin(apiKey?: ApiKey): boolean {
    return apiKey?.role === ApiKeyRole.ADMIN && !apiKey.businessId;
  }

  private static assertPlatformAdmin(apiKey?: ApiKey) {
    if (!WalletController.isPlatformAdmin(apiKey)) throw new ForbiddenException('Only the platform admin can do this');
  }

  @Get()
  @ApiOperation({ summary: 'Wallet balance, prices per message and whether online recharge is available' })
  async overview(@CurrentApiKey() apiKey: ApiKey) {
    return this.wallet.overview(await this.businessId(apiKey), WalletController.isPlatformAdmin(apiKey));
  }

  @Get('transactions')
  async transactions(@CurrentApiKey() apiKey: ApiKey, @Query() q: TxQueryDto) {
    return this.wallet.transactions(await this.businessId(apiKey), q);
  }

  @Post('recharge/order')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Start a Razorpay recharge; returns the order for the checkout' })
  async createOrder(@CurrentApiKey() apiKey: ApiKey, @Body() dto: RechargeOrderDto) {
    return this.wallet.createRechargeOrder(await this.businessId(apiKey), dto.amountInr);
  }

  @Post('recharge/verify')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Confirm a Razorpay payment (checks the signature) and credit the wallet' })
  async verify(@CurrentApiKey() apiKey: ApiKey, @Body() dto: VerifyDto) {
    return this.wallet.verifyRecharge(await this.businessId(apiKey), dto.orderId, dto.paymentId, dto.signature);
  }

  @Put('alert')
  @RequireRole(ApiKeyRole.OPERATOR)
  async setAlert(@CurrentApiKey() apiKey: ApiKey, @Body() dto: AlertDto) {
    return this.wallet.setLowBalanceAlert(await this.businessId(apiKey), dto.lowBalanceAlertInr);
  }

  /** Razorpay calls this; authenticity comes from the signature, not an API key. */
  @Public()
  @Post('razorpay/webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-razorpay-signature') signature?: string) {
    return this.wallet.handleWebhook(req.rawBody, signature);
  }

  // ── platform admin ──

  @Get('admin/wallets')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  async listWallets(@CurrentApiKey() apiKey: ApiKey) {
    WalletController.assertPlatformAdmin(apiKey);
    return this.wallet.listWallets();
  }

  @Put('admin/wallets/:businessId')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  async updateWallet(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: AdminWalletDto,
  ) {
    WalletController.assertPlatformAdmin(apiKey);
    return this.wallet.updateWallet(businessId, dto);
  }

  @Post('admin/wallets/:businessId/adjust')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  async adjust(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: AdjustDto,
  ) {
    WalletController.assertPlatformAdmin(apiKey);
    return this.wallet.adjust(businessId, dto.amountInr, dto.note);
  }

  @Put('admin/volume-tiers')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  async setVolumeTiers(@CurrentApiKey() apiKey: ApiKey, @Body() dto: VolumeTiersDto) {
    WalletController.assertPlatformAdmin(apiKey);
    return this.wallet.setVolumeTiers(dto.tiers);
  }

  @Put('admin/rates')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  async setRates(@CurrentApiKey() apiKey: ApiKey, @Body() dto: RatesDto) {
    WalletController.assertPlatformAdmin(apiKey);
    return this.wallet.setDefaultRates(dto);
  }
}
