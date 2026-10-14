import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey } from '../auth/decorators/auth.decorators';
import { WorkflowService } from './workflow.service';

@ApiTags('workflow-analytics')
@Controller('workflows/analytics')
@RequireActiveBusiness()
export class WorkflowAnalyticsController {
  constructor(private readonly workflowService: WorkflowService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get workflow analytics summary' })
  async getSummary(@CurrentApiKey() apiKey: { businessId?: string }) {
    const businessId = this.getBusinessId(apiKey);
    return this.workflowService.getAnalyticsSummary(businessId);
  }

  @Get(':workflowId/path-stats')
  @ApiOperation({ summary: 'Get path analytics for a workflow' })
  async getPathStats(@CurrentApiKey() apiKey: { businessId?: string }, @Param('workflowId') workflowId: string) {
    const businessId = this.getBusinessId(apiKey);
    return this.workflowService.getPathStats(workflowId, businessId);
  }
}
