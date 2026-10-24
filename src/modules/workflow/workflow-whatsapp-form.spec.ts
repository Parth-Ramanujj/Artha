import { DataSource, Repository } from 'typeorm';
import { WorkflowExecutor, TriggerContext, formAnswerVariables } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { ActionType, TriggerType, WorkflowDefinition, WorkflowStatus } from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import type { WhatsAppFormService } from '../whatsapp-form/whatsapp-form.service';

/** A WhatsApp Form as a workflow step: it sends, waits for the submission, and exposes the answers. */
describe('send_whatsapp_form workflow step (SQLite)', () => {
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
      name: 'Lead form',
      slug: `lead-${Math.random()}`,
      status: WorkflowStatus.PUBLISHED,
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes: [
          { id: 'trg', type: 'trigger', data: {} },
          { id: 'form', type: ActionType.SEND_WHATSAPP_FORM, data: { config: stepConfig } },
          { id: 'thanks', type: ActionType.SEND_MESSAGE, data: { config: { message: 'Thanks {{full_name}}' } } },
        ],
        edges: [
          { id: 'e0', source: 'trg', target: 'form' },
          { id: 'e1', source: 'form', target: 'thanks' },
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
    sendForWorkflow = jest.fn().mockResolvedValue({ messageId: 'wamid.1', flowToken: 'tok-1', formName: 'Lead form' });
    const forms = { sendForWorkflow } as unknown as WhatsAppFormService;
    executor = new WorkflowExecutor(
      service,
      undefined,
      { sendText } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      forms,
    );
  });

  afterEach(async () => {
    executor.onModuleDestroy();
    await ds.destroy();
  });

  it('sends the form, waits for its submission and fills variables from the answers', async () => {
    const wf = await saveWorkflow({ formId: 'form-1', bodyText: 'Hi, please fill this in' });
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, ctx);

    expect(sendForWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz', formId: 'form-1', sessionId: 'sess', chatId: ctx.chatId }),
    );
    const paused = await runRepo.findOneByOrFail({ id: run.id });
    expect(paused.status).toBe(RunStatus.PAUSED);
    expect(paused.triggerData).toMatchObject({
      waitingForInput: true,
      expectedInputType: 'whatsapp_form',
      flowToken: 'tok-1',
      currentNodeId: 'form',
    });

    // A typed message or another form's submission does not answer this wait.
    await expect(executor.resume(wf, paused, ctx, 'hello?', { id: 'm1' })).resolves.toBe('ignored');
    await expect(
      executor.resume(wf, paused, ctx, 'x: y', { id: 'm2', flowReply: { flowToken: 'other', answers: {} } }),
    ).resolves.toBe('ignored');
    expect((await runRepo.findOneByOrFail({ id: run.id })).status).toBe(RunStatus.PAUSED);

    await expect(
      executor.resume(wf, paused, ctx, 'full_name: Asha', {
        id: 'm3',
        flowReply: { flowToken: 'tok-1', answers: { full_name: 'Asha', interests: ['loans', 'cards'] } },
      }),
    ).resolves.toBe('resumed');

    const texts = (sendText.mock.calls as Array<[string, { text: string }]>).map(c => c[1].text);
    expect(texts).toEqual(['Thanks Asha']);
    const done = await runRepo.findOneByOrFail({ id: run.id });
    expect(done.status).toBe(RunStatus.COMPLETED);
    expect(done.triggerData?.['capturedVariables']).toMatchObject({ full_name: 'Asha', interests: 'loans, cards' });
  });

  it('still lets the customer stop a run that waits for a form', async () => {
    const wf = await saveWorkflow({ formId: 'form-1' });
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, ctx);
    const paused = await runRepo.findOneByOrFail({ id: run.id });

    await expect(executor.resume(wf, paused, ctx, 'stop', { id: 'm1' })).resolves.toBe('cancelled');
  });

  it('continues straight away when the step does not wait for the submission', async () => {
    const wf = await saveWorkflow({ formId: 'form-1', waitForSubmit: false });
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, ctx);
    expect((await runRepo.findOneByOrFail({ id: run.id })).status).not.toBe(RunStatus.PAUSED);
  });

  it('fails the step visibly when no form is chosen', async () => {
    const wf = await saveWorkflow({});
    const run = (await service.createRun(wf, {}, 'sess', undefined, ctx.chatId))!;
    await executor.execute(wf, run, ctx);
    expect((await runRepo.findOneByOrFail({ id: run.id })).status).toBe(RunStatus.FAILED);
    expect(sendForWorkflow).not.toHaveBeenCalled();
  });
});

describe('formAnswerVariables', () => {
  it('turns answers into text variables', () => {
    expect(formAnswerVariables({ name: 'Asha', picks: ['a', 'b'], agree: true })).toEqual({
      name: 'Asha',
      picks: 'a, b',
      agree: 'true',
    });
  });
});
