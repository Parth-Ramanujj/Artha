import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { STUDIO_KINDS } from '../studio-content';
import type { StudioKind } from '../studio-content';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';

export class StudioMessageDto {
  @ApiProperty({ example: 'Welcome message' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: STUDIO_KINDS })
  @IsIn(STUDIO_KINDS as unknown as string[])
  kind: StudioKind;

  @ApiProperty({ description: 'Message content for the kind (text, media, buttons, products, …)' })
  @IsObject()
  content: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'welcome' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  presetKey?: string;

  @ApiPropertyOptional({ description: 'The WhatsApp number it will be sent from (decides what is supported)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}

export class UpdateStudioMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}

export class ValidateStudioMessageDto {
  @ApiProperty({ enum: STUDIO_KINDS })
  @IsIn(STUDIO_KINDS as unknown as string[])
  kind: StudioKind;

  @ApiProperty()
  @IsObject()
  content: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}

export class SessionRefDto {
  @ApiProperty({ description: 'The WhatsApp number to check against' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId: string;
}

export class TemplatesQueryDto extends SessionRefDto {
  @ApiPropertyOptional({ description: 'Reload from Meta instead of the 2-minute cache' })
  @IsOptional()
  @IsIn(['true', 'false'])
  refresh?: string;
}

export class TestSendDto {
  @ApiProperty({ description: 'WhatsApp number to send from' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId: string;

  @ApiProperty({ example: '919876543210', description: 'Recipient phone with country code' })
  @IsString()
  @Matches(/^\+?[\d\s()-]{8,20}$/, { message: 'Enter the phone number with country code' })
  phone: string;

  @ApiProperty({ description: 'The user confirmed this sends a real WhatsApp message' })
  @ToStrictBoolean()
  @IsBoolean()
  confirm: boolean;
}

export class ArchiveStudioMessageDto {
  @ApiPropertyOptional({ description: 'Archive even though automations still use it' })
  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  force?: boolean;
}

export class ListStudioMessagesQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'ready', 'archived', 'active'] })
  @IsOptional()
  @IsIn(['draft', 'ready', 'archived', 'active'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['updated', 'recent'] })
  @IsOptional()
  @IsIn(['updated', 'recent'])
  sort?: 'updated' | 'recent';
}

export class ProductDto {
  @ApiProperty({ example: 'Cotton Kurta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'KUR-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Clothing' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiProperty({ example: 499 })
  @ToStrictNumber()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price: number;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter code like INR' })
  currency?: string;

  @ApiPropertyOptional({ example: 'https://shop.example.com/kurta.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'https://shop.example.com/kurta' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  productUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: 'Content id of this product in your Meta commerce catalog' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  retailerId?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(64) sku?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @ToStrictNumber() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) price?: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter code like INR' }) currency?: string;
  @IsOptional() @IsString() @MaxLength(2000) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) productUrl?: string;
  @IsOptional() @ToStrictBoolean() @IsBoolean() inStock?: boolean;
  @IsOptional() @IsString() @MaxLength(100) retailerId?: string;
  @IsOptional() @ToStrictBoolean() @IsBoolean() archived?: boolean;
}

export class ProductQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @ToStrictNumber()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 24 })
  @IsOptional()
  @ToStrictNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Include archived products' })
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;
}

export class StudioSettingsDto {
  @ApiPropertyOptional({ description: 'Meta commerce catalog id connected to your WhatsApp Business account' })
  @IsOptional()
  @Matches(/^(\d{5,30})?$/, { message: 'The catalog id is a number from Meta Commerce Manager' })
  metaCatalogId?: string;
}
