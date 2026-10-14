import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { FollowupService } from './followup.service';
import { CreateFollowupRuleDto, UpdateFollowupRuleDto } from './dto/followup-rule.dto';
import { IsString } from 'class-validator';

class SendFollowupDto {
  @IsString()
  conversationId: string;

  @IsString()
  sessionId: string;

  @IsString()
  chatId: string;

  @IsString()
  message: string;
}

@ApiTags('followup')
@Controller('followup')
@RequireActiveBusiness()
export class FollowupController {
  constructor(private readonly followupService: FollowupService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get('rules')
  @ApiOperation({ summary: 'List follow-up rules' })
  findAllRules(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.followupService.findAllRules(this.getBusinessId(apiKey));
  }

  @Get('rules/:id')
  @ApiOperation({ summary: 'Get follow-up rule' })
  findOneRule(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.followupService.findOneRule(id, this.getBusinessId(apiKey));
  }

  @Post('rules')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create follow-up rule' })
  @ApiResponse({ status: 201 })
  createRule(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: CreateFollowupRuleDto) {
    return this.followupService.createRule(this.getBusinessId(apiKey), dto);
  }

  @Put('rules/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update follow-up rule' })
  updateRule(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateFollowupRuleDto,
  ) {
    return this.followupService.updateRule(id, this.getBusinessId(apiKey), dto);
  }

  @Delete('rules/:id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete follow-up rule' })
  async removeRule(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.followupService.removeRule(id, this.getBusinessId(apiKey));
  }

  @Get('dropped-users')
  @ApiOperation({ summary: 'List dropped/idle users' })
  getDroppedUsers(@CurrentApiKey() apiKey: { businessId?: string }, @Query('idleMinutes') idleMinutes?: string) {
    return this.followupService.getDroppedUsers(
      this.getBusinessId(apiKey),
      idleMinutes ? parseInt(idleMinutes, 10) : undefined,
    );
  }

  @Post('send')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send a follow-up message to a dropped user' })
  sendFollowup(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: SendFollowupDto) {
    return this.followupService.sendFollowup(
      this.getBusinessId(apiKey),
      dto.conversationId,
      dto.sessionId,
      dto.chatId,
      dto.message,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get follow-up recovery statistics' })
  getStats(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.followupService.getStats(this.getBusinessId(apiKey));
  }
}
