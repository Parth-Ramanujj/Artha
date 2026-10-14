import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus, BadRequestException, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { AgentService } from './agent.service';
import { LeadService } from './lead.service';
import { CreateWorkflowDto, UpdateWorkflowDto, TestWebhookDto } from './dto/workflow.dto';
import { WorkflowStatus, TriggerType } from './entities/workflow-definition.entity';
import { RunStatus } from './entities/workflow-run.entity';
import { RequireRole, CurrentApiKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { INSURANCE_PRESET_NODES, INSURANCE_PRESET_EDGES } from './presets/insurance-workflow.preset';

@ApiTags('workflows')
@Controller('workflows')
@RequireActiveBusiness()
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly executor: WorkflowExecutor,
    @Optional()
    private readonly agentService?: AgentService,
    @Optional()
    private readonly leadService?: LeadService,
  ) {}

  private getBusinessId(apiKey?: ApiKey): string | null {
    return apiKey?.businessId ?? null;
  }

  @Get('agents/list')
  @ApiOperation({ summary: 'List all certified insurance & mutual fund advisory agents' })
  async listAgents(@CurrentApiKey() apiKey: ApiKey) {
    if (!this.agentService) return [];
    return this.agentService.listAgents(this.getBusinessId(apiKey) || undefined);
  }

  @Get('leads/list')
  @ApiOperation({ summary: 'List captured insurance & mutual fund advisory leads' })
  async listLeads(@CurrentApiKey() apiKey: ApiKey) {
    if (!this.leadService) return [];
    return this.leadService.listLeads(this.getBusinessId(apiKey) || undefined);
  }

  @Post('presets/seed-insurance')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create and publish the complete Insurance & Mutual Fund Automation Workflow' })
  async seedInsurancePreset(@CurrentApiKey() apiKey: ApiKey) {
    const businessId = this.getBusinessId(apiKey);
    const existing = await this.workflowService.findAll(businessId, { limit: 50 });
    const found = existing.find(w => w.name.includes('Insurance') || w.name.includes('Mutual Fund'));
    if (found) {
      if (found.status !== WorkflowStatus.PUBLISHED) {
        await this.workflowService.publish(found.id, businessId, apiKey?.id);
      }
      return this.workflowService.findOne(found.id, businessId);
    }

    const newWorkflow = await this.workflowService.create(
      businessId,
      {
        name: 'Insurance & Mutual Fund Advisory Bot',
        description:
          'End-to-end interactive WhatsApp advisor: Buy/Port/Renew policies, Claim Support, Insurance Audit, SIP/Mutual Funds, Pincode verification, and live Agent matching with Call Now / WhatsApp direct actions.',
        definition: {
          trigger: {
            type: TriggerType.KEYWORD_MATCH,
            config: {
              keyword: 'hi, hello, start, insurance, mutual fund, claim, sip, policy, help, artha',
            },
          },
          nodes: INSURANCE_PRESET_NODES as any,
          edges: INSURANCE_PRESET_EDGES as any,
        },
      },
      apiKey?.id,
    );

    return this.workflowService.publish(newWorkflow.id, businessId, apiKey?.id);
  }

  @Post('test-webhook')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test an HTTP webhook/API call with parameters and variables' })
  async testWebhook(@Body() dto: TestWebhookDto) {
    return this.executor.testWebhookCall(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workflow definitions for the current business' })
  @ApiQuery({ name: 'status', required: false, enum: WorkflowStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: WorkflowStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.workflowService.findAll(this.getBusinessId(apiKey), {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workflow definition' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.workflowService.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a workflow definition (draft)' })
  @ApiResponse({ status: 201, description: 'Workflow created' })
  async create(@Body() dto: CreateWorkflowDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.workflowService.create(this.getBusinessId(apiKey), dto, apiKey?.id);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a draft workflow definition' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.workflowService.update(id, this.getBusinessId(apiKey), dto, apiKey?.id);
  }

  @Post(':id/publish')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a workflow (makes it active)' })
  @ApiParam({ name: 'id' })
  async publish(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.workflowService.publish(id, this.getBusinessId(apiKey), apiKey?.id);
  }

  @Post(':id/disable')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable a published workflow' })
  @ApiParam({ name: 'id' })
  async disable(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.workflowService.disable(id, this.getBusinessId(apiKey), apiKey?.id);
  }

  @Post(':id/test')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger a test execution of a workflow' })
  @ApiParam({ name: 'id' })
  async testRun(
    @Param('id') id: string,
    @Body() dto: { sessionId?: string; chatId?: string; messageBody?: string },
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    const wf = await this.workflowService.findOne(id, this.getBusinessId(apiKey));
    const sessionId = dto.sessionId;
    const ctx: TriggerContext = {
      businessId: wf.businessId,
      sessionId,
      chatId: dto.chatId || '919876543210@c.us',
      messageBody: dto.messageBody || 'Test workflow message',
      messageType: 'text',
      metadata: { isTest: true },
    };
    const run = await this.workflowService.createRun(wf, { isTest: true, ...dto }, sessionId);
    if (!run) throw new BadRequestException('Could not create workflow test run');
    await this.executor.execute(wf, run, ctx);
    return this.workflowService.findRun(run.id, this.getBusinessId(apiKey));
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Delete a draft or disabled workflow' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    await this.workflowService.delete(id, this.getBusinessId(apiKey));
  }

  // ── Runs ──

  @Get('runs/list')
  @ApiOperation({ summary: 'List workflow runs for the current business' })
  @ApiQuery({ name: 'workflowId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: RunStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findRuns(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('workflowId') workflowId?: string,
    @Query('status') status?: RunStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.workflowService.findRuns(this.getBusinessId(apiKey), {
      workflowId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get a workflow run by ID' })
  @ApiParam({ name: 'id' })
  async findRun(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.workflowService.findRun(id, this.getBusinessId(apiKey));
  }

  @Post('runs/:id/cancel')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a running workflow' })
  @ApiParam({ name: 'id' })
  async cancelRun(@Param('id') id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.workflowService.cancelRun(id, this.getBusinessId(apiKey));
  }
}
