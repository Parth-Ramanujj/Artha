import { DataSource, Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { Reminder, ReminderReason, ReminderStatus } from './entities/reminder.entity';
import { Deal, DealStage } from './entities/deal.entity';
import { NotificationType } from './entities/notification.entity';

describe('ReminderService (SQLite)', () => {
  let ds: DataSource;
  let reminderRepo: Repository<Reminder>;
  let dealRepo: Repository<Deal>;
  let notify: jest.Mock;
  let service: ReminderService;
  const now = new Date('2026-10-19T10:00:00Z');
  const minutesAfter = (m: number) => new Date(now.getTime() + m * 60_000);

  const addDeal = (businessId: string, conversationId: string | null, stage = DealStage.PROPOSAL) =>
    dealRepo.save(
      dealRepo.create({
        businessId,
        title: 'Big order',
        contactName: 'Asha',
        contactPhone: '911',
        stage,
        conversationId,
        assignedTo: 'Riya',
      }),
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Reminder, Deal],
      synchronize: true,
    });
    await ds.initialize();
    reminderRepo = ds.getRepository(Reminder);
    dealRepo = ds.getRepository(Deal);
    notify = jest.fn().mockResolvedValue({});
    service = new ReminderService(reminderRepo, dealRepo, { notify } as never);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  describe('create / update / remove', () => {
    it('links a deal and defaults the owner to the deal owner', async () => {
      const deal = await addDeal('biz', null);
      const created = await service.create('biz', {
        title: 'Call back',
        dueAt: minutesAfter(60).toISOString(),
        dealId: deal.id,
      });

      expect(created).toMatchObject({
        dealId: deal.id,
        assignedTo: 'Riya',
        reason: ReminderReason.MANUAL,
        status: 'open',
      });
    });

    it('refuses a deal from another business', async () => {
      const deal = await addDeal('other', null);
      await expect(service.create('biz', { title: 'x', dueAt: now.toISOString(), dealId: deal.id })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('stamps completedAt when marked done and clears it when reopened', async () => {
      const r = await service.create('biz', { title: 'x', dueAt: now.toISOString() });
      const done = await service.update(r.id, 'biz', { status: ReminderStatus.DONE });
      expect(done.completedAt).not.toBeNull();
      const reopened = await service.update(r.id, 'biz', { status: ReminderStatus.OPEN });
      expect(reopened.completedAt).toBeNull();
    });

    it('is scoped to its business', async () => {
      const r = await service.create('biz', { title: 'x', dueAt: now.toISOString() });
      await expect(service.findOne(r.id, 'other')).rejects.toThrow(NotFoundException);
      await expect(service.update(r.id, 'other', { title: 'hack' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('dispatchDue', () => {
    it('notifies a due reminder exactly once', async () => {
      const deal = await addDeal('biz', null);
      await service.create('biz', { title: 'Call Asha', dueAt: now.toISOString(), dealId: deal.id });

      await expect(service.dispatchDue(now)).resolves.toBe(1);
      await expect(service.dispatchDue(minutesAfter(5))).resolves.toBe(0);

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(
        'biz',
        NotificationType.REMINDER_DUE,
        'Call Asha',
        'For Riya',
        expect.any(Object),
      );
    });

    it('leaves a reminder that is not due yet alone', async () => {
      await service.create('biz', { title: 'Later', dueAt: minutesAfter(60).toISOString() });
      await expect(service.dispatchDue(now)).resolves.toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });

    it('skips completed reminders', async () => {
      const r = await service.create('biz', { title: 'Done already', dueAt: now.toISOString() });
      await service.update(r.id, 'biz', { status: ReminderStatus.DONE });
      await expect(service.dispatchDue(now)).resolves.toBe(0);
    });

    it('notifies again when a notified reminder is snoozed', async () => {
      const r = await service.create('biz', { title: 'Snooze me', dueAt: now.toISOString() });
      await service.dispatchDue(now);
      await service.update(r.id, 'biz', { dueAt: minutesAfter(30).toISOString() });

      await expect(service.dispatchDue(minutesAfter(10))).resolves.toBe(0);
      await expect(service.dispatchDue(minutesAfter(31))).resolves.toBe(1);
      expect(notify).toHaveBeenCalledTimes(2);
    });
  });

  describe('raiseAutomatic', () => {
    const input = (conversationId: string, cycleAt: Date, stage = 'proposal') => ({
      businessId: 'biz',
      conversationId,
      dealStage: stage,
      sourceRuleId: 'rule-1',
      reason: ReminderReason.SEQUENCE_EXHAUSTED as const,
      cycleAt,
    });

    it('raises one reminder per follow-up cycle', async () => {
      await addDeal('biz', 'convo-1');
      const cycle = minutesAfter(-100);

      expect(await service.raiseAutomatic(input('convo-1', cycle))).not.toBeNull();
      expect(await service.raiseAutomatic(input('convo-1', cycle))).toBeNull();
      // A later cycle of the same chat is a new reminder.
      expect(await service.raiseAutomatic(input('convo-1', minutesAfter(-10)))).not.toBeNull();
      expect(await reminderRepo.count()).toBe(2);
    });

    it('does nothing when the deal has already moved off the rule stage', async () => {
      await addDeal('biz', 'convo-2', DealStage.NEGOTIATION);
      expect(await service.raiseAutomatic(input('convo-2', now))).toBeNull();
      expect(await reminderRepo.count()).toBe(0);
    });
  });
});
