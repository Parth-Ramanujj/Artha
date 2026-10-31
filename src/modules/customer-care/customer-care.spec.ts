/* eslint-disable @typescript-eslint/require-await -- repository fakes mirror the async TypeORM API */
import { CustomerCareService, fillCare } from './customer-care.service';
import type { MissedCall } from './entities/customer-care.entity';

function repo<T extends { id?: string }>(rows: T[] = []) {
  return {
    rows,
    create: (x: Partial<T>) => ({ ...x }) as T,
    save: jest.fn(async (x: T) => {
      const saved = { id: `id${rows.length + 1}`, createdAt: new Date(), ...x };
      rows.push(saved);
      return saved;
    }),
    findOne: jest.fn(async () => null as T | null),
    find: jest.fn(async () => [] as T[]),
    update: jest.fn(async () => ({ affected: 1 })),
    exists: jest.fn(async () => false),
  };
}

function setup(opts: { enabled?: boolean; dnd?: boolean; replied?: boolean } = {}) {
  const settings = repo([
    {
      id: 's',
      businessId: 'b',
      ownerName: 'Ramesh',
      missedCall: { enabled: opts.enabled ?? true, waitMinutes: 10, callOnNoReply: true },
      assistant: {},
    },
  ]);
  settings.findOne.mockImplementation(async () => settings.rows[0]);
  const missed = repo<MissedCall>();
  const sessions = repo([{ id: 'sess' }]);
  sessions.find.mockResolvedValue([{ id: 'sess' }]);
  const messageRepo = repo();
  messageRepo.exists.mockResolvedValue(!!opts.replied);
  const messages = { sendText: jest.fn(async () => ({})) };
  const calling = {
    isDoNotCall: jest.fn(async () => !!opts.dnd),
    queueCall: jest.fn(async () => ({ id: 'call1' })),
  };
  const engines = { get: () => ({}) };
  const hooks = { register: jest.fn(), unregister: jest.fn() };
  const service = new CustomerCareService(
    settings as never,
    missed as never,
    sessions as never,
    messageRepo as never,
    hooks as never,
    engines as never,
    messages as never,
    calling as never,
  );
  return { service, missed, messages, calling };
}

describe('fillCare', () => {
  it('fills name and owner, and drops an unknown name cleanly', () => {
    expect(fillCare('Hi {name}, {owner} here.', { name: 'Asha', owner: 'Ramesh' })).toBe('Hi Asha, Ramesh here.');
    expect(fillCare('Hi {name}, {owner} here.', { owner: 'Ramesh' })).toBe('Hi, Ramesh here.');
  });
});

describe('CustomerCareService missed calls', () => {
  it('sends the WhatsApp message and schedules the AI call', async () => {
    const { service, messages } = setup();
    const row = await service.report('b', { phone: '98765 43210', name: 'Asha' });
    expect(row.status).toBe('messaged');
    expect(messages.sendText).toHaveBeenCalledWith('sess', expect.objectContaining({ chatId: '919876543210@c.us' }));
    expect(row.callDueAt!.getTime() - row.messagedAt!.getTime()).toBe(10 * 60_000);
  });

  it('skips when turned off or the contact opted out', async () => {
    expect((await setup({ enabled: false }).service.report('b', { phone: '9876543210' })).status).toBe('skipped');
    expect((await setup({ dnd: true }).service.report('b', { phone: '9876543210' })).status).toBe('skipped');
  });

  it('queues an AI call with the "no WhatsApp reply" greeting when nobody replied', async () => {
    const { service, missed, calling } = setup();
    const due = {
      id: 'm1',
      businessId: 'b',
      phone: '+919876543210',
      name: 'Asha',
      sessionId: 'sess',
      messagedAt: new Date(),
      createdAt: new Date(),
      status: 'messaged',
    };
    missed.find.mockResolvedValueOnce([due as MissedCall]);
    await service.tick();
    const input = (calling.queueCall.mock.calls[0] as unknown[])[1] as { greeting: string; briefing: string };
    expect(input.greeting).toContain('Ramesh');
    expect(input.greeting).toContain('WhatsApp');
    expect(input.briefing).toContain('did not reply');
    expect(missed.update).toHaveBeenCalledWith('m1', { status: 'called', aiCallId: 'call1' });
  });

  it('does not call when they replied on WhatsApp', async () => {
    const { service, missed, calling } = setup({ replied: true });
    missed.find.mockResolvedValueOnce([
      { id: 'm1', businessId: 'b', phone: '+919876543210', sessionId: 'sess', createdAt: new Date() } as MissedCall,
    ]);
    await service.tick();
    expect(calling.queueCall).not.toHaveBeenCalled();
    expect(missed.update).toHaveBeenCalledWith('m1', expect.objectContaining({ status: 'replied' }));
  });
});
