import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';
import { ToStrictBoolean } from '../../../common/utils/strict-boolean';

export class CreateIntegrationDto {
  @IsString()
  type: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  enabled?: boolean;
}
