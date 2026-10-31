import { DataSource } from 'typeorm';
import { AddLibrary1788300000000 } from './migrations/1788300000000-AddLibrary';
import { LibraryAutomation, LibraryItem, LibraryRun } from '../modules/library/entities/library.entity';

describe('AddLibrary migration', () => {
  it('creates tables the entities can read and write', async () => {
    const ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [LibraryItem, LibraryAutomation, LibraryRun],
      migrations: [],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddLibrary1788300000000().up(qr);
    await new AddLibrary1788300000000().up(qr); // idempotent

    const item = await ds.getRepository(LibraryItem).save({ businessId: 'b', title: 'Hi', tags: ['x'], text: 'hello' });
    const a = await ds.getRepository(LibraryAutomation).save({
      businessId: 'b',
      name: 'Daily',
      sessionId: 's',
      itemIds: [item.id],
      chatIds: [],
      schedule: { kind: 'daily', time: '09:00', timezone: 'Asia/Kolkata' },
      nextRunAt: new Date('2026-11-02T03:30:00Z'),
    });
    await ds.getRepository(LibraryRun).save({ businessId: 'b', automationId: a.id, sessionId: 's', sent: 2 });

    const back = await ds.getRepository(LibraryAutomation).findOneByOrFail({ id: a.id });
    expect(back.schedule.time).toBe('09:00');
    expect(back.enabled).toBe(true);
    expect(back.nextRunAt?.toISOString()).toBe('2026-11-02T03:30:00.000Z');
    expect((await ds.getRepository(LibraryItem).findOneByOrFail({ id: item.id })).tags).toEqual(['x']);

    await new AddLibrary1788300000000().down(qr);
    expect(await qr.hasTable('library_items')).toBe(false);
    await ds.destroy();
  });
});
