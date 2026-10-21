import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { AiAgentService } from './ai-agent.service';
import { AiCopilotService } from './ai-copilot.service';
import { AiAgentInputDto, BuildAgentDto, CopilotRequestDto, TestAgentDto, VoicePreviewDto } from './dto/ai-agent.dto';

/** AI chat agents, the chat Copilot and the voice preview. */
@ApiTags('ai')
@Controller('ai')
@RequireActiveBusiness()
export class AiAgentController {
  constructor(
    private readonly agents: AiAgentService,
    private readonly copilot: AiCopilotService,
  ) {}

  private business(apiKey: ApiKey): string {
    return apiKey?.businessId ?? '';
  }

  @Get('agents')
  @RequireRole(ApiKeyRole.VIEWER)
  @ApiOperation({ summary: 'List AI chat agents' })
  list(@CurrentApiKey() apiKey: ApiKey) {
    return this.agents.list(this.business(apiKey));
  }

  @Post('agents')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create an AI chat agent (built-in model or external webhook)' })
  create(@Body() dto: AiAgentInputDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.agents.create(this.business(apiKey), dto);
  }

  @Post('agents/build')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Draft an agent from a plain-language description (auto-reply starts off)' })
  build(@Body() dto: BuildAgentDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.agents.build(this.business(apiKey), dto.prompt);
  }

  @Put('agents/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update an AI chat agent' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AiAgentInputDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.agents.update(this.business(apiKey), id, dto);
  }

  @Delete('agents/:id')
  @HttpCode(204)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete an AI chat agent' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.agents.remove(this.business(apiKey), id);
  }

  @Post('agents/:id/test')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Chat with an agent without sending anything to customers' })
  test(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TestAgentDto, @CurrentApiKey() apiKey: ApiKey) {
    return this.agents.test(this.business(apiKey), id, dto.message, dto.history);
  }

  @Post('agents/:id/ping')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Send a test message to an external agent and report its latency' })
  ping(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    return this.agents.ping(this.business(apiKey), id);
  }

  @Get('voices')
  @RequireRole(ApiKeyRole.VIEWER)
  @ApiOperation({ summary: 'Voices available for the voice preview' })
  voices() {
    return this.copilot.voices();
  }

  @Post('voice/preview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Speak a sample text with a Sarvam voice (base64 WAV)' })
  voicePreview(@Body() dto: VoicePreviewDto) {
    return this.copilot.voicePreview(dto);
  }

  @Post('copilot')
  @RequireRole(ApiKeyRole.VIEWER)
  @ApiOperation({ summary: 'Chat Copilot: summary, reply suggestions, tone rewrite or translation' })
  runCopilot(@Body() dto: CopilotRequestDto) {
    return this.copilot.run(dto);
  }
}
