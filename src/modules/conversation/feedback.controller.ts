import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto, SubmitFeedbackViaWhatsAppDto } from './dto/feedback.dto';

@ApiTags('feedback')
@Controller('feedback')
@RequireActiveBusiness()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List feedback entries' })
  findAll(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Query('agentName') agentName?: string,
    @Query('minRating') minRating?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.feedbackService.findAll(this.getBusinessId(apiKey), {
      agentName,
      minRating: minRating ? parseInt(minRating, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get feedback statistics and agent ratings' })
  getStats(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.feedbackService.getStats(this.getBusinessId(apiKey));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get feedback by ID' })
  findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.feedbackService.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @ApiOperation({ summary: 'Submit feedback' })
  @ApiResponse({ status: 201 })
  create(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.create(this.getBusinessId(apiKey), dto);
  }

  @Post('request-via-whatsapp')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send feedback request via WhatsApp message' })
  requestViaWhatsApp(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: SubmitFeedbackViaWhatsAppDto) {
    return this.feedbackService.requestFeedbackViaWhatsApp(this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete feedback' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.feedbackService.remove(id, this.getBusinessId(apiKey));
  }
}
