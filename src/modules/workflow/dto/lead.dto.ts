import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { LeadInterest, LeadStatus, LeadTemperature } from '../entities/lead.entity';

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status: LeadStatus;
}

export class UpdateLeadClassificationDto {
  @ApiPropertyOptional({ enum: LeadTemperature })
  @IsOptional()
  @IsEnum(LeadTemperature)
  temperature?: LeadTemperature;

  @ApiPropertyOptional({ enum: LeadInterest })
  @IsOptional()
  @IsEnum(LeadInterest)
  interest?: LeadInterest;
}
