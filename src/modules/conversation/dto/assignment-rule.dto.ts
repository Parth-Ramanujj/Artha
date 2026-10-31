import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsNumber, MaxLength } from 'class-validator';
import { AssignmentStrategy } from '../entities/assignment-rule.entity';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';

export class CreateAssignmentRuleDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsEnum(AssignmentStrategy)
  strategy?: AssignmentStrategy;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agents?: string[];

  @IsOptional()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ToStrictNumber()
  @IsNumber()
  priority?: number;
}

export class UpdateAssignmentRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(AssignmentStrategy)
  strategy?: AssignmentStrategy;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agents?: string[];

  @IsOptional()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @ToStrictBoolean()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ToStrictNumber()
  @IsNumber()
  priority?: number;
}
