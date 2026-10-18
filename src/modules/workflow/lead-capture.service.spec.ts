import { LeadCaptureService } from './lead-capture.service';
import { LeadService } from './lead.service';
import { Lead, LeadClassifiedBy, LeadInterest, LeadStatus, LeadTemperature } from './entities/lead.entity';
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

  let resolveContactPhone: jest.Mock;

  beforeEach(() => {
    leads = [];
    type Where = Partial<Pick<Lead, 'businessId' | 'customerPhone' | 'chatId'>>;
    const matches = (l: Lead, w: Where) =>
      Object.entries(w).every(([k, v]) => (l as unknown as Record<string, unknown>)[k] === v);
    const leadRepo = {
      findOne: jest.fn(({ where }: { where: Where | Where[] }) =>
        Promise.resolve(leads.find(l => (Array.isArray(where) ? where : [where]).some(w => matches(l, w))) ?? null),
      ),
      create: jest.fn((dto: Partial<Lead>) => ({ id: `lead_${leads.length + 1}`, ...dto }) as Lead),
      save: jest.fn((lead: Lead) => {
        if (!leads.includes(lead)) leads.push(lead);
        return Promise.resolve(lead);
      }),
    };
    const leadService = new LeadService(leadRepo as never, {} as never);
    const sessionRepo = { findOne: jest.fn().mockResolvedValue({ id: 'sess', businessId: 'biz' }) };
    resolveContactPhone = jest.fn().mockResolvedValue(null);
    const engineRegistry = { get: () => ({ resolveContactPhone }) };
    service = new LeadCaptureService(
      {} as never,
      leadService,
      {} as never,
      sessionRepo as never,
      engineRegistry as never,
    );
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

  it('asks the engine for the phone of a @lid sender', async () => {
    resolveContactPhone.mockResolvedValue('919000000002');
    await service.capture('sess', message({ chatId: '150951272956077@lid', isLidSender: true }));

    expect(resolveContactPhone).toHaveBeenCalledWith('150951272956077@lid');
    expect(leads[0].customerPhone).toBe('919000000002');
  });

  it('still saves a @lid lead when the number stays hidden, once per chat', async () => {
    const lid = message({ chatId: '150951272956077@lid', isLidSender: true });
    await service.capture('sess', lid);
    await service.capture('sess', { ...lid, id: 'm2' });

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ chatId: '150951272956077@lid', customerPhone: '', customerName: 'Priya' });
  });

  it('fills in the number later if it becomes resolvable', async () => {
    const lid = message({ chatId: '150951272956077@lid', isLidSender: true });
    await service.capture('sess', lid);
    resolveContactPhone.mockResolvedValue('919000000003');
    await service.capture('sess', { ...lid, id: 'm2' });

    expect(leads).toHaveLength(1);
    expect(leads[0].customerPhone).toBe('919000000003');
  });

  it('classifies a new lead from its first message, and only once', async () => {
    const classify = jest.fn().mockResolvedValue({
      temperature: LeadTemperature.HOT,
      interest: LeadInterest.INSURANCE,
      classifiedBy: LeadClassifiedBy.AI,
      reason: 'Wants a policy',
    });
    const applyAutoClassification = jest
      .spyOn(LeadService.prototype, 'applyAutoClassification')
      .mockResolvedValue(undefined);
    const classifying = new LeadCaptureService(
      {} as never,
      (service as unknown as { leadService: LeadService }).leadService,
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'sess', businessId: 'biz' }) } as never,
      { get: () => ({ resolveContactPhone }) } as never,
      { classify } as never,
    );

    await classifying.capture('sess', message({ body: 'mare health policy levi che' }));
    await classifying.capture('sess', message({ id: 'm2', body: 'hello again' }));

    expect(leads[0].firstMessage).toBe('mare health policy levi che');
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledWith('mare health policy levi che');
    expect(applyAutoClassification).toHaveBeenCalledWith(leads[0].id, expect.objectContaining({ temperature: 'hot' }));
    applyAutoClassification.mockRestore();
  });

  it('ignores a non-@lid chat with no usable number', async () => {
    await service.capture('sess', message({ chatId: '0@c.us' }));
    expect(leads).toHaveLength(0);
  });
});
