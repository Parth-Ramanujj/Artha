import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentApiKey, Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { CustomerCareService } from './customer-care.service';
import { AssistantService } from './assistant.service';

export class UpdateCustomerCareDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() missedCall?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() assistant?: Record<string, unknown>;
}

export class ReportMissedCallDto {
  @ApiProperty({ example: '+919876543210' }) @IsString() @IsNotEmpty() @MaxLength(30) phone: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: ['phone', 'whatsapp'] }) @IsOptional() @IsIn(['phone', 'whatsapp']) source?: string;
  /** Ignored; lets automation apps send a boolean without failing validation. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() test?: boolean;
}

export class AssistantChatDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) message: string;
}

@ApiTags('customer-care')
@Controller('customer-care')
@RequireActiveBusiness()
export class CustomerCareController {
  constructor(
    private readonly care: CustomerCareService,
    private readonly assistant: AssistantService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  @Get('settings')
  async settings(@CurrentApiKey() apiKey: ApiKey) {
    return this.care.getSettings(await this.businessId(apiKey));
  }

  @Put('settings')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateSettings(@CurrentApiKey() apiKey: ApiKey, @Body() dto: UpdateCustomerCareDto) {
    const saved = await this.care.updateSettings(await this.businessId(apiKey), dto);
    await this.assistant.refresh();
    return saved;
  }

  @Get('missed-calls')
  async list(@CurrentApiKey() apiKey: ApiKey, @Query('limit') limit?: string) {
    return this.care.list(await this.businessId(apiKey), Number(limit) || 50);
  }

  @Post('missed-calls')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({
    summary: 'Report a missed call from a phone call log (Android app / automation); sends the WhatsApp follow-up',
  })
  async report(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ReportMissedCallDto) {
    return this.care.report(await this.businessId(apiKey), { phone: dto.phone, name: dto.name, source: dto.source });
  }
}

/** The customer-facing assistant page. Public: the unguessable token in the link is the only key. */
@ApiTags('customer-care')
@Controller('assistant')
export class AssistantPublicController {
  constructor(private readonly assistant: AssistantService) {}

  @Public()
  @Get(':token')
  async view(@Param('token') token: string) {
    return this.assistant.view(token);
  }

  @Public()
  @Post(':token/chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Param('token') token: string, @Body() dto: AssistantChatDto) {
    return this.assistant.chat(token, dto.message);
  }

  @Public()
  @Post(':token/voice')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a voice conversation with the assistant in the browser' })
  async voice(@Param('token') token: string) {
    return this.assistant.startVoice(token);
  }
}
