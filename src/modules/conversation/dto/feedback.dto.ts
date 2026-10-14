import { IsString, IsOptional, IsInt, Min, Max, IsArray } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  conversationId: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class SubmitFeedbackViaWhatsAppDto {
  @IsString()
  conversationId: string;

  @IsString()
  sessionId: string;

  @IsString()
  chatId: string;
}
