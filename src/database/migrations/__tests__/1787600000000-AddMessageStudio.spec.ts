import { DataSource } from 'typeorm';
import { AddMessageStudio1787600000000 } from '../1787600000000-AddMessageStudio';

describe('AddMessageStudio migration', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:' });
    await ds.initialize();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const tables = async (): Promise<string[]> =>
    (
      await ds.query<{ name: string }[]>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%' ORDER BY name`,
      )
    ).map(r => r.name);

  it('creates the three tables with insertable shapes, is idempotent, and down() reverses it', async () => {
    const runner = ds.createQueryRunner();
    const migration = new AddMessageStudio1787600000000();

    await migration.up(runner);
    expect(await tables()).toEqual(['studio_messages', 'studio_products', 'studio_settings']);

    await ds.query(
      `INSERT INTO "studio_messages" ("id","businessId","name","kind","content") VALUES ('m1','b1','Welcome','text','{"text":"Hi"}')`,
    );
    await ds.query(`INSERT INTO "studio_products" ("id","businessId","name") VALUES ('p1','b1','Kurta')`);
    await ds.query(`INSERT INTO "studio_settings" ("id","businessId") VALUES ('s1','b1')`);
    const [msg] = await ds.query(`SELECT "status","readiness" FROM "studio_messages"`);
    expect(msg).toEqual({ status: 'draft', readiness: 'needs_attention' });
    const [product] = await ds.query(`SELECT "currency","inStock","archived","price" FROM "studio_products"`);
    expect(product).toEqual({ currency: 'INR', inStock: 1, archived: 0, price: 0 });
    // One settings row per business.
    await expect(ds.query(`INSERT INTO "studio_settings" ("id","businessId") VALUES ('s2','b1')`)).rejects.toThrow();

    await expect(migration.up(runner)).resolves.toBeUndefined();

    await migration.down(runner);
    expect(await tables()).toEqual([]);
  });
});
