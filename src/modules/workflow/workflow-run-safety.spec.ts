import { DataSource, Repository } from 'typeorm';
import { WorkflowExecutor, normalizeChoice, pickNextEdge, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import {
  ActionType,
  TriggerType,
  VisualWorkflowEdge,
  WorkflowDefinition,
  WorkflowStatus,
} from './entities/workflow-definition.entity';

const edge = (id: string, source: string, target: string, sourceHandle?: string): VisualWorkflowEdge => ({
  id,
  source,
  target,
  sourceHandle,
});

describe('normalizeChoice', () => {
  it.each([
    ['🛡️ Insurance', 'insurance'],
    ['1️⃣', '1'],
    ['  Mutual   Fund! ', 'mutual fund'],
    ['📈 મ્યુચ્યુઅલ ફંડ', 'મ્યુચ્યુઅલ ફંડ'],
    ['बीमा', 'बीमा'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeChoice(input)).toBe(expected);
  });
});

describe('pickNextEdge', () => {
  it('takes the exact handle first', () => {
    const edges = [edge('g', 'n', 'x'), edge('t', 'n', 'yes', 'true')];
    expect(pickNextEdge(edges, 'n', 'true')?.id).toBe('t');
  });

  it('lets any menu choice continue over a shared generic edge', () => {
    expect(pickNextEdge([edge('g', 'n', 'x')], 'n', 'btn_term')?.id).toBe('g');
    expect(pickNextEdge([edge('o', 'n', 'x', 'out')], 'n', 'btn_term')?.id).toBe('o');
  });

  it('never routes a failure outcome down the success path', () => {
    const edges = [edge('g', 'n', 'search'), edge('t', 'n', 'yes', 'true')];
    expect(pickNextEdge(edges, 'n', 'false')).toBeUndefined();
    expect(pickNextEdge(edges, 'n', 'fallback')).toBeUndefined();
    expect(pickNextEdge(edges, 'n', 'invalid_pincode')).toBeUndefined();
  });

  it('does not borrow another specific branch for an unknown handle', () => {
    expect(pickNextEdge([edge('t', 'n', 'yes', 'true')], 'n', 'btn_other')).toBeUndefined();
  });

  it('a plain success does not take the fallback edge', () => {
    expect(pickNextEdge([edge('f', 'n', 'retry', 'fallback')], 'n')).toBeUndefined();
    expect(pickNextEdge([edge('f', 'n', 'retry', 'fallback'), edge('o', 'n', 'next', 'out')], 'n')?.id).toBe('o');
  });
});

describe('WorkflowExecutor run safety', () => {
  const workflowService = {
    updateRunStatus: jest.fn().mockResolvedValue(undefined),
    updateRunTriggerData: jest.fn().mockResolvedValue(undefined),
    claimPausedRun: jest.fn().mockResolvedValue(true),
  };
  const messageService = { sendText: jest.fn().mockResolvedValue({ messageId: 'out-1' }) };
  const executor = new WorkflowExecutor(workflowService as never, undefined, messageService as never);
  const ctx: TriggerContext = { businessId: 'biz', sessionId: 'sess', chatId: '919876543210@c.us', messageBody: '' };

  const workflow = (nodes: unknown[], edges: VisualWorkflowEdge[], maxActionsPerRun = 100) =>
    ({
      id: 'wf',
      businessId: 'biz',
      status: WorkflowStatus.PUBLISHED,
      version: 1,
      maxActionsPerRun,
      maxExecutionSeconds: 300,
      maxRetries: 0,
      maxConcurrentRuns: 5,
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes,
        edges,
      },
    }) as unknown as WorkflowDefinition;
  const send = (id: string) => ({
    id,
    type: ActionType.SEND_MESSAGE,
    data: { config: { message: 'hi', dryRun: true } },
  });
  const calls = (mock: jest.Mock) => mock.mock.calls as unknown[][];
  const statusCalls = () => calls(workflowService.updateRunStatus).map(c => c[1] as RunStatus);
  const sentText = (i: number) => String((calls(messageService.sendText)[i][1] as { text: string }).text);

  beforeEach(() => jest.clearAllMocks());

  it('stops a node cycle at the action limit instead of messaging forever', async () => {
    const wf = workflow(
      [{ id: 'trg', type: 'trigger', data: {} }, send('a'), send('b')],
      [edge('1', 'trg', 'a'), edge('2', 'a', 'b'), edge('3', 'b', 'a')],
      5,
    );
    await executor.execute(wf, { id: 'run', steps: [] } as unknown as WorkflowRun, ctx);

    expect(statusCalls()).toContain(RunStatus.FAILED);
    const failed = calls(workflowService.updateRunStatus).find(c => c[1] === RunStatus.FAILED)?.[2] as
      { failureReason: string; steps: unknown[] } | undefined;
    expect(String(failed?.failureReason)).toMatch(/limit/);
    expect(failed?.steps.length).toBe(5);
  });

  it('sends a numbered menu that also accepts the option name without its emoji', async () => {
    const wf = workflow(
      [
        { id: 'trg', type: 'trigger', data: {} },
        {
          id: 'menu',
          type: ActionType.INTERACTIVE_BUTTONS,
          data: {
            config: {
              message: 'Choose a service',
              buttons: [
                { id: 'btn_ins', text: '🛡️ Insurance' },
                { id: 'btn_mf', text: '📈 Mutual Fund' },
                { id: 'btn_claim', text: '🧾 Claim Support' },
              ],
            },
          },
        },
      ],
      [edge('1', 'trg', 'menu')],
    );
    await executor.execute(wf, { id: 'run', steps: [], triggerData: {} } as unknown as WorkflowRun, ctx);

    const text = sentText(0);
    expect(text).toContain('Reply with number (1, 2, 3)');
    const saved = calls(workflowService.updateRunTriggerData)[0][1] as { choiceMap: Record<string, string> };
    expect(saved.choiceMap).toMatchObject({ '1': 'btn_ins', insurance: 'btn_ins', 'mutual fund': 'btn_mf' });
    expect(statusCalls()).toContain(RunStatus.PAUSED);
  });

  describe('resume', () => {
    const pausedAt = new Date('2026-10-19T10:00:00Z');
    const menuWorkflow = workflow(
      [{ id: 'menu', type: ActionType.INTERACTIVE_BUTTONS, data: {} }, send('after')],
      [edge('1', 'menu', 'after', 'btn_a')],
    );
    const pausedRun = (extra: Record<string, unknown> = {}) =>
      ({
        id: 'run',
        steps: [],
        status: RunStatus.PAUSED,
        triggerData: {
          messageId: 'm-start',
          waitingForInput: true,
          expectedInputType: 'button_choice',
          choiceMap: { '1': 'btn_a', start: 'btn_a' },
          currentNodeId: 'menu',
          pausedAt: pausedAt.toISOString(),
          ...extra,
        },
      }) as unknown as WorkflowRun;
    const at = (secondsAfterPause: number) => Math.floor(pausedAt.getTime() / 1000) + secondsAfterPause;

    it.each([
      ['the message that started the run', '1', { id: 'm-start', timestamp: at(5) }],
      ['a message sent before the question was asked', 'hello again', { id: 'm-burst', timestamp: at(-2) }],
      ['a sticker or captionless media', '', { id: 'm-sticker', timestamp: at(5) }],
    ])('ignores %s', async (_label, reply, message) => {
      await expect(executor.resume(menuWorkflow, pausedRun(), ctx, reply, message)).resolves.toBe('ignored');
      expect(workflowService.claimPausedRun).not.toHaveBeenCalled();
      expect(messageService.sendText).not.toHaveBeenCalled();
    });

    it('ignores a reply another message already claimed', async () => {
      workflowService.claimPausedRun.mockResolvedValueOnce(false);
      await expect(executor.resume(menuWorkflow, pausedRun(), ctx, '1', { id: 'm2', timestamp: at(5) })).resolves.toBe(
        'ignored',
      );
      expect(statusCalls()).toEqual([]);
    });

    it('follows the chosen branch', async () => {
      await expect(executor.resume(menuWorkflow, pausedRun(), ctx, '1', { id: 'm2', timestamp: at(5) })).resolves.toBe(
        'resumed',
      );
      expect(statusCalls()).toContain(RunStatus.COMPLETED);
    });

    it.each([
      ['stop', 'cancelled'],
      ['Cancel!', 'cancelled'],
      ['menu', 'restart'],
      ['Hi', 'restart'],
    ])('"%s" ends the wait (%s)', async (reply, outcome) => {
      await expect(
        executor.resume(menuWorkflow, pausedRun(), ctx, reply, { id: 'm2', timestamp: at(5) }),
      ).resolves.toBe(outcome);
      expect(statusCalls()).toEqual([RunStatus.CANCELLED]);
      expect(messageService.sendText).not.toHaveBeenCalled();
    });

    it('a menu option that looks like an escape word is still a choice', async () => {
      await expect(
        executor.resume(menuWorkflow, pausedRun(), ctx, 'start', { id: 'm2', timestamp: at(5) }),
      ).resolves.toBe('resumed');
    });

    it('keeps waiting after an invalid choice, and gives up after three', async () => {
      const run = pausedRun();
      await executor.resume(menuWorkflow, run, ctx, 'banana', { id: 'm2', timestamp: at(5) });
      expect(statusCalls()).toEqual([RunStatus.PAUSED]);
      expect(sentText(0)).toMatch(/Invalid choice[\s\S]*menu/);

      await executor.resume(menuWorkflow, run, ctx, 'banana', { id: 'm3', timestamp: at(6) });
      await executor.resume(menuWorkflow, run, ctx, 'banana', { id: 'm4', timestamp: at(7) });
      expect(statusCalls()).toEqual([RunStatus.PAUSED, RunStatus.PAUSED, RunStatus.CANCELLED]);
      expect(sentText(2)).toMatch(/start over/);
    });

    it('marks the run failed when the next step throws', async () => {
      messageService.sendText.mockRejectedValueOnce(new Error('session offline'));
      const wf = workflow(
        [
          { id: 'menu', type: ActionType.INTERACTIVE_BUTTONS, data: {} },
          { id: 'q', type: ActionType.ASK_QUESTION, data: { config: { question: 'Your pincode?' } } },
        ],
        [edge('1', 'menu', 'q', 'btn_a')],
      );
      await expect(executor.resume(wf, pausedRun(), ctx, '1', { id: 'm2', timestamp: at(5) })).resolves.toBe('resumed');
      expect(statusCalls()).toContain(RunStatus.FAILED);
    });
  });
});

describe('WorkflowService waiting and stuck runs (SQLite)', () => {
  let ds: DataSource;
  let runRepo: Repository<WorkflowRun>;
  let service: WorkflowService;
  const now = new Date('2026-10-19T10:00:00Z');

  const addRun = async (fields: Partial<WorkflowRun>, updatedAt?: Date) => {
    const run = await runRepo.save(
      runRepo.create({
        workflowId: 'wf',
        businessId: 'biz',
        sessionId: 'sess',
        chatId: '919876543210@c.us',
        workflowVersion: 1,
        status: RunStatus.PAUSED,
        steps: [],
        ...fields,
      }),
    );
    if (updatedAt) {
      await ds.query(`UPDATE "workflow_runs" SET "updatedAt" = ? WHERE "id" = ?`, [
        updatedAt.toISOString().replace('T', ' ').replace('Z', ''),
        run.id,
      ]);
    }
    return run;
  };
  const statusOf = async (id: string) => (await runRepo.findOneByOrFail({ id })).status;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [WorkflowRun], synchronize: true });
    await ds.initialize();
    runRepo = ds.getRepository(WorkflowRun);
    service = new WorkflowService({} as never, runRepo, {} as never);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('finds the waiting run for this chat and number, closing expired and older ones', async () => {
    const waiting = { waitingForInput: true, timeoutAt: new Date(now.getTime() + 3600_000).toISOString() };
    const older = await addRun({ triggerData: waiting }, new Date(now.getTime() - 120_000));
    const expired = await addRun(
      { triggerData: { waitingForInput: true, timeoutAt: new Date(now.getTime() - 1).toISOString() } },
      new Date(now.getTime() - 30_000),
    );
    const newest = await addRun({ triggerData: waiting }, new Date(now.getTime() - 60_000));
    await addRun({ triggerData: waiting, sessionId: 'other-number' });
    await addRun({ triggerData: waiting, chatId: '911111111111@c.us' });

    const found = await service.findActivePausedRun('biz', 'sess', '919876543210@c.us', now);

    expect(found?.id).toBe(newest.id);
    expect(await statusOf(expired.id)).toBe(RunStatus.TIMED_OUT);
    expect(await statusOf(older.id)).toBe(RunStatus.CANCELLED);
  });

  it('lets only one message claim a waiting run', async () => {
    const run = await addRun({ triggerData: { waitingForInput: true } });
    await expect(service.claimPausedRun(run.id)).resolves.toBe(true);
    await expect(service.claimPausedRun(run.id)).resolves.toBe(false);
    expect(await statusOf(run.id)).toBe(RunStatus.RUNNING);
  });

  it('fails runs stuck in RUNNING/PENDING and leaves active and waiting ones alone', async () => {
    const stuck = await addRun({ status: RunStatus.RUNNING }, new Date(now.getTime() - 60 * 60_000));
    const pending = await addRun({ status: RunStatus.PENDING }, new Date(now.getTime() - 60 * 60_000));
    const active = await addRun({ status: RunStatus.RUNNING }, new Date(now.getTime() - 60_000));
    const paused = await addRun({ status: RunStatus.PAUSED }, new Date(now.getTime() - 60 * 60_000));

    await expect(service.failStuckRuns(now)).resolves.toBe(2);
    expect(await statusOf(stuck.id)).toBe(RunStatus.FAILED);
    expect(await statusOf(pending.id)).toBe(RunStatus.FAILED);
    expect(await statusOf(active.id)).toBe(RunStatus.RUNNING);
    expect(await statusOf(paused.id)).toBe(RunStatus.PAUSED);
  });

  it('stuck runs do not use up the concurrency limit for new customers', async () => {
    await addRun({ status: RunStatus.RUNNING }, new Date(Date.now() - 60 * 60_000));
    const wf = { id: 'wf', businessId: 'biz', version: 1, maxConcurrentRuns: 1 } as WorkflowDefinition;

    const run = await service.createRun(wf, {}, 'sess', 'key-1', '919876543210@c.us');

    expect(run).not.toBeNull();
    expect(run?.chatId).toBe('919876543210@c.us');
  });
});
