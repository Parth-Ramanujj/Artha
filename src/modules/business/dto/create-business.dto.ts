import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessDto {
  @ApiProperty({ description: 'Business display name', example: 'Acme Corp' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiPropertyOptional({ description: 'URL-safe slug (auto-generated from name if omitted)', example: 'acme-corp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return undefined;
    const clean = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return clean.length > 0 ? clean : undefined;
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Subscription plan', example: 'growth' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;

  @ApiPropertyOptional({ description: 'Workspace settings' })
  @IsOptional()
  settings?: Record<string, unknown>;
}
