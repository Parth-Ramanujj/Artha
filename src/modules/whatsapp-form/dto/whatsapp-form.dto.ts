import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { FLOW_CATEGORIES } from '../flow-definition';
import type { FlowCategory } from '../flow-definition';

export class WhatsAppFormDto {
  @ApiProperty({ example: 'Lead form' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ enum: FLOW_CATEGORIES, default: 'OTHER' })
  @IsOptional()
  @IsIn(FLOW_CATEGORIES)
  category?: FlowCategory;

  @ApiProperty({ description: 'Screens and components built in the form builder' })
  @IsObject()
  definition: Record<string, unknown>;
}

export class UpdateWhatsAppFormDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: FLOW_CATEGORIES })
  @IsOptional()
  @IsIn(FLOW_CATEGORIES)
  category?: FlowCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class PublishWhatsAppFormDto {
  @ApiProperty({ description: 'Cloud API WhatsApp number whose WhatsApp Business account hosts the form' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId: string;
}

export class SendWhatsAppFormDto extends PublishWhatsAppFormDto {
  @ApiProperty({ example: '919876543210', description: 'Recipient phone with country code' })
  @IsString()
  @Matches(/^\+?[\d\s()-]{8,20}$/, { message: 'Enter the phone number with country code' })
  phone: string;

  @ApiPropertyOptional({ description: 'Text above the Open button' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  bodyText?: string;
}
