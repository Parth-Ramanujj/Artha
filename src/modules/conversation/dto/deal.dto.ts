import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealStage, DealPriority } from '../entities/deal.entity';

export class CreateDealDto {
  @ApiProperty({ description: 'Title or opportunity name' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Contact person name' })
  @IsString()
  @IsNotEmpty()
  contactName: string;

  @ApiProperty({ description: 'WhatsApp contact phone' })
  @IsString()
  @IsNotEmpty()
  contactPhone: string;

  @ApiPropertyOptional({ description: 'Estimated deal value in INR / USD' })
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ enum: DealStage, default: DealStage.LEAD })
  @IsEnum(DealStage)
  @IsOptional()
  stage?: DealStage;

  @ApiPropertyOptional({ enum: DealPriority, default: DealPriority.MEDIUM })
  @IsEnum(DealPriority)
  @IsOptional()
  priority?: DealPriority;

  @ApiPropertyOptional({ description: 'Assigned agent name or ID' })
  @IsString()
  @IsOptional()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Internal deal notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [String], description: 'Tags associated with the deal' })
  @IsArray()
  @IsOptional()
  tags?: string[];
}

export class UpdateDealDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ enum: DealStage })
  @IsEnum(DealStage)
  @IsOptional()
  stage?: DealStage;

  @ApiPropertyOptional({ enum: DealPriority })
  @IsEnum(DealPriority)
  @IsOptional()
  priority?: DealPriority;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];
}
