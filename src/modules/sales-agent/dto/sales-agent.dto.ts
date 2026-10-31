import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ToStrictBoolean } from '../../../common/utils/strict-boolean';

/** Partial config update; nested objects are merged key by key and sanitised in the service. */
export class UpdateSalesAgentConfigDto {
  @ApiPropertyOptional() @IsOptional() @ToStrictBoolean() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @ToStrictBoolean() @IsBoolean() requireApproval?: boolean;
  /** Turning approval off (autopilot) must be confirmed by typing "autopilot". */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) confirm?: string;
  @ApiPropertyOptional() @IsOptional() @ToStrictBoolean() @IsBoolean() sendingPaused?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() persona?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() product?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() icp?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() whatsapp?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() email?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() schedule?: Record<string, unknown>;
}

export class DiscoverDto {
  @ApiProperty({ example: 'insurance agent ahmedabad', description: 'What and where, in plain words (India only)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query: string;
  @ApiPropertyOptional({ example: 'Ahmedabad', description: 'Place to use when the query names none' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
  @ApiPropertyOptional({ default: 10 }) @IsOptional() @IsInt() @Min(1) @Max(50) radiusKm?: number;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @IsInt() @Min(1) @Max(300) limit?: number;
}

export class ProspectInputDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional({ description: 'With country code' }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AddProspectsDto {
  @ApiProperty({ type: [ProspectInputDto] })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ProspectInputDto)
  prospects: ProspectInputDto[];
}

export class EditOutboxDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) body: string;
}

export class ConversationStatusDto {
  @ApiProperty({ enum: ['open', 'needs_human', 'closed'] })
  @IsIn(['open', 'needs_human', 'closed'])
  status: 'open' | 'needs_human' | 'closed';
}
