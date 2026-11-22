import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';
import { ReminderService } from './reminder.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';
import { ReminderStatus } from './entities/reminder.entity';

@ApiTags('reminders')
@RequireUnscopedKey()
@Controller('reminders')
@RequireActiveBusiness()
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  private getBusinessId(apiKey?: ApiKey): string {
    return apiKey?.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List follow-up reminders (default: open ones, soonest first)' })
  @ApiQuery({ name: 'status', required: false, enum: ReminderStatus })
  @ApiQuery({ name: 'dealId', required: false })
  @ApiQuery({ name: 'dueBefore', required: false, description: 'ISO date; returns reminders due at or before it' })
  findAll(
    @CurrentApiKey() apiKey: ApiKey,
    @Query('status') status?: string,
    @Query('dealId') dealId?: string,
    @Query('dueBefore') dueBefore?: string,
  ) {
    const due = dueBefore ? new Date(dueBefore) : undefined;
    if (due && Number.isNaN(due.getTime())) throw new BadRequestException('dueBefore must be an ISO date');
    return this.reminderService.findAll(this.getBusinessId(apiKey), {
      status: status ?? ReminderStatus.OPEN,
      dealId,
      dueBefore: due,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reminder by ID' })
  @ApiParam({ name: 'id' })
  findOne(@CurrentApiKey() apiKey: ApiKey, @Param('id') id: string) {
    return this.reminderService.findOne(id, this.getBusinessId(apiKey));
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a follow-up reminder for staff' })
  create(@CurrentApiKey() apiKey: ApiKey, @Body() dto: CreateReminderDto) {
    return this.reminderService.create(this.getBusinessId(apiKey), dto);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update, snooze or complete a reminder (status: open | done)' })
  @ApiParam({ name: 'id' })
  update(@CurrentApiKey() apiKey: ApiKey, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    return this.reminderService.update(id, this.getBusinessId(apiKey), dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete a reminder' })
  @ApiParam({ name: 'id' })
  remove(@CurrentApiKey() apiKey: ApiKey, @Param('id') id: string) {
    return this.reminderService.remove(id, this.getBusinessId(apiKey));
  }
}
