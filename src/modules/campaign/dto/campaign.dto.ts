import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  IsArray,
  IsObject,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ConsentStatus } from '../entities/contact-consent.entity';

export class CreateScheduledMessageDto {
  @IsString()
  @MaxLength(36)
  sessionId: string;

  @IsString()
  @MaxLength(200)
  chatId: string;

  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsObject()
  messageOptions?: Record<string, unknown>;

  @IsDateString()
  scheduledAt: string;
}

export class CreateCampaignDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MaxLength(36)
  sessionId: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  messageContent?: string;

  @IsOptional()
  @IsObject()
  messageOptions?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  ratePerMinute?: number;

  @IsOptional()
  @IsObject()
  targetFilters?: Record<string, unknown>;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  messageContent?: string;

  @IsOptional()
  @IsObject()
  messageOptions?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  ratePerMinute?: number;

  @IsOptional()
  @IsObject()
  targetFilters?: Record<string, unknown>;
}

export class AddCampaignRecipientsDto {
  @IsArray()
  @IsString({ each: true })
  chatIds: string[];
}

export class UpdateConsentDto {
  @IsEnum(ConsentStatus)
  status: ConsentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string;
}

export class ScheduleCampaignDto {
  @IsDateString()
  scheduledAt: string;
}
