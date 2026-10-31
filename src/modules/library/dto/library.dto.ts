import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_CHATS_PER_POST = 200;

export class LibraryMediaDto {
  @ApiProperty({ description: 'Base64 data (a data: URI prefix is accepted)' })
  @IsString()
  @IsNotEmpty()
  base64: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/3gpp'])
  mimetype: string;
}

export class SaveLibraryItemDto {
  @ApiProperty({ example: 'Diwali greeting' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Festivals' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Message text, or the caption for media' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @ApiPropertyOptional({ type: LibraryMediaDto, description: 'New image/video; omit to keep the current one' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LibraryMediaDto)
  media?: LibraryMediaDto;

  @ApiPropertyOptional({ description: 'Drop the current media (turns the post into text)' })
  @IsOptional()
  @IsBoolean()
  removeMedia?: boolean;
}

export class LibraryScheduleDto {
  @ApiProperty({ enum: ['once', 'daily', 'weekly'] })
  @IsIn(['once', 'daily', 'weekly'])
  kind: 'once' | 'daily' | 'weekly';

  @ApiPropertyOptional({ description: 'ISO date-time, for once' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  at?: string;

  @ApiPropertyOptional({ example: '09:30', description: 'HH:mm, for daily/weekly' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  time?: string;

  @ApiPropertyOptional({ type: [Number], description: '0 = Sunday … 6 = Saturday, for weekly' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  @ApiProperty({ example: 'Asia/Kolkata' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  timezone: string;
}

/** Where a post goes: WhatsApp Status and/or chats (phone numbers or chat ids). */
export class LibraryTargetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sessionId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  postToStatus?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['919876543210', '1203630xxxx@g.us'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHATS_PER_POST)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  chatIds?: string[];
}

export class SaveLibraryAutomationDto extends LibraryTargetDto {
  @ApiProperty({ example: 'Morning status' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ type: [String], description: 'Posts to rotate through, one per run' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  itemIds: string[];

  @ApiProperty({ type: LibraryScheduleDto })
  @ValidateNested()
  @Type(() => LibraryScheduleDto)
  schedule: LibraryScheduleDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ToggleLibraryAutomationDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class WriteLibraryPostDto {
  @ApiProperty({ example: 'Why every family needs term insurance' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  topic: string;

  @ApiPropertyOptional({ enum: ['English', 'Hindi', 'Gujarati'] })
  @IsOptional()
  @IsIn(['English', 'Hindi', 'Gujarati'])
  language?: string;

  @ApiPropertyOptional({ enum: ['status', 'message'] })
  @IsOptional()
  @IsIn(['status', 'message'])
  format?: 'status' | 'message';

  @ApiPropertyOptional({ example: 'friendly' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tone?: string;
}
