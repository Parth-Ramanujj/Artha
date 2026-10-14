import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AbTestService } from './ab-test.service';
import { CreateAbTestDto, UpdateAbTestDto } from './dto/ab-test.dto';

@ApiTags('ab-tests')
@Controller('ab-tests')
@RequireActiveBusiness()
export class AbTestController {
  constructor(private readonly service: AbTestService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List A/B tests' })
  findAll(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.service.findAll(this.getBusinessId(apiKey));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get A/B test' })
  findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create A/B test' })
  @ApiResponse({ status: 201 })
  create(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: CreateAbTestDto) {
    return this.service.create(this.getBusinessId(apiKey), dto);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update A/B test' })
  update(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string, @Body() dto: UpdateAbTestDto) {
    return this.service.update(id, this.getBusinessId(apiKey), dto);
  }

  @Post(':id/start')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Start A/B test' })
  start(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.start(id, this.getBusinessId(apiKey));
  }

  @Post(':id/complete')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Complete A/B test and determine winner' })
  complete(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.complete(id, this.getBusinessId(apiKey));
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete A/B test' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.service.remove(id, this.getBusinessId(apiKey));
  }
}
