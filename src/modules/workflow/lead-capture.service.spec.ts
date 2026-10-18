import { LeadCaptureService } from './lead-capture.service';
import { LeadService } from './lead.service';
import { Lead, LeadStatus } from './entities/lead.entity';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';

describe('LeadCaptureService', () => {
  let leads: Lead[];
  let service: LeadCaptureService;

  const message = (overrides: Partial<IncomingMessage> = {}): IncomingMessage => ({
    id: 'm1',
    from: '919876543210@c.us',
    to: 'me@c.us',
    chatId: '919876543210@c.us',
    body: 'Hi',
    type: 'text',
    timestamp: Math.floor(Date.now() / 1000),
    fromMe: false,
    isGroup: false,
    kind: 'individual',
    contact: { pushName: 'Priya' },
    ...overrides,
  });

  beforeEach(() => {
    leads = [];
    const leadRepo = {
      findOne: jest.fn(({ where }: { where: Pick<Lead, 'businessId' | 'customerPhone'> }) =>
        Promise.resolve(
          leads.find(l => l.businessId === where.businessId && l.customerPhone === where.customerPhone) ?? null,
        ),
      ),
      create: jest.fn((dto: Partial<Lead>) => ({ id: `lead_${leads.length + 1}`, ...dto }) as Lead),
      save: jest.fn((lead: Lead) => {
        if (!leads.includes(lead)) leads.push(lead);
        return Promise.resolve(lead);
      }),
    };
    const leadService = new LeadService(leadRepo as never, {} as never);
    const sessionRepo = { findOne: jest.fn().mockResolvedValue({ id: 'sess', businessId: 'biz' }) };
    service = new LeadCaptureService({} as never, leadService, {} as never, sessionRepo as never);
  });

  it.each([
    ['own message', { fromMe: true }],
    ['group', { isGroup: true, kind: 'group' as const, chatId: '120363@g.us' }],
    ['channel', { kind: 'channel' as const, chatId: '120363@newsletter' }],
    ['status', { isStatusBroadcast: true, kind: 'status' as const }],
    ['history older than a day', { timestamp: Math.floor(Date.now() / 1000) - 2 * 24 * 3600 }],
  ])('ignores %s', (_label, overrides) => {
    expect(service.isLeadMessage(message(overrides))).toBe(false);
  });

  it('accepts a fresh personal message', () => {
    expect(service.isLeadMessage(message())).toBe(true);
  });

  it('creates one lead per phone number', async () => {
    await service.capture('sess', message());
    await service.capture('sess', message({ id: 'm2', body: 'Hello again' }));

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      businessId: 'biz',
      customerPhone: '919876543210',
      customerName: 'Priya',
      status: LeadStatus.NEW,
      chatId: '919876543210@c.us',
    });
    expect(leads[0].leadNumber).toMatch(/^LD-WA-/);
  });

  it('uses the resolved phone for privacy-id (@lid) senders', async () => {
    await service.capture(
      'sess',
      message({ chatId: '150951272956077@lid', isLidSender: true, senderPhone: '919000000001' }),
    );
    expect(leads[0].customerPhone).toBe('919000000001');
  });

  it('skips a @lid sender whose phone cannot be resolved', async () => {
    await service.capture('sess', message({ chatId: '150951272956077@lid', isLidSender: true, contact: {} }));
    expect(leads).toHaveLength(0);
  });
});
