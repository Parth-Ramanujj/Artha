import { IsString, IsOptional, IsBoolean, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBusinessDto {
  @ApiPropertyOptional({ description: 'Business display name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ description: 'URL-safe slug' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return undefined;
    const clean = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return clean.length > 0 ? clean : undefined;
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Subscription plan' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;

  @ApiPropertyOptional({ description: 'Whether the business is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Workspace settings' })
  @IsOptional()
  settings?: Record<string, unknown>;
}
