import { IsString, IsOptional, IsEnum, IsInt, IsBoolean, IsArray, MaxLength, Min, Max } from 'class-validator';
import { AiProvider } from '../entities/ai-config.entity';

export class UpdateAiConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(AiProvider)
  provider?: AiProvider;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiEndpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(16000)
  maxTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxContextMessages?: number;

  @IsOptional()
  @IsBoolean()
  useKnowledgeBase?: boolean;

  @IsOptional()
  @IsBoolean()
  autoHandoff?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  handoffKeywords?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fallbackMessage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sessionScopes?: string[];
}

export class CreateKnowledgeDocumentDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsString()
  content: string;
}

export class UpdateKnowledgeDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class AiChatRequestDto {
  @IsString()
  @MaxLength(10000)
  message: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsArray()
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

