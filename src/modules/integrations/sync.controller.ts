import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { SyncService } from './sync.service';
import { CreateSyncConfigDto, UpdateSyncConfigDto } from './dto/sync-config.dto';

@ApiTags('sync')
@Controller('sync')
@RequireActiveBusiness()
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get('providers')
  @ApiOperation({ summary: 'List supported sync providers' })
  getProviders() {
    return this.syncService.getSupportedProviders();
  }

  @Get()
  @ApiOperation({ summary: 'List sync configurations' })
  findAll(@CurrentApiKey() apiKey: { businessId?: string }, @Query('provider') provider?: string) {
    return this.syncService.findAll(this.getBusinessId(apiKey), provider);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sync config' })
  findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.syncService.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Create sync config' })
  @ApiResponse({ status: 201 })
  create(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: CreateSyncConfigDto) {
    return this.syncService.create(this.getBusinessId(apiKey), dto);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update sync config' })
  update(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string, @Body() dto: UpdateSyncConfigDto) {
    return this.syncService.update(id, this.getBusinessId(apiKey), dto);
  }

  @Post(':id/trigger')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Trigger a manual sync' })
  trigger(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.syncService.triggerSync(id, this.getBusinessId(apiKey));
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export synced records as CSV or JSON' })
  async export(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    return this.syncService.exportData(id, this.getBusinessId(apiKey), format || 'json');
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete sync config' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.syncService.remove(id, this.getBusinessId(apiKey));
  }
}
