import { DataSource, Repository } from 'typeorm';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { ActionType, TriggerType, WorkflowDefinition, WorkflowStatus } from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus, StepResult } from './entities/workflow-run.entity';

type Internals = { runAction(...args: unknown[]): Promise<Record<string, unknown>> };

describe('WAIT and retry survive a restart (SQLite)', () => {
  let ds: DataSource;
  let runRepo: Repository<WorkflowRun>;
  let workflowRepo: Repository<WorkflowDefinition>;
  let service: WorkflowService;
  let sendText: jest.Mock;
  const executors: WorkflowExecutor[] = [];

  // A fresh executor stands in for a restarted process: no timers, no in-memory state.
  const newProcess = () => {
    const executor = new WorkflowExecutor(service, undefined, { sendText } as never);
    executors.push(executor);
    return executor;
  };
  const ctx: TriggerContext = {
    businessId: 'biz',
    sessionId: 'sess',
    chatId: '919876543210@c.us',
    messageBody: 'hi',
  };

  const saveWorkflow = (nodes: { id: string; type: string; config?: Record<string, unknown> }[], maxRetries = 3) =>
    workflowRepo.save({
      businessId: 'biz',
      name: 'Nurture',
      slug: `nurture-${Math.random()}`,
      status: WorkflowStatus.PUBLISHED,
      maxRetries,
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes: [
          { id: 'trg', type: 'trigger', data: {} },
          ...nodes.map(n => ({ id: n.id, type: n.type, data: { config: n.config ?? {} } })),
        ],
        edges: ['trg', ...nodes.map(n => n.id)].slice(0, -1).map((source, i) => ({
          id: `e${i}`,
          source,
          target: nodes[i].id,
        })),
      },
    } as unknown as WorkflowDefinition);

  const startRun = async (workflow: WorkflowDefinition, runCtx: TriggerContext = ctx) => {
    const run = (await service.createRun(workflow, {}, 'sess', undefined, runCtx.chatId))!;
    await newProcess().execute(workflow, run, runCtx);
    return run.id;
  };
  const load = (id: string) => runRepo.findOneByOrFail({ id });
  const moveWakeToPast = async (id: string) => {
    const run = await load(id);
    const wake = run.triggerData!['wake'] as Record<string, unknown>;
    await runRepo.update(id, { triggerData: { ...run.triggerData, wake: { ...wake, at: new Date(0).toISOString() } } });
  };
  const settle = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const run = await load(id);
      if (![RunStatus.WAITING, RunStatus.RUNNING].includes(run.status)) return run;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return load(id);
  };
  const sentTexts = () => (sendText.mock.calls as [string, { text: string }][]).map(c => c[1].text);

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [WorkflowDefinition, WorkflowRun],
      synchronize: true,
    });
    await ds.initialize();
    runRepo = ds.getRepository(WorkflowRun);
    workflowRepo = ds.getRepository(WorkflowDefinition);
    service = new WorkflowService(workflowRepo, runRepo, {} as never);
    sendText = jest.fn().mockResolvedValue({ messageId: 'm' });
  });

  afterEach(async () => {
    for (const e of executors.splice(0)) e.onModuleDestroy();
    jest.restoreAllMocks();
    await ds.destroy();
  });

  it('a WAIT is saved to the database and continued by the next process', async () => {
    const wf = await saveWorkflow([
      { id: 'hello', type: ActionType.SEND_MESSAGE, config: { message: 'Hello' } },
      { id: 'pause', type: ActionType.WAIT, config: { seconds: 120 } },
      { id: 'later', type: ActionType.SEND_MESSAGE, config: { message: 'Still interested?' } },
    ]);
    const id = await startRun(wf);

    const sleeping = await load(id);
    expect(sleeping.status).toBe(RunStatus.WAITING);
    expect(sleeping.triggerData!['wake']).toMatchObject({ kind: 'wait', nodeId: 'pause', ctx: { chatId: ctx.chatId } });
    expect(sentTexts()).toEqual(['Hello']);

    // The old process dies; the new one finds the run on startup once its time has come.
    for (const e of executors.splice(0)) e.onModuleDestroy();
    await moveWakeToPast(id);
    await expect(newProcess().scheduleWaitingRuns()).resolves.toBe(1);

    const done = await settle(id);
    expect(done.status).toBe(RunStatus.COMPLETED);
    expect(sentTexts()).toEqual(['Hello', 'Still interested?']);
    expect((done.steps as StepResult[]).map(s => s.actionId)).toEqual(['hello', 'pause', 'later']);
    expect(done.triggerData!['wake']).toBeUndefined();
  });

  it('wakes a run only once when several timers fire together', async () => {
    const wf = await saveWorkflow([
      { id: 'pause', type: ActionType.WAIT, config: { seconds: 60 } },
      { id: 'later', type: ActionType.SEND_MESSAGE, config: { message: 'Once' } },
    ]);
    const id = await startRun(wf);
    await moveWakeToPast(id);

    const outcomes = await Promise.all([newProcess().wakeRun(id), newProcess().wakeRun(id), newProcess().wakeRun(id)]);

    expect(outcomes.filter(o => o === 'woken')).toHaveLength(1);
    expect(sentTexts()).toEqual(['Once']);
  });

  it('a retry backoff is saved too, and the next attempt runs after a restart', async () => {
    const original = Object.getOwnPropertyDescriptor(WorkflowExecutor.prototype, 'runAction')!
      .value as Internals['runAction'];
    jest
      .spyOn(WorkflowExecutor.prototype as unknown as Internals, 'runAction')
      .mockRejectedValueOnce(new Error('CRM timed out'))
      .mockImplementation(function (this: WorkflowExecutor, ...args: unknown[]) {
        return original.apply(this, args);
      });
    const wf = await saveWorkflow([
      { id: 'crm', type: ActionType.SET_FIELDS, config: { fields: { stage: 'new' } } },
      { id: 'thanks', type: ActionType.SEND_MESSAGE, config: { message: 'Thanks' } },
    ]);
    const id = await startRun(wf);

    const sleeping = await load(id);
    expect(sleeping.status).toBe(RunStatus.WAITING);
    expect(sleeping.triggerData!['wake']).toMatchObject({ kind: 'retry', nodeId: 'crm', attempt: 1 });
    expect(sentTexts()).toEqual([]);

    for (const e of executors.splice(0)) e.onModuleDestroy();
    await moveWakeToPast(id);
    await newProcess().scheduleWaitingRuns();

    const done = await settle(id);
    expect(done.status).toBe(RunStatus.COMPLETED);
    expect((done.steps as StepResult[]).map(s => [s.actionId, s.status, s.retryCount])).toEqual([
      ['crm', 'retrying', 0],
      ['crm', 'success', 1],
      ['thanks', 'success', 0],
    ]);
  });

  it('gives up after the last retry', async () => {
    jest
      .spyOn(WorkflowExecutor.prototype as unknown as Internals, 'runAction')
      .mockRejectedValue(new Error('CRM is down'));
    const wf = await saveWorkflow([{ id: 'crm', type: ActionType.SET_FIELDS, config: {} }], 1);
    const id = await startRun(wf);
    await moveWakeToPast(id);
    await newProcess().wakeRun(id);

    const done = await load(id);
    expect(done.status).toBe(RunStatus.FAILED);
    expect((done.steps as StepResult[]).map(s => s.status)).toEqual(['retrying', 'failed']);
  });

  it('does not continue a run whose workflow was disabled while it slept', async () => {
    const wf = await saveWorkflow([
      { id: 'pause', type: ActionType.WAIT, config: { seconds: 60 } },
      { id: 'later', type: ActionType.SEND_MESSAGE, config: { message: 'Offer' } },
    ]);
    const id = await startRun(wf);
    await workflowRepo.update(wf.id, { status: WorkflowStatus.DISABLED });
    await moveWakeToPast(id);
    await newProcess().wakeRun(id);

    expect(await load(id)).toMatchObject({
      status: RunStatus.CANCELLED,
      failureReason: 'Workflow is no longer published',
    });
    expect(sentTexts()).toEqual([]);
  });

  it('an operator can cancel a sleeping run, and it then stays cancelled', async () => {
    const wf = await saveWorkflow([
      { id: 'pause', type: ActionType.WAIT, config: { seconds: 60 } },
      { id: 'later', type: ActionType.SEND_MESSAGE, config: { message: 'Offer' } },
    ]);
    const id = await startRun(wf);
    await service.cancelRun(id, 'biz');
    await moveWakeToPast(id);

    await expect(newProcess().wakeRun(id)).resolves.toBe('skipped');
    expect((await load(id)).status).toBe(RunStatus.CANCELLED);
    expect(sentTexts()).toEqual([]);
  });

  it('test runs from the builder still finish in one request', async () => {
    const wf = await saveWorkflow([
      { id: 'pause', type: ActionType.WAIT, config: { seconds: 0 } },
      { id: 'later', type: ActionType.SEND_MESSAGE, config: { message: 'Done', dryRun: true } },
    ]);
    const id = await startRun(wf, { ...ctx, metadata: { isTest: true } });

    expect((await load(id)).status).toBe(RunStatus.COMPLETED);
  });
});
