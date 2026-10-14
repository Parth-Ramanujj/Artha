import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConversationService } from './conversation.service';
import { UpdateConversationDto, CreateContactDto, UpdateContactDto } from './dto/conversation.dto';
import { ConversationStatus } from './entities/conversation.entity';
import { RequireRole, CurrentApiKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';

@ApiTags('conversations')
@Controller('conversations')
@RequireActiveBusiness()
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Get()
  @ApiOperation({ summary: 'List conversations for the current business' })
  @ApiQuery({ name: 'sessionId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ConversationStatus })
  @ApiQuery({ name: 'assignedTo', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('sessionId') sessionId?: string,
    @Query('status') status?: ConversationStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.conversationService.findAllConversations(this.getBusinessId(apiKey), {
      sessionId,
      status,
      assignedTo,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.conversationService.findOneConversation(id, this.getBusinessId(apiKey));
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a conversation (assign, close, tag)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateConversationDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.conversationService.updateConversation(id, this.getBusinessId(apiKey), dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a conversation as read (reset unread count)' })
  @ApiParam({ name: 'id' })
  async markRead(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.conversationService.resetUnread(id, this.getBusinessId(apiKey));
  }
}

@ApiTags('contacts')
@Controller('contacts')
@RequireActiveBusiness()
export class ContactController {
  constructor(private readonly conversationService: ConversationService) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Get()
  @ApiOperation({ summary: 'List contacts for the current business' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.conversationService.findAllContacts(this.getBusinessId(apiKey), {
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contact by ID' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.conversationService.findOneContact(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiResponse({ status: 201, description: 'Contact created' })
  async create(@Body() dto: CreateContactDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.conversationService.createContact(this.getBusinessId(apiKey), dto);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a contact' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateContactDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.conversationService.updateContact(id, this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Delete a contact' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    await this.conversationService.deleteContact(id, this.getBusinessId(apiKey));
  }

  @Post('import')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Import contacts from CSV data' })
  @ApiResponse({ status: 200, description: 'Import results' })
  @HttpCode(HttpStatus.OK)
  async importContacts(@Body() body: { csv: string }, @CurrentApiKey() apiKey: ApiKey) {
    return this.conversationService.importContactsCsv(this.getBusinessId(apiKey), body.csv);
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export contacts as CSV' })
  async exportContacts(@CurrentApiKey() apiKey: ApiKey, @Res() res: Response) {
    const csv = await this.conversationService.exportContactsCsv(this.getBusinessId(apiKey));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  }
}

@ApiTags('export')
@Controller('export')
@RequireActiveBusiness()
export class ExportController {
  constructor(private readonly conversationService: ConversationService) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Export conversations as CSV' })
  async exportConversations(@CurrentApiKey() apiKey: ApiKey, @Res() res: Response) {
    const csv = await this.conversationService.exportConversationsCsv(this.getBusinessId(apiKey));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=conversations.csv');
    res.send(csv);
  }

  @Get('contacts')
  @ApiOperation({ summary: 'Export contacts as CSV' })
  async exportContacts(@CurrentApiKey() apiKey: ApiKey, @Res() res: Response) {
    const csv = await this.conversationService.exportContactsCsv(this.getBusinessId(apiKey));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  }
}
