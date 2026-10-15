import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';
import { DealService } from './deal.service';
import { CreateDealDto, UpdateDealDto } from './dto/deal.dto';

@ApiTags('deals')
@RequireUnscopedKey()
@Controller('deals')
@RequireActiveBusiness()
export class DealController {
  constructor(private readonly dealService: DealService) {}

  private getBusinessId(apiKey?: ApiKey): string {
    return apiKey?.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List deals in the pipeline' })
  @ApiQuery({ name: 'stage', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'contactId', required: false })
  findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('stage') stage?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('contactId') contactId?: string,
  ) {
    return this.dealService.findAll(this.getBusinessId(apiKey), { stage, priority, search, contactId });
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get sales pipeline aggregate metrics' })
  getMetrics(@CurrentApiKey() apiKey: ApiKey) {
    return this.dealService.getMetrics(this.getBusinessId(apiKey));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deal by ID' })
  @ApiParam({ name: 'id' })
  findOne(@CurrentApiKey() apiKey: ApiKey, @Param('id') id: string) {
    return this.dealService.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create new deal in pipeline' })
  @ApiResponse({ status: 201, description: 'Deal created' })
  create(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateDealDto) {
    return this.dealService.create(this.getBusinessId(apiKey), dto);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update deal (stage, amount, priority, notes)' })
  @ApiParam({ name: 'id' })
  update(@CurrentApiKey() apiKey: ApiKey, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.dealService.update(id, this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Delete a deal' })
  @ApiParam({ name: 'id' })
  remove(@CurrentApiKey() apiKey: ApiKey, @Param('id') id: string) {
    return this.dealService.remove(id, this.getBusinessId(apiKey));
  }
}
