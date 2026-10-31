import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AgentStatus } from '../entities/ai-agent.entity';
import { ToStrictBoolean, ToStrictNumber } from '../../../common/utils/strict-boolean';

export const AGENT_PLATFORMS = ['flowise', 'n8n', 'dify', 'langchain', 'botpress', 'custom'] as const;
export type AgentPlatform = (typeof AGENT_PLATFORMS)[number];

export class AiAgentInputDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(100) role?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @ToStrictNumber() @IsNumber() @Min(0) @Max(1) temperature?: number;
  @IsOptional() @IsString() @MaxLength(8000) systemPrompt?: string | null;
  @IsOptional() @IsIn(Object.values(AgentStatus)) status?: AgentStatus;
  @IsOptional() @ToStrictBoolean() @IsBoolean() autonomous?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  triggerKeywords?: string[];
  @IsOptional() @IsString() @MaxLength(36) sessionId?: string | null;
  @IsOptional() @ToStrictBoolean() @IsBoolean() isExternal?: boolean;
  @IsOptional() @IsIn(AGENT_PLATFORMS) externalPlatform?: AgentPlatform | null;
  @IsOptional() @IsString() @MaxLength(500) externalWebhookUrl?: string | null;
  /** '' clears the stored header; leaving it out keeps it. */
  @IsOptional() @IsString() @MaxLength(500) externalAuthHeader?: string;
  @IsOptional() @IsString() @MaxLength(200) responseJsonPath?: string | null;
}

export class BuildAgentDto {
  @IsString() @MinLength(10) @MaxLength(2000) prompt: string;
}

export class ChatTurnDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MaxLength(4000) content: string;
}

export class TestAgentDto {
  @IsString() @MinLength(1) @MaxLength(2000) message: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

export class VoicePreviewDto {
  @IsString() @MinLength(1) @MaxLength(500) text: string;
  @IsIn(['gu-IN', 'hi-IN', 'en-IN']) language: 'gu-IN' | 'hi-IN' | 'en-IN';
  @IsString() @MaxLength(60) voice: string;
}

export class CopilotMessageDto {
  @IsIn(['customer', 'agent']) role: 'customer' | 'agent';
  @IsString() @MaxLength(4000) text: string;
}

export class CopilotRequestDto {
  @IsIn(['summary', 'replies', 'rewrite', 'translate']) task: 'summary' | 'replies' | 'rewrite' | 'translate';
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => CopilotMessageDto)
  messages?: CopilotMessageDto[];
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
  @IsOptional() @IsIn(['professional', 'friendly', 'short', 'sales']) tone?:
    'professional' | 'friendly' | 'short' | 'sales';
  @IsOptional() @IsString() @MaxLength(40) language?: string;
}
