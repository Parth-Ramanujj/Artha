import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { ContactSegmentService } from './contact-segment.service';
import { CreateContactSegmentDto, UpdateContactSegmentDto } from './dto/contact-segment.dto';

@ApiTags('contact-segments')
@Controller('contact-segments')
@RequireActiveBusiness()
export class ContactSegmentController {
  constructor(private readonly service: ContactSegmentService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List contact segments' })
  @ApiResponse({ status: 200, description: 'List of contact segments' })
  findAll(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAll(this.getBusinessId(apiKey), {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get segment by ID' })
  findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.findOne(id, this.getBusinessId(apiKey));
  }

  @Get(':id/contacts')
  @ApiOperation({ summary: 'Get contacts in segment' })
  getContacts(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getContacts(id, this.getBusinessId(apiKey), {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create contact segment' })
  @ApiResponse({ status: 201, description: 'Created' })
  create(@CurrentApiKey() apiKey: { businessId?: string; id?: string }, @Body() dto: CreateContactSegmentDto) {
    return this.service.create(this.getBusinessId(apiKey), dto, apiKey.id);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update contact segment' })
  update(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateContactSegmentDto,
  ) {
    return this.service.update(id, this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete contact segment' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.service.remove(id, this.getBusinessId(apiKey));
  }
}
