import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  IsArray,
  ValidateNested,
  IsObject,
  MaxLength,
  Min,
  Max,
  IsBoolean,
  Allow,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';
import { TriggerType, ConditionType, ActionType, WorkflowStatus } from '../entities/workflow-definition.entity';

export class WorkflowTriggerDto {
  @IsEnum(TriggerType)
  type: TriggerType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class WorkflowConditionDto {
  @IsEnum(ConditionType)
  type: ConditionType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ToStrictBoolean()
  @IsOptional()
  @IsBoolean()
  negate?: boolean;
}

export class WorkflowActionDto {
  @IsString()
  @MaxLength(100)
  id: string;

  @IsEnum(ActionType)
  type: ActionType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(['stop', 'skip', 'retry'] as const)
  onError?: 'stop' | 'skip' | 'retry';

  @ToStrictNumber()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries?: number;
}

export class VisualWorkflowNodeDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsObject()
  position?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ToStrictNumber()
  @IsOptional()
  @IsNumber()
  width?: number;

  @ToStrictNumber()
  @IsOptional()
  @IsNumber()
  height?: number;

  @ToStrictBoolean()
  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  @ToStrictBoolean()
  @IsOptional()
  @IsBoolean()
  dragging?: boolean;
}

export class VisualWorkflowEdgeDto {
  @IsString()
  id: string;

  @IsString()
  source: string;

  @IsString()
  target: string;

  @IsOptional()
  @IsString()
  sourceHandle?: string | null;

  @IsOptional()
  @IsString()
  targetHandle?: string | null;

  @IsOptional()
  @IsString()
  label?: string;

  @ToStrictBoolean()
  @IsOptional()
  @IsBoolean()
  animated?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  style?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class WorkflowDefinitionDto {
  @ValidateNested()
  @Type(() => WorkflowTriggerDto)
  trigger: WorkflowTriggerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionDto)
  conditions?: WorkflowConditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions?: WorkflowActionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisualWorkflowNodeDto)
  nodes?: VisualWorkflowNodeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisualWorkflowEdgeDto)
  edges?: VisualWorkflowEdgeDto[];
}

export class CreateWorkflowDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition: WorkflowDefinitionDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxActionsPerRun?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  maxExecutionSeconds?: number;

  @ToStrictNumber()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrentRuns?: number;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition?: WorkflowDefinitionDto;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxActionsPerRun?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  maxExecutionSeconds?: number;

  @ToStrictNumber()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrentRuns?: number;
}

export class TestWebhookDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @Allow()
  queryParams?: Array<{ key: string; value: string }> | Record<string, string>;

  @IsOptional()
  @Allow()
  headers?: Array<{ key: string; value: string }> | Record<string, string>;

  @IsOptional()
  @Allow()
  body?: string | Record<string, unknown>;

  @IsOptional()
  @IsObject()
  testVariables?: Record<string, string>;

  @IsOptional()
  @ToStrictNumber()
  @IsInt()
  timeoutMs?: number;
}
