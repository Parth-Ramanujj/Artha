import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/notification.dto';
import { createLogger } from '../../common/services/logger.service';

@Injectable()
export class NotificationService {
  private readonly logger = createLogger('NotificationService');

  constructor(
    @InjectRepository(Notification, 'data')
    private readonly repo: Repository<Notification>,
  ) {}

  async findAll(
    businessId: string,
    opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<Notification[]> {
    const qb = this.repo.createQueryBuilder('n').where('n.businessId = :businessId', { businessId });

    if (opts.unreadOnly) qb.andWhere('n.read = :read', { read: false });

    qb.orderBy('n.createdAt', 'DESC');
    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async getUnreadCount(businessId: string): Promise<number> {
    return this.repo.count({ where: { businessId, read: false } });
  }

  async markAsRead(id: string, businessId: string): Promise<Notification> {
    const notif = await this.repo.findOne({ where: { id } });
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.businessId !== businessId) throw new ForbiddenException('Not authorized');
    notif.read = true;
    notif.readAt = new Date();
    return this.repo.save(notif);
  }

  async markAllRead(businessId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ read: true, readAt: new Date() })
      .where('businessId = :businessId AND read = :read', { businessId, read: false })
      .execute();
  }

  async create(businessId: string, dto: CreateNotificationDto): Promise<Notification> {
    const notif = this.repo.create({
      businessId,
      type: dto.type,
      title: dto.title,
      message: dto.message ?? null,
      data: dto.data ?? null,
      recipientId: dto.recipientId ?? null,
    });
    return this.repo.save(notif);
  }

  async notify(
    businessId: string,
    type: NotificationType,
    title: string,
    message?: string,
    data?: Record<string, unknown>,
  ): Promise<Notification> {
    this.logger.log(`Notification [${type}]: ${title}`);
    return this.create(businessId, { type, title, message, data });
  }

  async delete(id: string, businessId: string): Promise<void> {
    const notif = await this.repo.findOne({ where: { id } });
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.businessId !== businessId) throw new ForbiddenException('Not authorized');
    await this.repo.remove(notif);
  }

  async deleteAll(businessId: string): Promise<void> {
    await this.repo.delete({ businessId });
  }
}
