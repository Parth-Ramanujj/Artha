import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { BusinessService } from '../business/business.service';
import { sessionScopeVisible } from '../../common/security/session-scope';
import { Session } from '../session/entities/session.entity';
import { WaBusinessService } from './wa-business.service';

class SessionQueryDto {
  @IsString() @MaxLength(64) sessionId: string;
}

class AdsQueryDto {
  @IsOptional() @IsString() @MaxLength(64) sessionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

class CallingSettingsDto {
  @IsString() @MaxLength(64) sessionId: string;
  @IsBoolean() enabled: boolean;
  @IsBoolean() showCallButton: boolean;
}

class CallPermissionDto {
  @IsString() @MaxLength(64) sessionId: string;
  @IsString() @MaxLength(32) phone: string;
  @IsString() @MinLength(1) @MaxLength(1024) text: string;
}

class InvoiceItemDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsNumber() @Min(0.01) @Max(100_000) qty: number;
  @IsNumber() @Min(0) @Max(10_000_000) price: number;
}

class CreateInvoiceDto {
  @IsString() @MaxLength(64) sessionId: string;
  @IsString() @MinLength(1) @MaxLength(120) sellerName: string;
  @IsOptional() @IsString() @MaxLength(20) sellerGstin?: string;
  @IsOptional() @IsString() @MaxLength(300) sellerAddress?: string;
  @IsString() @MinLength(1) @MaxLength(120) customerName: string;
  @IsString() @MaxLength(32) phone: string;
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  items: InvoiceItemDto[];
  @IsNumber() @IsIn([0, 5, 12, 18, 28]) gstPercent: number;
  @IsIn(['paid', 'unpaid']) status: 'paid' | 'unpaid';
  @IsBoolean() send: boolean;
}

/** Ads leads, WhatsApp calling and invoices for the caller's own official numbers. */
@ApiTags('wa-business')
@Controller('wa-business')
export class WaBusinessController {
  constructor(
    private readonly service: WaBusinessService,
    private readonly businessService: BusinessService,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

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
    if (!(await this.visibleSessionIds(apiKey)).includes(sessionId))
      throw new ForbiddenException('That WhatsApp number is not available to you');
  }

  @Get('ads')
  @ApiOperation({ summary: 'Chats that started from Click-to-WhatsApp ads, grouped by ad' })
  async ads(@CurrentApiKey() apiKey: ApiKey, @Query() q: AdsQueryDto) {
    const visible = await this.visibleSessionIds(apiKey);
    return this.service.adLeads(q.sessionId ? visible.filter(id => id === q.sessionId) : visible, q.days ?? 30);
  }

  @Get('calls')
  @ApiOperation({ summary: 'WhatsApp Calling settings and call log for one number' })
  async calls(@CurrentApiKey() apiKey: ApiKey, @Query() q: SessionQueryDto) {
    await this.assertSession(apiKey, q.sessionId);
    return this.service.callOverview(q.sessionId);
  }

  @Put('calls/settings')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Turn WhatsApp Calling and the in-chat call button on or off' })
  async setCalling(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CallingSettingsDto) {
    await this.assertSession(apiKey, dto.sessionId);
    return this.service.setCalling(dto.sessionId, dto.enabled, dto.showCallButton);
  }

  @Post('calls/permission')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Ask a customer for permission to call them on WhatsApp' })
  async askPermission(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CallPermissionDto) {
    await this.assertSession(apiKey, dto.sessionId);
    return this.service.askCallPermission(dto.sessionId, dto.phone, dto.text);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Invoices sent on WhatsApp (newest first)' })
  async invoices(@CurrentApiKey() apiKey: ApiKey) {
    return this.service.listInvoices(await this.businessId(apiKey));
  }

  @Post('invoices')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a GST invoice / receipt and optionally send it as a PDF on WhatsApp' })
  async createInvoice(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateInvoiceDto) {
    await this.assertSession(apiKey, dto.sessionId);
    return this.service.createInvoice(await this.businessId(apiKey), dto);
  }

  @Post('invoices/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send (again) an invoice PDF on WhatsApp' })
  async sendInvoice(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    const businessId = await this.businessId(apiKey);
    const inv = await this.service.getInvoice(businessId, id);
    await this.assertSession(apiKey, inv.sessionId);
    return this.service.sendInvoice(businessId, id);
  }

  @Get('invoices/:id/pdf')
  @ApiOperation({ summary: 'Download an invoice PDF' })
  async pdf(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const inv = await this.service.getInvoice(await this.businessId(apiKey), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${inv.number}.pdf"`);
    res.send(this.service.pdfOf(inv));
  }
}
