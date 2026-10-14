import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey } from '../auth/decorators/auth.decorators';
import { CampaignService } from './campaign.service';

@ApiTags('campaign-analytics')
@Controller('campaigns/analytics')
@RequireActiveBusiness()
export class CampaignAnalyticsController {
  constructor(private readonly campaignService: CampaignService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get campaign analytics summary' })
  async getSummary(@CurrentApiKey() apiKey: { businessId?: string }) {
    const businessId = this.getBusinessId(apiKey);
    return this.campaignService.getAnalyticsSummary(businessId);
  }

  @Get(':campaignId/stats')
  @ApiOperation({ summary: 'Get stats for a specific campaign' })
  async getCampaignStats(@CurrentApiKey() apiKey: { businessId?: string }, @Param('campaignId') campaignId: string) {
    const businessId = this.getBusinessId(apiKey);
    return this.campaignService.getCampaignStats(campaignId, businessId);
  }
}
