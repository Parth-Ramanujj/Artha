import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { sessionScopeVisible } from '../../common/security/session-scope';
import { WhatsAppFormService } from './whatsapp-form.service';
import {
  PublishWhatsAppFormDto,
  SendWhatsAppFormDto,
  UpdateWhatsAppFormDto,
  WhatsAppFormDto,
} from './dto/whatsapp-form.dto';

@ApiTags('whatsapp-forms')
@Controller('whatsapp-forms')
@RequireActiveBusiness()
export class WhatsAppFormController {
  constructor(
    private readonly forms: WhatsAppFormService,
    private readonly businessService: BusinessService,
  ) {}

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  private assertSession(apiKey: ApiKey | undefined, sessionId: string): void {
    if (!sessionScopeVisible(apiKey?.allowedSessions, sessionId)) {
      throw new ForbiddenException('This API key may not use that WhatsApp number');
    }
  }

  @Get()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'List WhatsApp forms' })
  async list(@CurrentApiKey() apiKey: ApiKey) {
    return this.forms.list(await this.businessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a WhatsApp form (draft)' })
  async create(@CurrentApiKey() apiKey: ApiKey, @Body() dto: WhatsAppFormDto) {
    return this.forms.create(await this.businessId(apiKey), dto);
  }

  @Get(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get a WhatsApp form' })
  async get(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.get(await this.businessId(apiKey), id);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a WhatsApp form. Published forms go back to draft until republished' })
  async update(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWhatsAppFormDto,
  ) {
    return this.forms.update(await this.businessId(apiKey), id, dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a WhatsApp form' })
  async remove(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    await this.forms.delete(await this.businessId(apiKey), id);
  }

  @Get(':id/submissions')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Answers customers submitted to a form, newest first' })
  async listSubmissions(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.listSubmissions(await this.businessId(apiKey), id);
  }

  @Post(':id/publish')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Upload the form to Meta and publish it' })
  async publish(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishWhatsAppFormDto,
  ) {
    this.assertSession(apiKey, dto.sessionId);
    return this.forms.publish(await this.businessId(apiKey), id, dto.sessionId);
  }

  @Post(':id/send')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send a published form to a phone number' })
  async send(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendWhatsAppFormDto,
  ) {
    this.assertSession(apiKey, dto.sessionId);
    return this.forms.send(await this.businessId(apiKey), id, dto);
  }
}
