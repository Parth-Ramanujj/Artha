import { Controller, Get, Post, Delete, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireActiveBusiness } from '../auth/guards/business-scope.guard';
import { CurrentApiKey, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
@RequireActiveBusiness()
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  private getBusinessId(apiKey: { businessId?: string }): string {
    return apiKey.businessId ?? '';
  }

  @Get()
  @ApiOperation({ summary: 'List notifications' })
  @ApiResponse({ status: 200, description: 'List of notifications' })
  findAll(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAll(this.getBusinessId(apiKey), {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentApiKey() apiKey: { businessId?: string }) {
    const count = await this.service.getUnreadCount(this.getBusinessId(apiKey));
    return { count };
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    return this.service.markAsRead(id, this.getBusinessId(apiKey));
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentApiKey() apiKey: { businessId?: string }) {
    await this.service.markAllRead(this.getBusinessId(apiKey));
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete notification' })
  async delete(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id') id: string) {
    await this.service.delete(id, this.getBusinessId(apiKey));
  }

  @Delete()
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete all notifications' })
  async deleteAll(@CurrentApiKey() apiKey: { businessId?: string }) {
    await this.service.deleteAll(this.getBusinessId(apiKey));
  }
}
