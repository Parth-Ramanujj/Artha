import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  ValidateIf,
  ValidateNested,
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
  @IsIn(STUDIO_KINDS)
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
  @IsIn(STUDIO_KINDS)
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

export class MetaTemplateButtonDto {
  @ApiProperty({ enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'] })
  @IsIn(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

  @ApiProperty({ example: 'Register Now' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  text: string;

  @ApiPropertyOptional({ description: 'Required for URL buttons', example: 'https://example.com/register' })
  @ValidateIf((b: MetaTemplateButtonDto) => b.type === 'URL')
  @Matches(/^https:\/\/\S+$/, { message: 'URL buttons need an https:// link' })
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({
    description: 'Required for PHONE_NUMBER buttons, with country code',
    example: '+919876543210',
  })
  @ValidateIf((b: MetaTemplateButtonDto) => b.type === 'PHONE_NUMBER')
  @Matches(/^\+?\d{7,15}$/, { message: 'Phone buttons need a number with country code' })
  phone?: string;
}

/** A JPEG/PNG image sent as base64 (header samples and campaign header images). */
export class StudioImageUploadDto {
  @ApiProperty({ description: 'Image bytes, base64 encoded (max 5 MB)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(7_000_000)
  base64: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png'] })
  @IsIn(['image/jpeg', 'image/png'])
  mimetype: 'image/jpeg' | 'image/png';

  @ApiPropertyOptional({ example: 'banner.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  filename?: string;
}

export class UploadStudioImageDto extends StudioImageUploadDto {
  @ApiProperty({ description: 'The Cloud API number the image will be sent from' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId: string;
}

export class CreateMetaTemplateDto extends SessionRefDto {
  @ApiProperty({ example: 'padosi_agent_invite', description: 'Lowercase letters, numbers and underscores' })
  @Matches(/^[a-z0-9_]{1,512}$/, { message: 'Name may only use lowercase letters, numbers and underscores' })
  name: string;

  @ApiProperty({ example: 'en', description: "Meta's language code (en, en_US, hi, gu, …)" })
  @Matches(/^[a-z]{2,3}(_[A-Z]{2})?$/, { message: 'Use a language code such as en, en_US, hi or gu' })
  language: string;

  @ApiProperty({ enum: ['MARKETING', 'UTILITY'] })
  @IsIn(['MARKETING', 'UTILITY'])
  category: 'MARKETING' | 'UTILITY';

  @ApiPropertyOptional({ description: 'Plain text header (no variables)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerText?: string;

  @ApiPropertyOptional({ description: 'Sample image for an image header (instead of headerText)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudioImageUploadDto)
  headerImage?: StudioImageUploadDto;

  @ApiProperty({ description: 'Body with {{1}}, {{2}} … variables' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  body: string;

  @ApiPropertyOptional({ description: 'Sample value for each body variable, in order', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  bodyExamples?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  footer?: string;

  @ApiPropertyOptional({ type: [MetaTemplateButtonDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MetaTemplateButtonDto)
  buttons?: MetaTemplateButtonDto[];

  @ApiPropertyOptional({
    description: 'Send the template to this phone once Meta approves it (only when free: inside its 24h window)',
    example: '916352701839',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  autoTestPhone?: string;
}

export class AutoTestRetryDto extends SessionRefDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language: string;
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
