import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessRole } from '../entities/business-membership.entity';

export class AddMembershipDto {
  @ApiProperty({ description: 'API key ID to add to the business' })
  @IsString()
  apiKeyId: string;

  @ApiPropertyOptional({ description: 'Role within the business', enum: BusinessRole, default: BusinessRole.AGENT })
  @IsOptional()
  @IsEnum(BusinessRole)
  businessRole?: BusinessRole;
}

export class UpdateMembershipDto {
  @ApiProperty({ description: 'New role within the business', enum: BusinessRole })
  @IsEnum(BusinessRole)
  businessRole: BusinessRole;
}
