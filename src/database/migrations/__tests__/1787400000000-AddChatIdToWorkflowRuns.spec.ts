import { DataSource } from 'typeorm';
import { AddWorkflowEngine1786300000001 } from '../1786300000001-AddWorkflowEngine';
import { AddChatIdToWorkflowRuns1787400000000 } from '../1787400000000-AddChatIdToWorkflowRuns';

describe('AddChatIdToWorkflowRuns migration', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:' });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    await new AddWorkflowEngine1786300000001().up(runner);
    await runner.release();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('backfills chatId for runs already waiting for an answer', async () => {
    const insert = (id: string, status: string, triggerData: string) =>
      ds.query(
        `INSERT INTO "workflow_runs" ("id","workflowId","businessId","workflowVersion","status","triggerData") VALUES (?,?,?,?,?,?)`,
        [id, 'wf', 'biz', 1, status, triggerData],
      );
    await insert('paused', 'paused', JSON.stringify({ chatId: '919876543210@c.us', waitingForInput: true }));
    await insert('done', 'completed', JSON.stringify({ chatId: '911111111111@c.us' }));
    await insert('broken', 'paused', 'not json');

    const runner = ds.createQueryRunner();
    await new AddChatIdToWorkflowRuns1787400000000().up(runner);
    await expect(new AddChatIdToWorkflowRuns1787400000000().up(runner)).resolves.toBeUndefined();
    await runner.release();

    const rows = await ds.query<{ id: string; chatId: string | null }[]>(
      `SELECT "id", "chatId" FROM "workflow_runs" ORDER BY "id"`,
    );
    expect(rows).toEqual([
      { id: 'broken', chatId: null },
      { id: 'done', chatId: null },
      { id: 'paused', chatId: '919876543210@c.us' },
    ]);
  });

  it('rolls back', async () => {
    const runner = ds.createQueryRunner();
    const migration = new AddChatIdToWorkflowRuns1787400000000();
    await migration.up(runner);
    await migration.down(runner);
    expect(await runner.hasColumn('workflow_runs', 'chatId')).toBe(false);
    await runner.release();
  });
});
