import { IsString, IsOptional, IsBoolean, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBusinessDto {
  @ApiPropertyOptional({ description: 'Business display name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Whether the business is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
