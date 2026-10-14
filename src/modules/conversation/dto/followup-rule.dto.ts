import { IsString, IsOptional, IsInt, Min, IsObject, IsBoolean } from 'class-validator';

export class CreateFollowupRuleDto {
  @IsString()
  name: string;

  @IsString()
  trigger: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  delayMinutes?: number;

  @IsString()
  message: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownMinutes?: number;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class UpdateFollowupRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  trigger?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  delayMinutes?: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownMinutes?: number;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
