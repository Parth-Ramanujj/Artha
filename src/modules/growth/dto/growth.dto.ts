import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateGrowthSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(36)
  sessionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  summaryEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ownerPhone?: string;

  @IsOptional()
  @Matches(TIME, { message: 'summaryTime must be HH:mm' })
  summaryTime?: string;

  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  greetingsEnabled?: boolean;

  @IsOptional()
  @Matches(TIME, { message: 'greetingTime must be HH:mm' })
  greetingTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  birthdayText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  anniversaryText?: string;

  @IsOptional()
  @ToStrictNumber()
  @IsInt()
  @Min(0)
  @Max(365)
  winbackDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  winbackText?: string;

  @IsOptional()
  @ToStrictNumber()
  @IsInt()
  @Min(1)
  @Max(500)
  dailySendCap?: number;

  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  voiceActionsEnabled?: boolean;

  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  autoStopEnabled?: boolean;
}

export class SaveGrowthLinkDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  prefillText?: string;
}
