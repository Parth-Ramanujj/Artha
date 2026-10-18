import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LeadStatus } from '../entities/lead.entity';

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status: LeadStatus;
}
