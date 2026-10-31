import { Controller, Get, Post, Delete, Body, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { NotificationType } from './entities/notification.entity';
import { AdvisorAlertService } from './advisor-alert.service';
import { IsString, IsOptional } from 'class-validator';

class RegisterAdvisorDto {
  @IsString()
  sessionId: string;

  @IsString()
  advisorChatId: string;

  @IsOptional()
  @IsString()
  advisorName?: string;
}

@ApiTags('advisor-alerts')
@Controller('advisor-alerts')
@RequireActiveBusiness()
export class AdvisorAlertController {
  constructor(private readonly alertService: AdvisorAlertService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List registered advisors for alerts' })
  getAdvisors(@CurrentApiKey() apiKey: { businessId?: string }) {
    return this.alertService.getAdvisors(this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Register an advisor for live WhatsApp alerts' })
  async register(@CurrentApiKey() apiKey: { businessId?: string }, @Body() dto: RegisterAdvisorDto) {
    await this.alertService.registerAdvisor(this.getBusinessId(apiKey), dto);
    return { success: true };
  }

  @Delete()
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Unregister an advisor from alerts' })
  async unregister(@CurrentApiKey() apiKey: { businessId?: string }, @Query('advisorChatId') advisorChatId: string) {
    await this.alertService.unregisterAdvisor(this.getBusinessId(apiKey), advisorChatId);
  }

  @Post('test')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Send a test alert to all registered advisors' })
  async testAlert(@CurrentApiKey() apiKey: { businessId?: string }) {
    const businessId = this.getBusinessId(apiKey);
    await this.alertService.sendAlert(
      businessId,
      NotificationType.SYSTEM,
      'Test Alert',
      'This is a test alert from the Artha system.',
    );
    const advisors = await this.alertService.getAdvisors(businessId);
    return { success: true, advisorCount: advisors.length };
  }
}
