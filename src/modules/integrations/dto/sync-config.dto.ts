import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';
import { ToStrictBoolean } from '../../../common/utils/strict-boolean';

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
  @ToStrictBoolean()
  @IsBoolean()
  enabled?: boolean;
}
