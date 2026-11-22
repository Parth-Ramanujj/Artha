import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToStrictBoolean } from '../../../common/utils/strict-boolean';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ConnectShopifyDto {
  @ApiProperty({ example: 'my-shop.myshopify.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  shopDomain: string;

  @ApiProperty({ description: 'Client ID of the Dev Dashboard app installed on the store' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  clientId: string;

  @ApiPropertyOptional({ description: 'Client secret (also verifies webhooks). Leave empty to keep the saved one.' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  clientSecret?: string;

  @ApiPropertyOptional({ description: 'Only for older admin-created custom apps: their Admin API access token' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  accessToken?: string;
}

export class ShopifyRecoveryDto {
  @ApiPropertyOptional()
  @ToStrictBoolean()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: [15, 30, 60, 120, 240, 720, 1440] })
  @IsInt()
  @IsIn([15, 30, 60, 120, 240, 720, 1440])
  @IsOptional()
  delayMinutes?: number;

  @ApiPropertyOptional({ example: 'COMEBACK10', description: 'A discount code you created in Shopify' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  discountCode?: string;

  @ApiPropertyOptional({ description: 'Placeholders: {{first_name}} {{checkout_url}} {{total}} {{discount_code}}' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  messageTemplate?: string;

  @ApiPropertyOptional({ description: 'WhatsApp number (session id) that sends the reminders' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({ example: '91', description: 'Added to phone numbers saved without a country code' })
  @Matches(/^\d{1,4}$/)
  @IsOptional()
  defaultCountryCode?: string;
}

export class ShopifyTestDto {
  @ApiProperty({ example: '919876543210' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;
}
