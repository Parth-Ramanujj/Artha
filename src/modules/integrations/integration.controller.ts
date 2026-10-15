import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { IntegrationService } from './integration.service';
import { CreateIntegrationDto, UpdateIntegrationDto } from './dto/integration.dto';

@ApiTags('integrations')
@Controller('integrations')
@RequireActiveBusiness()
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get('types')
  @ApiOperation({ summary: 'List available integration types' })
  getTypes() {
    return this.service.getAvailableTypes();
  }

  @Get()
  @ApiOperation({ summary: 'List configured integrations' })
  findAll(@CurrentApiKey() apiKey: { businessId?: string }, @Query('type') type?: string) {
    return this.service.findAll(this.getBusinessId(apiKey), type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration details' })
  findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Create integration' })
  @ApiResponse({ status: 201 })
  create(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: CreateIntegrationDto) {
    return this.service.create(this.getBusinessId(apiKey), dto);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update integration' })
  update(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.service.update(id, this.getBusinessId(apiKey), dto);
  }

  @Post(':id/test')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Test integration connectivity' })
  test(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.testConnection(id, this.getBusinessId(apiKey));
  }

  @Post(':id/connect')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Connect integration' })
  connect(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.connect(id, this.getBusinessId(apiKey));
  }

  @Post(':id/disconnect')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Disconnect integration' })
  disconnect(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.disconnect(id, this.getBusinessId(apiKey));
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete integration' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.service.remove(id, this.getBusinessId(apiKey));
  }
}
