import { DataSource, Repository } from 'typeorm';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { ActionType, TriggerType, WorkflowDefinition, WorkflowStatus } from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import type { MessageStudioService } from '../message-studio/message-studio.service';

/** A Message Studio message as a workflow step: it sends, and buttons branch the run. */
describe('send_studio_message workflow step (SQLite)', () => {
  let ds: DataSource;
  let runRepo: Repository<WorkflowRun>;
  let workflowRepo: Repository<WorkflowDefinition>;
  let service: WorkflowService;
  let sendText: jest.Mock;
  let sendForWorkflow: jest.Mock;
  let executor: WorkflowExecutor;

  const ctx: TriggerContext = { businessId: 'biz', sessionId: 'sess', chatId: '919876543210@c.us', messageBody: 'hi' };

  const saveWorkflow = (stepConfig: Record<string, unknown>) =>
    workflowRepo.save({
      businessId: 'biz',
      name: 'Shop menu',
      slug: `shop-${Math.random()}`,
      status: WorkflowStatus.PUBLISHED,
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes: [
          { id: 'trg', type: 'trigger', data: {} },
          { id: 'menu', type: ActionType.SEND_STUDIO_MESSAGE, data: { config: stepConfig } },
          { id: 'track', type: ActionType.SEND_MESSAGE, data: { config: { message: 'Your order is on the way' } } },
          { id: 'human', type: ActionType.SEND_MESSAGE, data: { config: { message: 'Connecting you to our team' } } },
        ],
        edges: [
          { id: 'e0', source: 'trg', target: 'menu' },
          { id: 'e1', source: 'menu', sourceHandle: 'track_order', target: 'track' },
          { id: 'e2', source: 'menu', sourceHandle: 'talk_to_human', target: 'human' },
        ],
      },
    } as unknown as WorkflowDefinition);

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
    sendForWorkflow = jest.fn().mockResolvedValue({
      name: 'Shop menu',
      parts: [{ type: 'interactive', status: 'submitted', messageId: 'wamid.1' }],
      choices: [
        { id: 'track_order', text: 'Track order' },
        { id: 'talk_to_human', text: 'Talk to us' },
      ],
    });
    const studio = { sendForWorkflow } as unknown as MessageStudioService;
    executor = new WorkflowExecutor(
      service,
      undefined,
      { sendText } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      studio,
    );
  });

  afterEach(async () => {
    executor.onModuleDestroy();
    await ds.destroy();
  });

  it('sends the message, waits for the choice and follows the chosen button', async () => {
    const wf = await saveWorkflow({ studioMessageId: 'msg-1' });
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, ctx);

    expect(sendForWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz', messageId: 'msg-1', sessionId: 'sess', chatId: ctx.chatId }),
    );
    const fill = sendForWorkflow.mock.calls[0][0].fill as (t: string) => string;
    expect(typeof fill('Hi')).toBe('string');
    const paused = await runRepo.findOneByOrFail({ id: run.id });
    expect(paused.status).toBe(RunStatus.PAUSED);
    expect(paused.triggerData).toMatchObject({
      waitingForInput: true,
      expectedInputType: 'button_choice',
      currentNodeId: 'menu',
    });

    await expect(executor.resume(wf, paused, ctx, '2')).resolves.toBe('resumed');
    expect(sendText.mock.calls.map(c => c[1].text)).toEqual(['Connecting you to our team']);
    expect((await runRepo.findOneByOrFail({ id: run.id })).status).toBe(RunStatus.COMPLETED);
  });

  it('continues without waiting when the message has no reply options', async () => {
    sendForWorkflow.mockResolvedValueOnce({ name: 'Promo', parts: [], choices: [] });
    const wf = await saveWorkflow({ studioMessageId: 'msg-2' });
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, ctx);
    expect((await runRepo.findOneByOrFail({ id: run.id })).status).not.toBe(RunStatus.PAUSED);
  });

  it('fails the step visibly when the message cannot be sent', async () => {
    sendForWorkflow.mockRejectedValueOnce(new Error('"Shop menu" is not published in Message Studio'));
    const wf = await saveWorkflow({ studioMessageId: 'msg-3' });
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, ctx);
    const failed = await runRepo.findOneByOrFail({ id: run.id });
    expect(failed.status).toBe(RunStatus.FAILED);
    expect(failed.failureReason).toContain('not published in Message Studio');
  });

  it('a test run only simulates the send', async () => {
    const wf = await saveWorkflow({ studioMessageId: 'msg-4' });
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, { ...ctx, metadata: { isTest: true } });
    expect(sendForWorkflow).not.toHaveBeenCalled();
  });
});
