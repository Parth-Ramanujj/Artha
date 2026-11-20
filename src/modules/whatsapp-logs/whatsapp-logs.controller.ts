import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { BusinessService } from '../business/business.service';
import { sessionScopeVisible } from '../../common/security/session-scope';
import { Session } from '../session/entities/session.entity';
import { WhatsAppLogsService } from './whatsapp-logs.service';
import { WhatsAppHealthService } from './whatsapp-health.service';

class LogsQueryDto {
  @IsOptional() @IsString() @MaxLength(64) sessionId?: string;
  @IsOptional() @IsIn(['info', 'success', 'warning', 'error']) level?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
  @IsOptional() @IsString() @MaxLength(128) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_080) sinceMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
}

class SessionDto {
  @IsString() @MaxLength(64) sessionId: string;
}

/**
 * Message logs for official numbers: every send and webhook, plus a health check of the whole chain.
 * A customer sees only its own numbers; webhooks that matched no number are shown to the platform
 * admin only.
 */
@ApiTags('whatsapp-logs')
@Controller('whatsapp-logs')
export class WhatsAppLogsController {
  constructor(
    private readonly logs: WhatsAppLogsService,
    private readonly health: WhatsAppHealthService,
    private readonly businessService: BusinessService,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
  ) {}

  private async visibleSessionIds(apiKey?: ApiKey): Promise<string[]> {
    const defaultId = (await this.businessService.getOrCreateDefaultBusiness()).id;
    const businessId = apiKey?.businessId ?? defaultId;
    const rows = await this.sessions.find({ select: { id: true, businessId: true } });
    return rows
      .filter(s => (s.businessId ?? defaultId) === businessId)
      .filter(s => sessionScopeVisible(apiKey?.allowedSessions, s.id))
      .map(s => s.id);
  }

  private async assertSession(apiKey: ApiKey | undefined, sessionId: string) {
    if (!(await this.visibleSessionIds(apiKey)).includes(sessionId)) {
      throw new ForbiddenException('That WhatsApp number is not available to you');
    }
  }

  @Get()
  @ApiOperation({ summary: 'Message and webhook log for your official numbers (newest first, kept 7 days)' })
  async list(@CurrentApiKey() apiKey: ApiKey, @Query() q: LogsQueryDto) {
    const visible = await this.visibleSessionIds(apiKey);
    const sessionIds = q.sessionId ? visible.filter(id => id === q.sessionId) : visible;
    // Rejected / unmatched webhooks belong to no number; only the platform admin may see them.
    const includeGlobal = !q.sessionId && !apiKey?.businessId && !apiKey?.allowedSessions?.length;
    return this.logs.list({ ...q, sessionIds, includeGlobal });
  }

  @Get('health')
  @ApiOperation({ summary: 'Checks every link from sending to the delivery report for one number' })
  async check(@CurrentApiKey() apiKey: ApiKey, @Query() q: SessionDto) {
    await this.assertSession(apiKey, q.sessionId);
    return this.health.check(q.sessionId);
  }

  @Post('health/subscribe')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Subscribe the app to the WhatsApp account so Meta sends webhooks' })
  async subscribe(@CurrentApiKey() apiKey: ApiKey, @Body() dto: SessionDto) {
    await this.assertSession(apiKey, dto.sessionId);
    return this.health.subscribeApp(dto.sessionId);
  }
}
