import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsIn, MinLength, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ description: 'Business/tenant display name', example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessName: string;

  @ApiPropertyOptional({ description: 'URL-safe slug (auto-generated from name when omitted)', example: 'acme-corp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ description: 'Billing plan', example: 'free', default: 'free' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;
}

export class CreateTenantKeyDto {
  @ApiProperty({ description: 'Friendly name for the API key', example: 'Production Integration' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Permission level for this key',
    enum: ['operator', 'viewer'],
    default: 'operator',
  })
  @IsOptional()
  @IsIn(['operator', 'viewer'])
  role?: 'operator' | 'viewer';

  @ApiPropertyOptional({ description: 'Restrict key to specific features (omit for all features)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFeatures?: string[];
}
