import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AiService } from './ai.service';
import {
  UpdateAiConfigDto,
  CreateKnowledgeDocumentDto,
  UpdateKnowledgeDocumentDto,
  AiChatRequestDto,
} from './dto/ai.dto';
import { RequireRole, CurrentApiKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';

@ApiTags('ai')
@Controller('ai')
@RequireActiveBusiness()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Get('models')
  @ApiOperation({ summary: 'List available AI models' })
  getModels() {
    return this.aiService.getAvailableModels();
  }

  @Post('chat')
  @RequireRole(ApiKeyRole.VIEWER)
  @ApiOperation({ summary: 'Send a prompt or test query to the AI Assistant' })
  async chat(@Body() dto: AiChatRequestDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.aiService.chat({
      businessId: this.getBusinessId(apiKey) ?? '',
      sessionId: dto.sessionId ?? 'default',
      chatId: dto.chatId ?? 'test',
      message: dto.message,
      conversationHistory: dto.conversationHistory,
    });
  }

  @Get('config')
  @ApiOperation({ summary: 'Get AI configuration for the current business' })
  async getConfig(@CurrentApiKey() apiKey: ApiKey) {
    return this.aiService.getConfig(this.getBusinessId(apiKey));
  }

  @Put('config')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update AI configuration' })
  async updateConfig(@Body() dto: UpdateAiConfigDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.aiService.updateConfig(this.getBusinessId(apiKey), dto, apiKey?.id);
  }


  @Get(['knowledge', 'documents'])
  @ApiOperation({ summary: 'List knowledge documents' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAllDocuments(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.aiService.findAllDocuments(this.getBusinessId(apiKey), {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(['knowledge/:id', 'documents/:id'])
  @ApiOperation({ summary: 'Get a knowledge document' })
  @ApiParam({ name: 'id' })
  async findOneDocument(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.aiService.findOneDocument(id, this.getBusinessId(apiKey));
  }

  @Post(['knowledge', 'documents'])
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Upload a knowledge document' })
  @ApiResponse({ status: 201, description: 'Document created' })
  async createDocument(@Body() dto: CreateKnowledgeDocumentDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.aiService.createDocument(this.getBusinessId(apiKey), dto, apiKey?.id);
  }

  @Put(['knowledge/:id', 'documents/:id'])
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a knowledge document' })
  @ApiParam({ name: 'id' })
  async updateDocument(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeDocumentDto,
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    return this.aiService.updateDocument(id, this.getBusinessId(apiKey), dto, apiKey?.id);
  }

  @Delete(['knowledge/:id', 'documents/:id'])
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Delete a knowledge document' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDocument(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    await this.aiService.deleteDocument(id, this.getBusinessId(apiKey));
  }
}
