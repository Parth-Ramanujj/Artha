import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { SlaService } from './sla.service';
import { CreateSlaPolicyDto, UpdateSlaPolicyDto } from './dto/sla-policy.dto';

@ApiTags('sla')
@Controller('sla')
@RequireActiveBusiness()
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get('policies')
  @ApiOperation({ summary: 'List SLA policies' })
  findAllPolicies(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.slaService.findAllPolicies(this.getBusinessId(apiKey));
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get SLA policy' })
  findOnePolicy(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.slaService.findOnePolicy(id, this.getBusinessId(apiKey));
  }

  @Post('policies')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Create SLA policy' })
  @ApiResponse({ status: 201 })
  createPolicy(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: CreateSlaPolicyDto) {
    return this.slaService.createPolicy(this.getBusinessId(apiKey), dto);
  }

  @Put('policies/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update SLA policy' })
  updatePolicy(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateSlaPolicyDto,
  ) {
    return this.slaService.updatePolicy(id, this.getBusinessId(apiKey), dto);
  }

  @Delete('policies/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete SLA policy' })
  async removePolicy(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.slaService.removePolicy(id, this.getBusinessId(apiKey));
  }

  @Get('events')
  @ApiOperation({ summary: 'List SLA events' })
  getEvents(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Query('conversationId') conversationId?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.slaService.getEvents(this.getBusinessId(apiKey), {
      conversationId,
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get SLA breach statistics' })
  getStats(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.slaService.getBreachStats(this.getBusinessId(apiKey));
  }
}
