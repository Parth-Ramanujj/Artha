import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AssignmentRuleService } from './assignment-rule.service';
import { CreateAssignmentRuleDto, UpdateAssignmentRuleDto } from './dto/assignment-rule.dto';

@ApiTags('assignment-rules')
@Controller('assignment-rules')
@RequireActiveBusiness()
export class AssignmentRuleController {
  constructor(private readonly service: AssignmentRuleService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List assignment rules' })
  @ApiResponse({ status: 200, description: 'List of assignment rules' })
  findAll(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.service.findAll(this.getBusinessId(apiKey));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get assignment rule by ID' })
  findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Create assignment rule' })
  @ApiResponse({ status: 201, description: 'Created' })
  create(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: CreateAssignmentRuleDto) {
    return this.service.create(this.getBusinessId(apiKey), dto);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update assignment rule' })
  update(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentRuleDto,
  ) {
    return this.service.update(id, this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete assignment rule' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.service.remove(id, this.getBusinessId(apiKey));
  }
}
