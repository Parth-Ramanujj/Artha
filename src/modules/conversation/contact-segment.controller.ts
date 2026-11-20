import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { ContactSegmentService } from './contact-segment.service';
import { BusinessService } from '../business/business.service';
import { CreateContactSegmentDto, UpdateContactSegmentDto } from './dto/contact-segment.dto';

@ApiTags('contact-segments')
@Controller('contact-segments')
@RequireActiveBusiness()
export class ContactSegmentController {
  constructor(
    private readonly service: ContactSegmentService,
    private readonly businessService: BusinessService,
  ) {}

  /** A key without a business (the platform admin) works on the default business, like the inbox. */
  private async getBusinessId(apiKey: { businessId?: string }): Promise<string> {
    return apiKey.businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
  }

  @Get()
  @ApiOperation({ summary: 'List contact segments' })
  @ApiResponse({ status: 200, description: 'List of contact segments' })
  async findAll(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAll(await this.getBusinessId(apiKey), {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get segment by ID' })
  async findOne(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.findOne(id, await this.getBusinessId(apiKey));
  }

  @Get(':id/contacts')
  @ApiOperation({ summary: 'Get contacts in segment' })
  async getContacts(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getContacts(id, await this.getBusinessId(apiKey), {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create contact segment' })
  @ApiResponse({ status: 201, description: 'Created' })
  async create(@CurrentApiKey() apiKey: { businessId?: string; id?: string }, @Body() dto: CreateContactSegmentDto) {
    return this.service.create(await this.getBusinessId(apiKey), dto, apiKey.id);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update contact segment' })
  async update(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateContactSegmentDto,
  ) {
    return this.service.update(id, await this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete contact segment' })
  async remove(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.service.remove(id, await this.getBusinessId(apiKey));
  }
}
