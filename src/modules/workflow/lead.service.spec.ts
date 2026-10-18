import { NotFoundException } from '@nestjs/common';
import { LeadService } from './lead.service';
import { Lead, LeadStatus } from './entities/lead.entity';
import { FollowupAttempt } from '../conversation/entities/followup-attempt.entity';

describe('LeadService lead list and status', () => {
  const lead = (overrides: Partial<Lead>): Lead =>
    ({
      id: 'l1',
      leadNumber: 'LD-WA-1',
      businessId: 'biz',
      chatId: '911111111111@c.us',
      customerPhone: '911111111111',
      status: LeadStatus.NEW,
      createdAt: new Date('2026-10-17T10:00:00Z'),
      ...overrides,
    }) as Lead;

  let leads: Lead[];
  let attempts: FollowupAttempt[];
  let service: LeadService;

  beforeEach(() => {
    leads = [
      lead({}),
      lead({ id: 'l2', leadNumber: 'LD-WA-2', chatId: '912222222222@c.us', customerPhone: '912222222222' }),
      lead({ id: 'l3', businessId: 'other', chatId: '913333333333@c.us' }),
    ];
    attempts = [
      {
        chatId: '911111111111@c.us',
        businessId: 'biz',
        sentAt: new Date('2026-10-18T04:35:00Z'),
        recoveredAt: new Date('2026-10-18T05:00:00Z'),
      } as FollowupAttempt,
    ];
    const leadRepo = {
      find: jest.fn(({ where }: { where: Partial<Lead> }) =>
        Promise.resolve(leads.filter(l => !where.businessId || l.businessId === where.businessId)),
      ),
      findOne: jest.fn(({ where }: { where: Partial<Lead> }) =>
        Promise.resolve(
          leads.find(l => l.id === where.id && (!where.businessId || l.businessId === where.businessId)) ?? null,
        ),
      ),
      save: jest.fn((l: Lead) => Promise.resolve(l)),
    };
    const attemptRepo = { find: jest.fn(() => Promise.resolve(attempts)) };
    service = new LeadService(leadRepo as never, {} as never, attemptRepo as never);
  });

  it('adds follow-up sent and replied times to each lead', async () => {
    const result = await service.listLeads('biz');

    expect(result).toHaveLength(2);
    expect(result.find(l => l.id === 'l1')).toMatchObject({
      followupSentAt: new Date('2026-10-18T04:35:00Z'),
      followupRepliedAt: new Date('2026-10-18T05:00:00Z'),
    });
    expect(result.find(l => l.id === 'l2')).toMatchObject({ followupSentAt: null, followupRepliedAt: null });
  });

  it('sets contactedAt when a lead is marked contacted', async () => {
    const updated = await service.updateLeadStatus('l1', LeadStatus.CONTACTED, 'biz');
    expect(updated.status).toBe(LeadStatus.CONTACTED);
    expect(updated.contactedAt).toBeInstanceOf(Date);
  });

  it("refuses to change another business's lead", async () => {
    await expect(service.updateLeadStatus('l3', LeadStatus.CLOSED, 'biz')).rejects.toBeInstanceOf(NotFoundException);
  });
});
