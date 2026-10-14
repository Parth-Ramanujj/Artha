import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBusinessDto {
  @ApiProperty({ description: 'Business display name', example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'URL-safe slug (auto-generated from name if omitted)', example: 'acme-corp' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase alphanumeric with hyphens' })
  slug?: string;
}
