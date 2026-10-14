import { IsString, IsOptional, IsInt, Min, IsBoolean, IsObject } from 'class-validator';

export class CreateSlaPolicyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  firstResponseMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  resolutionMinutes?: number;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class UpdateSlaPolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  firstResponseMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  resolutionMinutes?: number;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
