import { DataSource } from 'typeorm';
import { UpdateDefaultAiSystemPrompt1789700000000 } from './migrations/1789700000000-UpdateDefaultAiSystemPrompt';

const OLD = 'You are a helpful and polite WhatsApp customer support assistant. Answer concisely and accurately.';

describe('UpdateDefaultAiSystemPrompt migration', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], migrations: [] });
    await ds.initialize();
    await ds.query(`CREATE TABLE "ai_configs" ("id" TEXT PRIMARY KEY, "systemPrompt" TEXT)`);
    await ds.query(`INSERT INTO "ai_configs" VALUES ('a', ?)`, [OLD]);
    await ds.query(`INSERT INTO "ai_configs" VALUES ('b', 'Custom prompt for our dental clinic.')`);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('moves only the old default rows to the new prompt, and is re-runnable', async () => {
    const qr = ds.createQueryRunner();
    await new UpdateDefaultAiSystemPrompt1789700000000().up(qr);
    await new UpdateDefaultAiSystemPrompt1789700000000().up(qr);
    await qr.release();

    const rows = await ds.query(`SELECT "id", "systemPrompt" FROM "ai_configs" ORDER BY "id"`);
    expect(rows[0].systemPrompt).toContain('WhatsApp assistant for an insurance and investment business');
    expect(rows[1].systemPrompt).toBe('Custom prompt for our dental clinic.');
  });

  it('reverts rows that still hold the new prompt', async () => {
    const qr = ds.createQueryRunner();
    const m = new UpdateDefaultAiSystemPrompt1789700000000();
    await m.up(qr);
    await m.down(qr);
    await qr.release();

    const rows = await ds.query(`SELECT "id", "systemPrompt" FROM "ai_configs" ORDER BY "id"`);
    expect(rows[0].systemPrompt).toBe(OLD);
    expect(rows[1].systemPrompt).toBe('Custom prompt for our dental clinic.');
  });
});
