import { DataSource } from 'typeorm';
import { MessageCharge } from '../message-costs/entities/message-charge.entity';
import { WaBusinessService } from './wa-business.service';

describe('WaBusinessService.usage (real query)', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [MessageCharge], synchronize: true });
    await ds.initialize();
  });
  afterAll(() => ds.destroy());

  it('counts different people reached with templates in 24 h and delivered free replies this month', async () => {
    const repo = ds.getRepository(MessageCharge);
    const row = (waMessageId: string, chatId: string, category: string, status: string, hoursAgo = 1) =>
      repo.create({
        sessionId: 's1',
        waMessageId,
        chatId,
        category,
        status,
        createdAt: new Date(Date.now() - hoursAgo * 3_600_000),
      });
    await repo.save([
      row('a', '91111@c.us', 'marketing', 'delivered'),
      row('b', '91111@c.us', 'utility', 'read'), // same person twice
      row('c', '92222@c.us', 'utility', 'sent'),
      row('d', '93333@c.us', 'marketing', 'failed'), // refused: not counted
      row('e', '94444@c.us', 'marketing', 'delivered', 30), // older than 24 h
      row('f', '91111@c.us', 'service', 'delivered'),
      row('g', '92222@c.us', 'service', 'read'),
      row('h', '92222@c.us', 'service', 'failed'),
    ]);
    const svc = new WaBusinessService(
      ...([
        undefined,
        undefined,
        undefined,
        undefined,
        { get: () => undefined },
        undefined,
        undefined,
        undefined,
        repo,
      ] as unknown as ConstructorParameters<typeof WaBusinessService>),
    );
    const u = await svc.usage('s1');
    expect(u.peopleLast24h).toBe(2);
    expect(u.freeRepliesUsed).toBe(2);
    expect(u.dailyLimit).toBeNull();
  });
});
