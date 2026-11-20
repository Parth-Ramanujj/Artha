import {
  BadRequestException,
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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { BusinessService } from '../business/business.service';
import { sessionScopeVisible } from '../../common/security/session-scope';
import { Session } from '../session/entities/session.entity';
import { MessageStudioService } from './message-studio.service';
import { TemplateAutoTestService, normalizeTestPhone } from './template-auto-test.service';
import { TemplateAdviceService } from './template-advice.service';
import {
  ArchiveStudioMessageDto,
  AutoTestRetryDto,
  TemplateAdviceDto,
  SendApprovedTemplateDto,
  CreateMetaTemplateDto,
  ListStudioMessagesQueryDto,
  ProductDto,
  ProductQueryDto,
  SessionRefDto,
  StudioMessageDto,
  StudioSettingsDto,
  TemplatesQueryDto,
  TestSendDto,
  UpdateProductDto,
  UpdateStudioMessageDto,
  UploadStudioImageDto,
  ValidateStudioMessageDto,
} from './dto/message-studio.dto';

@ApiTags('message-studio')
@Controller('message-studio')
@RequireActiveBusiness()
export class MessageStudioController {
  constructor(
    private readonly studio: MessageStudioService,
    private readonly businessService: BusinessService,
    private readonly autoTests: TemplateAutoTestService,
    private readonly advice: TemplateAdviceService,
  ) {}

  private async defaultBusinessId(): Promise<string> {
    return (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  private async businessId(apiKey?: ApiKey): Promise<string> {
    return apiKey?.businessId ?? (await this.defaultBusinessId());
  }

  /** A session this key may use and that belongs to the key's business, or null when none was given. */
  private async session(apiKey: ApiKey | undefined, businessId: string, sessionId?: string): Promise<Session | null> {
    if (!sessionId) return null;
    if (!sessionScopeVisible(apiKey?.allowedSessions, sessionId)) {
      throw new ForbiddenException('This API key may not use that WhatsApp number');
    }
    return this.studio.requireSession(businessId, sessionId, await this.defaultBusinessId());
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'What the chosen WhatsApp number can send (buttons, lists, products, templates)' })
  async capabilities(@CurrentApiKey() apiKey: ApiKey, @Query('sessionId') sessionId?: string) {
    const businessId = await this.businessId(apiKey);
    return this.studio.capabilities(businessId, await this.session(apiKey, businessId, sessionId));
  }

  @Get('templates')
  @ApiOperation({ summary: 'Approved WhatsApp templates of a Cloud API number, with Meta approval status' })
  async listTemplates(@CurrentApiKey() apiKey: ApiKey, @Query() query: TemplatesQueryDto) {
    const businessId = await this.businessId(apiKey);
    const session = await this.session(apiKey, businessId, query.sessionId);
    return this.studio.templates(session!.id, query.refresh === 'true');
  }

  @Post('templates')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Submit a new WhatsApp template to Meta for approval (Cloud API numbers)' })
  async createTemplate(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateMetaTemplateDto) {
    const businessId = await this.businessId(apiKey);
    const session = await this.session(apiKey, businessId, dto.sessionId);
    const phone = dto.autoTestPhone ? normalizeTestPhone(dto.autoTestPhone) : null;
    if (dto.autoTestPhone && !phone) throw new BadRequestException('Test number: use a mobile number like 6352701839');
    const created = await this.studio.createTemplate(session!.id, dto);
    if (phone) await this.autoTests.watch(businessId, session!.id, dto.name, dto.language, phone);
    return created;
  }

  @Post('templates/send')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send an approved template to one phone now (Meta charges per its category)' })
  async sendApprovedTemplate(@CurrentApiKey() apiKey: ApiKey, @Body() dto: SendApprovedTemplateDto) {
    const businessId = await this.businessId(apiKey);
    const session = await this.session(apiKey, businessId, dto.sessionId);
    const phone = normalizeTestPhone(dto.phone);
    if (!phone) throw new BadRequestException('Use a mobile number like 6352701839');
    return this.studio.sendApprovedTemplate(session!.id, phone, dto.metaTemplate, dto.contactName);
  }

  @Post('templates/advice')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'AI review of a template draft: likely category, approval risks and a rewrite' })
  async templateAdvice(@Body() dto: TemplateAdviceDto) {
    return this.advice.advise(dto);
  }

  @Get('templates/auto-tests')
  @ApiOperation({ summary: 'Templates waiting to be sent to the test number once approved, and what happened' })
  async listAutoTests(@CurrentApiKey() apiKey: ApiKey) {
    const result = await this.autoTests.list(await this.businessId(apiKey));
    // A key limited to some numbers only sees tests for those numbers.
    return {
      ...result,
      autoTests: result.autoTests.filter(t => sessionScopeVisible(apiKey?.allowedSessions, t.sessionId)),
    };
  }

  @Post('templates/auto-tests/retry')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Try sending an approved template to the test number again (still only when free)' })
  async retryAutoTest(@CurrentApiKey() apiKey: ApiKey, @Body() dto: AutoTestRetryDto) {
    const businessId = await this.businessId(apiKey);
    const session = await this.session(apiKey, businessId, dto.sessionId);
    const result = await this.autoTests.retry(businessId, session!.id, dto.name, dto.language);
    if (!result) throw new BadRequestException('No test is set up for that template');
    return result;
  }

  @Post('media')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Upload an image to a Cloud API number (template header for campaigns)' })
  async uploadImage(@CurrentApiKey() apiKey: ApiKey, @Body() dto: UploadStudioImageDto) {
    const businessId = await this.businessId(apiKey);
    const session = await this.session(apiKey, businessId, dto.sessionId);
    return this.studio.uploadImage(session!.id, dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check a message against the number it will be sent from' })
  async validate(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ValidateStudioMessageDto) {
    const businessId = await this.businessId(apiKey);
    const result = await this.studio.validate(
      businessId,
      dto.kind,
      dto.content,
      await this.session(apiKey, businessId, dto.sessionId),
    );
    // The client already has its content; echoing an uploaded file back is wasted bandwidth.
    const { content: _content, ...rest } = result;
    return rest;
  }

  // ── messages ──

  @Get('messages')
  async listMessages(@CurrentApiKey() apiKey: ApiKey, @Query() query: ListStudioMessagesQueryDto) {
    return this.studio.list(await this.businessId(apiKey), query);
  }

  @Get('messages/published')
  @ApiOperation({ summary: 'Published messages an automation can send, with their reply choices' })
  async listPublished(@CurrentApiKey() apiKey: ApiKey) {
    return this.studio.publishedForWorkflows(await this.businessId(apiKey));
  }

  @Get('messages/:id')
  async getMessage(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.get(await this.businessId(apiKey), id);
  }

  @Post('messages')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Save a new message as a draft' })
  async createMessage(@CurrentApiKey() apiKey: ApiKey, @Body() dto: StudioMessageDto) {
    const businessId = await this.businessId(apiKey);
    return this.studio.create(businessId, dto, await this.session(apiKey, businessId, dto.sessionId));
  }

  @Put('messages/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateMessage(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudioMessageDto,
  ) {
    const businessId = await this.businessId(apiKey);
    return this.studio.update(businessId, id, dto, await this.session(apiKey, businessId, dto.sessionId));
  }

  @Post('messages/:id/duplicate')
  @RequireRole(ApiKeyRole.OPERATOR)
  async duplicateMessage(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.duplicate(await this.businessId(apiKey), id);
  }

  @Post('messages/:id/publish')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Mark a message ready so automations may send it' })
  async publishMessage(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SessionRefDto,
  ) {
    const businessId = await this.businessId(apiKey);
    const session = await this.session(apiKey, businessId, dto.sessionId);
    return this.studio.publish(businessId, id, session!);
  }

  @Post('messages/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  async unpublishMessage(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.unpublish(await this.businessId(apiKey), id);
  }

  @Post('messages/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  async archiveMessage(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveStudioMessageDto,
  ) {
    return this.studio.archive(await this.businessId(apiKey), id, dto.force === true);
  }

  @Post('messages/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  async restoreMessage(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.restore(await this.businessId(apiKey), id);
  }

  @Post('messages/:id/test')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send one test copy to a confirmed phone number through the connected WhatsApp number' })
  async testSend(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TestSendDto) {
    if (dto.confirm !== true) throw new BadRequestException('Confirm that a real WhatsApp message will be sent');
    const businessId = await this.businessId(apiKey);
    const session = await this.session(apiKey, businessId, dto.sessionId);
    return this.studio.testSend(businessId, id, session!, dto.phone);
  }

  @Get('messages/:id/test-status')
  @ApiOperation({ summary: 'Delivery status WhatsApp reported for the last test send' })
  async testStatus(@CurrentApiKey() apiKey: ApiKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.testStatus(await this.businessId(apiKey), id);
  }

  // ── products ──

  @Get('products')
  @ApiOperation({ summary: 'Search the product catalog (paginated)' })
  async listProducts(@CurrentApiKey() apiKey: ApiKey, @Query() query: ProductQueryDto) {
    return this.studio.listProducts(await this.businessId(apiKey), query);
  }

  @Post('products')
  @RequireRole(ApiKeyRole.OPERATOR)
  async createProduct(@CurrentApiKey() apiKey: ApiKey, @Body() dto: ProductDto) {
    return this.studio.createProduct(await this.businessId(apiKey), dto);
  }

  @Put('products/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  async updateProduct(
    @CurrentApiKey() apiKey: ApiKey,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.studio.updateProduct(await this.businessId(apiKey), id, dto);
  }

  // ── settings ──

  @Get('settings')
  async getSettings(@CurrentApiKey() apiKey: ApiKey) {
    return this.studio.getSettings(await this.businessId(apiKey));
  }

  @Put('settings')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Save the Meta catalog id used for product messages' })
  async updateSettings(@CurrentApiKey() apiKey: ApiKey, @Body() dto: StudioSettingsDto) {
    return this.studio.updateSettings(await this.businessId(apiKey), dto);
  }
}
