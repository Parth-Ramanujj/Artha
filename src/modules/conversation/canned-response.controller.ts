import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { CannedResponseService } from './canned-response.service';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './dto/canned-response.dto';

@ApiTags('canned-responses')
@Controller('canned-responses')
@RequireActiveBusiness()
export class CannedResponseController {
  constructor(private readonly service: CannedResponseService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List canned responses' })
  @ApiResponse({ status: 200, description: 'List of canned responses' })
  findAll(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAll(this.getBusinessId(apiKey), {
      category,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get canned response by ID' })
  findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create canned response' })
  @ApiResponse({ status: 201, description: 'Created' })
  create(@CurrentApiKey() apiKey: { businessId?: string; id?: string }, @Body() dto: CreateCannedResponseDto) {
    return this.service.create(this.getBusinessId(apiKey), dto, apiKey.id);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update canned response' })
  update(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.service.update(id, this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete canned response' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.service.remove(id, this.getBusinessId(apiKey));
  }
}
