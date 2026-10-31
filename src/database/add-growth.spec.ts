import { DataSource } from 'typeorm';
import { AddGrowth1788400000000 } from './migrations/1788400000000-AddGrowth';
import { GrowthGreetingLog, GrowthLink, GrowthSettings } from '../modules/growth/entities/growth.entity';
import { Contact } from '../modules/conversation/entities/contact.entity';

describe('AddGrowth migration', () => {
  it('creates tables and contact columns the entities can read and write', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [GrowthSettings, GrowthLink, GrowthGreetingLog, Contact],
      migrations: [],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    // contacts predates this migration; create it without the new columns.
    await qr.query(
      `CREATE TABLE contacts (id varchar PRIMARY KEY, businessId varchar(36) NOT NULL, waContactId varchar(100) NOT NULL,
       phone varchar(20), name varchar(200), email varchar(200), notes varchar(500), tags text, metadata text,
       createdAt datetime DEFAULT CURRENT_TIMESTAMP, updatedAt datetime DEFAULT CURRENT_TIMESTAMP)`,
    );
    await new AddGrowth1788400000000().up(qr);
    await new AddGrowth1788400000000().up(qr); // idempotent

    const s = await ds.getRepository(GrowthSettings).save({ businessId: 'b', summaryEnabled: true });
    expect((await ds.getRepository(GrowthSettings).findOneByOrFail({ id: s.id })).summaryTime).toBe('20:00');
    await ds.getRepository(GrowthLink).save({ businessId: 'b', name: 'Shop', ref: 'ab12cd34', phone: '919876543210' });
    await ds.getRepository(Contact).save({ businessId: 'b', waContactId: '91987@c.us', birthday: '10-31' });
    expect(await ds.getRepository(Contact).count({ where: { birthday: '10-31' } })).toBe(1);

    const log = { businessId: 'b', chatId: 'c', kind: 'birthday' as const, periodKey: '2026' };
    await ds.getRepository(GrowthGreetingLog).save(log);
    await expect(ds.getRepository(GrowthGreetingLog).insert(log)).rejects.toThrow();

    await new AddGrowth1788400000000().down(qr);
    expect(await qr.hasTable('growth_settings')).toBe(false);
    expect(await qr.hasColumn('contacts', 'birthday')).toBe(false);
    await ds.destroy();
  });
});
