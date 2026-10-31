import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { ActionType, TriggerType, WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import { IntegrationType } from '../integrations/entities/integration.entity';

// Chat keyword -> read the whole sheet -> silent AI summary -> WhatsApp + email -> reminder later
describe('sheet summary workflow', () => {
  const workflowService = {
    updateRunStatus: jest.fn<Promise<void>, [string, RunStatus]>().mockResolvedValue(undefined),
    updateRunTriggerData: jest.fn().mockResolvedValue(undefined),
  };
  const messageService = { sendText: jest.fn().mockResolvedValue({}) };
  const aiService = {
    complete: jest
      .fn<Promise<unknown>, [Array<{ content: string }>]>()
      .mockResolvedValue({ content: '• 2 orders, ₹8,000 total' }),
    chat: jest.fn(),
  };
  const scheduledMessageRepo = { create: jest.fn((x: unknown) => x), save: jest.fn().mockResolvedValue({ id: 's1' }) };
  const integrations: Record<string, { id: string; type: IntegrationType }> = {
    sheet: { id: 'sheet', type: IntegrationType.GOOGLE_SHEETS },
    smtp: { id: 'smtp', type: IntegrationType.EMAIL_SMTP },
  };
  const integrationsService = {
    findOne: jest.fn((id: string) => Promise.resolve(integrations[id])),
    sendEmail: jest.fn().mockResolvedValue({}),
  };
  const googleService = {
    readAllRows: jest.fn().mockResolvedValue({
      rowCount: 2,
      rowsText: 'Name: Asha\nAmount: 5000\n\nName: Ravi\nAmount: 3000',
      headers: ['Name', 'Amount'],
    }),
    gmailSend: jest.fn(),
  };
  const executor = new WorkflowExecutor(
    workflowService as never,
    undefined,
    messageService as never,
    aiService as never,
    undefined,
    undefined,
    undefined,
    scheduledMessageRepo as never,
    undefined,
    integrationsService as never,
    googleService as never,
  );

  const node = (id: string, type: ActionType, config: Record<string, unknown>) => ({ id, type, data: { config } });
  const workflow = {
    id: 'wf',
    businessId: 'biz',
    maxActionsPerRun: 100,
    maxExecutionSeconds: 300,
    maxRetries: 0,
    definition: {
      trigger: { type: TriggerType.KEYWORD_MATCH, config: { keyword: 'report' } },
      conditions: [],
      actions: [],
      nodes: [
        { id: 'trg', type: 'trigger', data: {} },
        node('sheet', ActionType.SHEETS_LOOKUP, {
          integrationId: 'sheet',
          spreadsheetId: 'abc1234567890',
          mode: 'all',
        }),
        node('ai', ActionType.AI_ASSISTANT, { prompt: 'Summarize:\n{{steps.sheet.rowsText}}', sendReply: false }),
        node('send', ActionType.SEND_MESSAGE, { message: '{{steps.ai.reply}}' }),
        node('mail', ActionType.INTERNAL_ALERT, {
          emailTo: 'owner@example.com',
          emailIntegrationId: 'smtp',
          emailSubject: 'Daily report',
          templateMessage: '{{steps.ai.reply}}',
        }),
        node('remind', ActionType.SCHEDULE_FOLLOWUP, { delayMinutes: 1440, message: 'Follow up', chatId: '' }),
      ],
      edges: [
        { id: 'e1', source: 'trg', target: 'sheet' },
        { id: 'e2', source: 'sheet', target: 'ai' },
        { id: 'e3', source: 'ai', target: 'send' },
        { id: 'e4', source: 'send', target: 'mail' },
        { id: 'e5', source: 'mail', target: 'remind' },
      ],
    },
  } as unknown as WorkflowDefinition;
  const ctx: TriggerContext = {
    businessId: 'biz',
    sessionId: 'sess',
    chatId: '919876543210@c.us',
    messageBody: 'report',
  };

  it('summarizes the sheet, replies on WhatsApp, emails it and schedules a reminder', async () => {
    await executor.execute(workflow, { id: 'run', steps: [], triggerData: {} } as unknown as WorkflowRun, ctx);

    expect(workflowService.updateRunStatus.mock.calls.at(-1)?.[1]).toBe(RunStatus.COMPLETED);
    expect(aiService.complete.mock.calls[0][0][1].content).toContain('Name: Ravi');
    expect(aiService.chat).not.toHaveBeenCalled();
    // only the summary goes to the chat: no raw sheet dump, no auto AI reply
    expect(messageService.sendText).toHaveBeenCalledTimes(1);
    expect(messageService.sendText).toHaveBeenCalledWith('sess', {
      chatId: '919876543210@c.us',
      text: '• 2 orders, ₹8,000 total',
    });
    expect(integrationsService.sendEmail).toHaveBeenCalledWith('smtp', 'biz', {
      to: 'owner@example.com',
      subject: 'Daily report',
      text: '• 2 orders, ₹8,000 total',
    });
    expect(scheduledMessageRepo.save).toHaveBeenCalledTimes(1);
    expect(scheduledMessageRepo.create).toHaveBeenCalledWith(expect.objectContaining({ chatId: '919876543210@c.us' }));
  });
});
