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

export const META_BUTTON_TYPES = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'VOICE_CALL', 'COPY_CODE', 'FLOW'] as const;
export type MetaButtonType = (typeof META_BUTTON_TYPES)[number];

export class MetaTemplateButtonDto {
  @ApiProperty({ enum: META_BUTTON_TYPES })
  @IsIn(META_BUTTON_TYPES)
  type: MetaButtonType;

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

  @ApiPropertyOptional({ description: 'COPY_CODE: sample offer code', example: 'SAVE20' })
  @ValidateIf((b: MetaTemplateButtonDto) => b.type === 'COPY_CODE')
  @Matches(/^[A-Za-z0-9_-]{1,15}$/, { message: 'Offer codes: up to 15 letters or numbers' })
  code?: string;

  @ApiPropertyOptional({ description: 'FLOW: the published Meta flow id' })
  @ValidateIf((b: MetaTemplateButtonDto) => b.type === 'FLOW')
  @Matches(/^\d{5,30}$/, { message: 'Choose a published WhatsApp form' })
  flowId?: string;

  @ApiPropertyOptional({ description: 'FLOW: first screen to open' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  flowScreen?: string;
}

export const STUDIO_MEDIA_TYPES = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'] as const;

/** Media sent as base64 (template header samples and campaign header media). */
export class StudioImageUploadDto {
  @ApiProperty({ description: 'File bytes, base64 encoded (image 5 MB, video/PDF 16 MB)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(22_000_000)
  base64: string;

  @ApiProperty({ enum: STUDIO_MEDIA_TYPES })
  @IsIn(STUDIO_MEDIA_TYPES)
  mimetype: (typeof STUDIO_MEDIA_TYPES)[number];

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

  @ApiPropertyOptional({
    enum: ['POSITIONAL', 'NAMED'],
    description: 'Variables as numbers ({{1}}) or names ({{first_name}})',
  })
  @IsOptional()
  @IsIn(['POSITIONAL', 'NAMED'])
  parameterFormat?: 'POSITIONAL' | 'NAMED';

  @ApiPropertyOptional({ enum: ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'] })
  @IsOptional()
  @IsIn(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'])
  headerFormat?: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';

  @ApiPropertyOptional({ description: 'Header text (may hold one variable)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerText?: string;

  @ApiPropertyOptional({ description: 'Sample value for the header variable' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerExample?: string;

  @ApiPropertyOptional({ description: 'Sample image/video/PDF for a media header' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudioImageUploadDto)
  headerMedia?: StudioImageUploadDto;

  @ApiPropertyOptional({ description: 'Utility only: drop the message if not delivered within this many seconds' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(43_200)
  ttlSeconds?: number;

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

export class TemplateAdviceDto {
  @ApiProperty({ enum: ['MARKETING', 'UTILITY'] })
  @IsIn(['MARKETING', 'UTILITY'])
  category: 'MARKETING' | 'UTILITY';

  @ApiProperty({ example: 'en' })
  @IsString()
  @MaxLength(10)
  language: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerText?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  footer?: string;

  @ApiPropertyOptional({ type: [String], description: 'Button labels' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  buttons?: string[];

  @ApiPropertyOptional({ enum: ['en', 'gu'], description: 'Language of the explanations' })
  @IsOptional()
  @IsIn(['en', 'gu'])
  explainIn?: 'en' | 'gu';
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
