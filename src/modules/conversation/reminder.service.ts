import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reminder, ReminderReason, ReminderStatus } from './entities/reminder.entity';
import { Deal } from './entities/deal.entity';
import { NotificationService } from './notification.service';
import { NotificationType } from './entities/notification.entity';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';
import { DateTransformer } from '../../common/transformers/date.transformer';
import { createLogger } from '../../common/services/logger.service';

const DUE_CHECK_INTERVAL_MS = 60 * 1000;
const DUE_BATCH = 200;

// Same encoding rule as followup.service: DateTransformer writes ISO text on SQLite, so query parameters must match it.
const toDbDate = (date: Date) => DateTransformer.to(date) as string | Date;

export interface AutomaticReminderInput {
  businessId: string;
  conversationId: string;
  dealStage: string;
  sourceRuleId: string;
  reason: ReminderReason.SEQUENCE_EXHAUSTED | ReminderReason.CUSTOMER_REPLIED;
  /** The follow-up cycle this reminder belongs to (its last attempt), so one cycle raises at most one reminder. */
  cycleAt: Date;
}

@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('ReminderService');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(Reminder, 'data') private readonly repo: Repository<Reminder>,
    @InjectRepository(Deal, 'data') private readonly dealRepo: Repository<Deal>,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.dispatchDue(), DUE_CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async findAll(businessId: string, filter: { status?: string; dealId?: string; dueBefore?: Date } = {}) {
    const qb = this.repo.createQueryBuilder('r').where('r.businessId = :businessId', { businessId });
    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.dealId) qb.andWhere('r.dealId = :dealId', { dealId: filter.dealId });
    if (filter.dueBefore) qb.andWhere('r.dueAt <= :dueBefore', { dueBefore: toDbDate(filter.dueBefore) });
    return qb.orderBy('r.dueAt', 'ASC').take(500).getMany();
  }

  async findOne(id: string, businessId: string): Promise<Reminder> {
    const reminder = await this.repo.findOne({ where: { id, businessId } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    return reminder;
  }

  async create(businessId: string, dto: CreateReminderDto): Promise<Reminder> {
    let assignedTo = dto.assignedTo;
    if (dto.dealId) {
      const deal = await this.dealRepo.findOne({ where: { id: dto.dealId, businessId } });
      if (!deal) throw new BadRequestException(`Linked deal "${dto.dealId}" not found`);
      assignedTo ??= deal.assignedTo;
    }
    const reminder = this.repo.create({
      businessId,
      dealId: dto.dealId ?? null,
      title: dto.title,
      notes: dto.notes ?? null,
      assignedTo: assignedTo ?? 'Unassigned',
      dueAt: new Date(dto.dueAt),
      reason: ReminderReason.MANUAL,
      status: ReminderStatus.OPEN,
    });
    return this.repo.save(reminder);
  }

  async update(id: string, businessId: string, dto: UpdateReminderDto): Promise<Reminder> {
    const reminder = await this.findOne(id, businessId);
    if (dto.title !== undefined) reminder.title = dto.title;
    if (dto.notes !== undefined) reminder.notes = dto.notes;
    if (dto.assignedTo !== undefined) reminder.assignedTo = dto.assignedTo;
    if (dto.dueAt !== undefined) {
      reminder.dueAt = new Date(dto.dueAt);
      // Snoozing an already-notified reminder must notify again when it comes due.
      reminder.notifiedAt = null;
    }
    if (dto.status !== undefined && dto.status !== reminder.status) {
      reminder.status = dto.status;
      reminder.completedAt = dto.status === ReminderStatus.DONE ? new Date() : null;
    }
    return this.repo.save(reminder);
  }

  async remove(id: string, businessId: string): Promise<void> {
    const reminder = await this.findOne(id, businessId);
    await this.repo.remove(reminder);
  }

  /**
   * Raises a reminder for a deal whose follow-up sequence ended or whose customer replied.
   * Returns null when the cycle already has one, or when the deal has moved on from the stage the rule targets.
   */
  async raiseAutomatic(input: AutomaticReminderInput): Promise<Reminder | null> {
    const deal = await this.dealRepo.findOne({
      where: {
        businessId: input.businessId,
        conversationId: input.conversationId,
        stage: input.dealStage as Deal['stage'],
      },
    });
    if (!deal) return null;

    const existing = await this.repo
      .createQueryBuilder('r')
      .where('r.businessId = :businessId', { businessId: input.businessId })
      .andWhere('r.conversationId = :conversationId', { conversationId: input.conversationId })
      .andWhere('r.reason = :reason', { reason: input.reason })
      .andWhere('r.cycleAt = :cycleAt', { cycleAt: toDbDate(input.cycleAt) })
      .getCount();
    if (existing > 0) return null;

    const title =
      input.reason === ReminderReason.CUSTOMER_REPLIED
        ? `Customer replied: ${deal.title}`
        : `No reply after follow-ups: ${deal.title}`;
    const reminder = this.repo.create({
      businessId: input.businessId,
      dealId: deal.id,
      conversationId: input.conversationId,
      sourceRuleId: input.sourceRuleId,
      reason: input.reason,
      cycleAt: input.cycleAt,
      title,
      assignedTo: deal.assignedTo,
      dueAt: new Date(),
      status: ReminderStatus.OPEN,
    });
    return this.repo.save(reminder);
  }

  /** Notifies every open reminder that has come due, once each. Returns how many were notified. */
  async dispatchDue(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let notified = 0;
    try {
      const due = await this.repo
        .createQueryBuilder('r')
        .where('r.status = :open', { open: ReminderStatus.OPEN })
        .andWhere('r.dueAt <= :now', { now: toDbDate(now) })
        .andWhere('r.notifiedAt IS NULL')
        .orderBy('r.dueAt', 'ASC')
        .take(DUE_BATCH)
        .getMany();
      for (const reminder of due) {
        try {
          await this.notifications.notify(
            reminder.businessId,
            NotificationType.REMINDER_DUE,
            reminder.title,
            reminder.assignedTo && reminder.assignedTo !== 'Unassigned' ? `For ${reminder.assignedTo}` : undefined,
            { reminderId: reminder.id, dealId: reminder.dealId, conversationId: reminder.conversationId },
          );
          reminder.notifiedAt = now;
          await this.repo.save(reminder);
          notified++;
        } catch (error) {
          this.logger.warn(`Reminder notification failed for ${reminder.id}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error(`Reminder dispatch failed: ${error}`);
    } finally {
      this.running = false;
    }
    return notified;
  }
}
