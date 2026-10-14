import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { AddMembershipDto, UpdateMembershipDto } from './dto/add-membership.dto';
import { RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';
import { CurrentApiKey } from '../auth/decorators/auth.decorators';

@ApiTags('Businesses')
@ApiBearerAuth()
@Controller('businesses')
@RequireUnscopedKey()
@RequireRole(ApiKeyRole.ADMIN)
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new business' })
  create(@Body() dto: CreateBusinessDto) {
    return this.businessService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all businesses' })
  findAll(@CurrentApiKey() apiKey: ApiKey) {
    return this.businessService.findAll(apiKey.businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a business by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    this.businessService.assertBusinessAccess(apiKey.businessId, id);
    return this.businessService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a business' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBusinessDto, @CurrentApiKey() apiKey: ApiKey) {
    this.businessService.assertBusinessAccess(apiKey.businessId, id);
    return this.businessService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a business' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    this.businessService.assertBusinessAccess(apiKey.businessId, id);
    await this.businessService.remove(id);
  }

  @Post(':id/memberships')
  @ApiOperation({ summary: 'Add an API key membership to a business' })
  addMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMembershipDto,
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    this.businessService.assertBusinessAccess(apiKey.businessId, id);
    return this.businessService.addMembership(id, dto);
  }

  @Get(':id/memberships')
  @ApiOperation({ summary: 'List memberships for a business' })
  listMemberships(@Param('id', ParseUUIDPipe) id: string, @CurrentApiKey() apiKey: ApiKey) {
    this.businessService.assertBusinessAccess(apiKey.businessId, id);
    return this.businessService.listMemberships(id);
  }

  @Put(':id/memberships/:membershipId')
  @ApiOperation({ summary: 'Update a membership role' })
  updateMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMembershipDto,
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    this.businessService.assertBusinessAccess(apiKey.businessId, id);
    return this.businessService.updateMembership(id, membershipId, dto);
  }

  @Delete(':id/memberships/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a membership' })
  async removeMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentApiKey() apiKey: ApiKey,
  ) {
    this.businessService.assertBusinessAccess(apiKey.businessId, id);
    await this.businessService.removeMembership(id, membershipId);
  }
}
