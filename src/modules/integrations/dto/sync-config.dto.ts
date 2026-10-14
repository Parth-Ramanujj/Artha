import { IsString, IsOptional, IsObject, IsBoolean, IsEnum } from 'class-validator';

export class CreateSyncConfigDto {
  @IsString()
  provider: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  direction?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @IsOptional()
  @IsString()
  dataType?: string;
}

export class UpdateSyncConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  direction?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
