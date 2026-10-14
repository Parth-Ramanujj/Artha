import { IsString, IsOptional, IsArray, IsEnum, MaxLength } from 'class-validator';

export class CreateContactSegmentDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staticContactIds?: string[];

  @IsOptional()
  @IsEnum(['dynamic', 'static'] as const)
  type?: 'dynamic' | 'static';
}

export class UpdateContactSegmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staticContactIds?: string[];
}
