import { Body, Controller, ForbiddenException, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { BusinessService } from '../business/business.service';
import { sessionScopeVisible } from '../../common/security/session-scope';
import { MessageCostsService, type CostScope } from './message-costs.service';

class PeriodQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

class MetaBillQueryDto extends PeriodQueryDto {
  @IsString()
  @MaxLength(64)
  sessionId: string;
}

class BudgetDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  monthlyBudgetInr?: number | null;
}

class PrecheckDto {
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  chatIds: string[];
}

@ApiTags('message-costs')
@Controller('message-costs')
export class MessageCostsController {
  constructor(
    private readonly costs: MessageCostsService,
    private readonly businessService: BusinessService,
  ) {}

  /** The calling key's business, and for a session-restricted key only its numbers. */
  private async scope(apiKey?: ApiKey): Promise<CostScope> {
    const defaultBusinessId = (await this.businessService.getOrCreateDefaultBusiness()).id;
    return {
      businessId: apiKey?.businessId ?? defaultBusinessId,
      defaultBusinessId,
      allowedSessions: apiKey?.allowedSessions ?? null,
    };
  }

  @Get('summary')
  @ApiOperation({ summary: 'What WhatsApp messages cost: totals, by category, by day and by campaign' })
  async summary(@CurrentApiKey() apiKey: ApiKey, @Query() q: PeriodQueryDto) {
    return this.costs.summary(await this.scope(apiKey), q.days ?? 30);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Ways to spend less on WhatsApp messages, from the last period' })
  async suggestions(@CurrentApiKey() apiKey: ApiKey, @Query() q: PeriodQueryDto) {
    return this.costs.suggestions(await this.scope(apiKey), q.days ?? 30);
  }

  @Post('precheck')
  @ApiOperation({ summary: 'Before a campaign: numbers inside their free window and numbers that failed before' })
  async precheck(@CurrentApiKey() apiKey: ApiKey, @Body() dto: PrecheckDto) {
    return this.costs.precheck(await this.scope(apiKey), dto.chatIds);
  }

  @Get('meta-bill')
  @ApiOperation({ summary: "Meta's own bill for a Cloud API number (pricing analytics)" })
  async metaBill(@CurrentApiKey() apiKey: ApiKey, @Query() q: MetaBillQueryDto) {
    if (!sessionScopeVisible(apiKey?.allowedSessions, q.sessionId)) {
      throw new ForbiddenException('This API key may not use that WhatsApp number');
    }
    return this.costs.metaBill(await this.scope(apiKey), q.sessionId, q.days ?? 30);
  }

  @Get('settings')
  async getSettings(@CurrentApiKey() apiKey: ApiKey) {
    return this.costs.getSettings((await this.scope(apiKey)).businessId);
  }

  @Put('settings')
  @RequireRole(ApiKeyRole.ADMIN)
  // The budget covers every number of the business, so a key limited to some numbers may not change it.
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Set the monthly WhatsApp budget (an alert fires at 80%)' })
  async updateSettings(@CurrentApiKey() apiKey: ApiKey, @Body() dto: BudgetDto) {
    return this.costs.updateSettings((await this.scope(apiKey)).businessId, dto.monthlyBudgetInr ?? null);
  }
}
