import { DataSource } from 'typeorm';
import { AddCustomerCare1788500000000 } from './migrations/1788500000000-AddCustomerCare';
import { AssistantLink, CustomerCareSetting, MissedCall } from '../modules/customer-care/entities/customer-care.entity';

describe('AddCustomerCare migration', () => {
  it('creates tables the entities can read and write, and adds the ai_calls columns', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [CustomerCareSetting, MissedCall, AssistantLink],
      migrations: [],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await qr.query('CREATE TABLE "ai_calls" ("id" varchar PRIMARY KEY NOT NULL)');
    await new AddCustomerCare1788500000000().up(qr);
    await new AddCustomerCare1788500000000().up(qr); // idempotent
    expect(await qr.hasColumn('ai_calls', 'briefing')).toBe(true);

    await ds.getRepository(CustomerCareSetting).save({
      businessId: 'b',
      ownerName: 'Ramesh',
      missedCall: { enabled: true } as CustomerCareSetting['missedCall'],
      assistant: { enabled: false } as CustomerCareSetting['assistant'],
    });
    const due = new Date('2026-11-02T03:30:00Z');
    const m = await ds.getRepository(MissedCall).save({ businessId: 'b', phone: '+919876543210', callDueAt: due });
    await ds
      .getRepository(AssistantLink)
      .save({ token: 't', businessId: 'b', sessionId: 's', chatId: 'c', transcript: [] });

    const back = await ds.getRepository(MissedCall).findOneByOrFail({ id: m.id });
    expect(back.status).toBe('new');
    expect(back.callDueAt?.toISOString()).toBe(due.toISOString());
    expect((await ds.getRepository(CustomerCareSetting).findOneByOrFail({ businessId: 'b' })).missedCall.enabled).toBe(
      true,
    );

    await new AddCustomerCare1788500000000().down(qr);
    expect(await qr.hasTable('missed_calls')).toBe(false);
    expect(await qr.hasColumn('ai_calls', 'briefing')).toBe(false);
    await ds.destroy();
  });
});
