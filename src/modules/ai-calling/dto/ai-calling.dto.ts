import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';

export class VoiceAgentDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(60) personaName?: string;
  @IsOptional() @IsString() @MaxLength(120) companyName?: string;
  @IsOptional() @IsString() @MaxLength(1000) greeting?: string;
  @IsOptional() @IsString() @MaxLength(8000) script?: string;
  @IsOptional() @IsString() @MaxLength(2000) verifiedLeadCriteria?: string;
  @IsOptional() @IsIn(['gu-IN', 'hi-IN']) defaultLanguage?: string;
  @IsOptional() @IsString() @MaxLength(60) @Matches(/^[a-z0-9_]+$/) gujaratiVoice?: string;
  @IsOptional() @IsString() @MaxLength(60) @Matches(/^[a-z0-9_]+$/) hindiVoice?: string;
  @IsOptional() @ToStrictNumber() @IsNumber() pace?: number;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @ToStrictNumber() @IsInt() maxCallSeconds?: number;
  @IsOptional() @ToStrictNumber() @IsInt() concurrency?: number;
  @IsOptional() @ToStrictNumber() @IsInt() maxAttempts?: number;
  @IsOptional() @ToStrictNumber() @IsInt() retryAfterMinutes?: number;
  @IsOptional() @IsString() callingStart?: string;
  @IsOptional() @IsString() callingEnd?: string;
  @IsOptional() @IsString() @MaxLength(50) callingTimezone?: string;
  @IsOptional() @ToStrictBoolean() @IsBoolean() whatsappFollowup?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) whatsappMessage?: string | null;
  @IsOptional() @IsString() @MaxLength(36) whatsappSessionId?: string | null;
}

export class QueueCallDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() agentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leadId?: string;
}

export class BatchContactDto {
  @IsString() @MaxLength(30) phone: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
}

export class CreateBatchDto {
  @ApiProperty() @IsString() @MaxLength(150) name: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() agentId?: string;
  @ApiPropertyOptional() @IsOptional() @ToStrictBoolean() @IsBoolean() sendWhatsapp?: boolean;
  @ApiPropertyOptional({ enum: ['upload', 'leads'] }) @IsOptional() @IsIn(['upload', 'leads']) source?: string;

  @ApiProperty({ type: [BatchContactDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => BatchContactDto)
  contacts: BatchContactDto[];
}

export class BatchActionDto {
  @ApiProperty({ enum: ['pause', 'resume', 'cancel'] })
  @IsIn(['pause', 'resume', 'cancel'])
  action: 'pause' | 'resume' | 'cancel';
}

export class PublicUrlDto {
  @ApiProperty({ example: 'https://abc.trycloudflare.com' })
  @IsString()
  @MaxLength(300)
  url: string;
}

export class TestCallDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() agentId?: string;
}
