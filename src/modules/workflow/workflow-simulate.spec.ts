import { DataSource, Repository } from 'typeorm';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { ActionType, TriggerType, WorkflowDefinition, WorkflowStatus } from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';

/**
 * The live simulator runs a flow in "simulate" mode: it pauses at menus and questions exactly like a
 * real chat, but never sends a real message. This guards that behaviour and that production (no
 * simulate flag) still runs straight through in a dry-run test.
 */
describe('conversational simulation (SQLite)', () => {
  let ds: DataSource;
  let runRepo: Repository<WorkflowRun>;
  let workflowRepo: Repository<WorkflowDefinition>;
  let service: WorkflowService;
  let sendText: jest.Mock;
  let executor: WorkflowExecutor;

  // Welcome → Main menu (2 buttons) → [Insurance] → Ask pincode → Done.
  const saveFlow = () =>
    workflowRepo.save({
      businessId: 'biz',
      name: 'Menu bot',
      slug: `menu-${Math.random()}`,
      status: WorkflowStatus.PUBLISHED,
      maxConcurrentRuns: 50,
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes: [
          { id: 'trg', type: 'trigger', data: {} },
          { id: 'welcome', type: ActionType.SEND_MESSAGE, data: { config: { message: 'Welcome!' } } },
          {
            id: 'menu',
            type: ActionType.INTERACTIVE_BUTTONS,
            data: {
              config: {
                message: 'Pick one',
                buttons: [
                  { id: 'insurance', text: 'Insurance' },
                  { id: 'funds', text: 'Mutual Fund' },
                ],
              },
            },
          },
          {
            id: 'ask',
            type: ActionType.ASK_QUESTION,
            data: { config: { question: 'Your pincode?', slot: 'pincode' } },
          },
          { id: 'done', type: ActionType.SEND_MESSAGE, data: { config: { message: 'Thanks, an advisor will call.' } } },
        ],
        edges: [
          { id: 'e0', source: 'trg', target: 'welcome' },
          { id: 'e1', source: 'welcome', target: 'menu' },
          { id: 'e2', source: 'menu', sourceHandle: 'insurance', target: 'ask' },
          { id: 'e3', source: 'menu', sourceHandle: 'funds', target: 'done' },
          { id: 'e4', source: 'ask', target: 'done' },
        ],
      },
    } as unknown as WorkflowDefinition);

  const simCtx = (over: Partial<TriggerContext> = {}): TriggerContext => ({
    businessId: 'biz',
    sessionId: 'sess',
    chatId: '919876543210@c.us',
    messageBody: 'hi',
    messageType: 'text',
    metadata: { isTest: true, simulate: true },
    ...over,
  });

  const stepTypes = (run: WorkflowRun) => (run.steps as Array<{ actionType: string }>).map(s => s.actionType);

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
    executor = new WorkflowExecutor(service, undefined, { sendText } as never);
  });

  afterEach(async () => {
    executor.onModuleDestroy();
    await ds.destroy();
  });

  it('pauses at the first menu and sends nothing', async () => {
    const wf = await saveFlow();
    const run = (await service.createRun(
      wf,
      { isTest: true, simulate: true },
      'sess',
      undefined,
      '919876543210@c.us',
    ))!;
    await executor.execute(wf, run, simCtx());

    const after = await runRepo.findOneByOrFail({ id: run.id });
    expect(after.status).toBe(RunStatus.PAUSED);
    expect(stepTypes(after)).toEqual(['send_message', 'interactive_buttons']);
    expect(after.triggerData).toMatchObject({ waitingForInput: true, expectedInputType: 'button_choice' });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('continues on a button tap to the next question, then to the end', async () => {
    const wf = await saveFlow();
    const run = (await service.createRun(
      wf,
      { isTest: true, simulate: true },
      'sess',
      undefined,
      '919876543210@c.us',
    ))!;
    await executor.execute(wf, run, simCtx());

    const paused = await runRepo.findOneByOrFail({ id: run.id });
    expect(await executor.resume(wf, paused, simCtx({ messageBody: 'Insurance' }), 'Insurance')).toBe('resumed');

    const atQuestion = await runRepo.findOneByOrFail({ id: run.id });
    expect(atQuestion.status).toBe(RunStatus.PAUSED);
    expect(atQuestion.triggerData).toMatchObject({
      waitingForInput: true,
      expectedInputType: 'question_slot',
      slot: 'pincode',
    });
    expect(stepTypes(atQuestion)).toEqual(['send_message', 'interactive_buttons', 'ask_question']);

    const answered = await runRepo.findOneByOrFail({ id: run.id });
    expect(await executor.resume(wf, answered, simCtx({ messageBody: '380015' }), '380015')).toBe('resumed');

    const done = await runRepo.findOneByOrFail({ id: run.id });
    expect(done.status).toBe(RunStatus.COMPLETED);
    expect(stepTypes(done)).toEqual(['send_message', 'interactive_buttons', 'ask_question', 'send_message']);
    // Still nothing really sent — the whole conversation was a dry run.
    expect(sendText).not.toHaveBeenCalled();
  });

  it('a plain dry-run test (no simulate) runs straight through without pausing', async () => {
    const wf = await saveFlow();
    const run = (await service.createRun(wf, { isTest: true }, 'sess', undefined, '919876543210@c.us'))!;
    await executor.execute(wf, run, simCtx({ metadata: { isTest: true } }));

    const after = await runRepo.findOneByOrFail({ id: run.id });
    expect(after.status).not.toBe(RunStatus.PAUSED);
    // Welcome, menu, then it auto-followed the first branch to the question and the end.
    expect(stepTypes(after)).toContain('ask_question');
    expect(sendText).not.toHaveBeenCalled();
  });
});
