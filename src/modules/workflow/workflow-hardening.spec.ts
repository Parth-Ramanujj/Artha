import {
  WorkflowExecutor,
  TriggerContext,
  menuChoiceValue,
  redactUrlSecrets,
  validateAnswer,
} from './workflow-executor.service';
import { containsKeyword, parseKeywords } from './keyword-match';
import { WorkflowService } from './workflow.service';
import { LeadService } from './lead.service';
import { ActionType, TriggerType, WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import { Lead, LeadStatus } from './entities/lead.entity';

describe('keyword matching', () => {
  it.each([
    ['Hi there', 'hi', true],
    ['this is it', 'hi', false],
    ['which plan?', 'hi', false],
    ['I want a Mutual  Fund plan', 'mutual fund', true],
    ['mutualfund', 'mutual fund', false],
    ['મને વીમો જોઈએ', 'વીમો', true],
    ['claim!', 'claim', true],
  ])('%j contains %j → %s', (text, keyword, expected) => {
    expect(containsKeyword(text, keyword)).toBe(expected);
  });

  it('a keyword trigger without keywords never fires', () => {
    const executor = new WorkflowExecutor({} as never);
    const ctx = { businessId: 'b', messageBody: 'anything' };
    expect(executor.evaluateTrigger({ type: TriggerType.KEYWORD_MATCH, config: { keyword: ' , ' } }, ctx)).toBe(false);
    expect(parseKeywords(' Hi, , HELLO ')).toEqual(['hi', 'hello']);
  });

  it('a keyword workflow cannot be published without a keyword', async () => {
    const draft = {
      id: 'wf',
      businessId: 'biz',
      status: 'draft',
      version: 1,
      definition: {
        trigger: { type: TriggerType.KEYWORD_MATCH, config: { keyword: '' } },
        conditions: [],
        actions: [],
      },
    };
    const service = new WorkflowService(
      { findOne: jest.fn().mockResolvedValue(draft), save: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    await expect(service.publish('wf', 'biz')).rejects.toThrow(/at least one keyword/);
  });
});

describe('answer validation', () => {
  it.each([
    ['phone', '+91 98765 43210', '919876543210'],
    ['phone', '098765-43210', '919876543210'],
    ['phone', '9876543210', '919876543210'],
    ['phone', '12345', null],
    ['phone', '5876543210', null],
    ['phone', '+1 415 555 0100', '14155550100'],
    ['number', '', null],
    ['number', '12.5', '12.5'],
    ['pincode', '380 015', '380015'],
    ['pincode', '012345', null],
    ['email', ' a@b.co ', 'a@b.co'],
    ['any', '  hello ', 'hello'],
  ])('%s %j → %j', (validation, reply, expected) => {
    expect(validateAnswer(validation, reply)).toBe(expected);
  });
});

describe('small helpers', () => {
  it('masks credentials and query values in stored URLs', () => {
    expect(redactUrlSecrets('https://user:pw@api.example.com/v1/x?key=SECRET&id=7')).toBe(
      'https://***@api.example.com/v1/x?key=***&id=***',
    );
    expect(redactUrlSecrets('not a url?token=abc')).toBe('not a url?***');
  });

  it('turns menu button ids into lead values', () => {
    expect(menuChoiceValue('btn_mutual_fund')).toBe('mutual_fund');
    expect(menuChoiceValue('btn_cat_health')).toBe('health');
    expect(menuChoiceValue('btn_claim_rejected')).toBe('rejected');
    expect(menuChoiceValue('insurance')).toBe('insurance');
  });
});

describe('WorkflowExecutor hardening', () => {
  const workflowService = {
    updateRunStatus: jest.fn().mockResolvedValue(undefined),
    updateRunTriggerData: jest.fn().mockResolvedValue(undefined),
  };
  const messageService = { sendText: jest.fn() };
  const conversationService = {
    findOneConversation: jest.fn().mockResolvedValue({ id: 'conv-1', tags: [] }),
    updateConversation: jest.fn().mockResolvedValue({}),
  };
  const leadService = { createOrUpdateLead: jest.fn((dto: Partial<Lead>) => Promise.resolve({ ...dto, id: 'l1' })) };
  const scheduledMessageRepo = { create: jest.fn(), save: jest.fn() };
  const executor = new WorkflowExecutor(
    workflowService as never,
    conversationService as never,
    messageService as never,
    undefined,
    undefined,
    undefined,
    leadService as never,
    scheduledMessageRepo as never,
  );
  const ctx = (extra: Partial<TriggerContext> = {}): TriggerContext => ({
    businessId: 'biz',
    sessionId: 'sess',
    chatId: '919876543210@c.us',
    conversationId: 'conv-1',
    messageBody: 'hello',
    ...extra,
  });
  const calls = (mock: jest.Mock) => mock.mock.calls as unknown[][];
  const lastStatus = () => calls(workflowService.updateRunStatus).at(-1) as [string, RunStatus, { steps?: unknown[] }];
  const run = (triggerData: Record<string, unknown> = {}) =>
    ({ id: 'run', steps: [], triggerData }) as unknown as WorkflowRun;

  const single = (type: ActionType, config: Record<string, unknown>, maxRetries = 3) =>
    ({
      id: 'wf',
      businessId: 'biz',
      maxActionsPerRun: 100,
      maxExecutionSeconds: 300,
      maxRetries,
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes: [
          { id: 'trg', type: 'trigger', data: {} },
          { id: 'n', type, data: { config } },
        ],
        edges: [{ id: 'e', source: 'trg', target: 'n' }],
      },
    }) as unknown as WorkflowDefinition;

  beforeEach(() => jest.clearAllMocks());

  it('does not retry a node that messages the customer', async () => {
    messageService.sendText.mockRejectedValue(new Error('timeout after send'));
    await executor.execute(single(ActionType.SEND_MESSAGE, { message: 'Hello' }), run(), ctx());
    expect(messageService.sendText).toHaveBeenCalledTimes(1);
    expect(lastStatus()[1]).toBe(RunStatus.FAILED);
  });

  it.each([
    ['media without a URL', ActionType.SEND_MEDIA, {}],
    ['a document without a URL', ActionType.SEND_DOCUMENT, {}],
    ['a contact card without a number', ActionType.SEND_CONTACT_VCARD, {}],
    ['a payment link without a payee', ActionType.PAYMENT_LINK, { amount: '499' }],
    ['a payment link without an amount', ActionType.PAYMENT_LINK, { payeeVpa: 'shop@upi' }],
    ['a PDF without a hosted file', ActionType.DYNAMIC_PDF_GENERATOR, {}],
    ['a follow-up from another number', ActionType.SCHEDULE_FOLLOWUP, { message: 'Hi', sessionId: 'other-business' }],
    ['a sheet without a URL', ActionType.GOOGLE_SHEETS, {}],
  ])('reports %s as a failure', async (_label, type, config) => {
    await executor.execute(single(type, config, 0), run(), ctx());
    expect(lastStatus()[1]).toBe(RunStatus.FAILED);
  });

  it('never invents document data', async () => {
    await executor.execute(single(ActionType.AI_DOCUMENT_OCR, {}), run(), ctx({ messageBody: 'my car GJ01AB1234' }));
    const output = (lastStatus()[2].steps as { output: Record<string, unknown> }[])[0].output;
    expect(output).toMatchObject({ vehicleNumber: 'GJ01AB1234', policyNumber: null, insurerName: null, ocr: false });
  });

  it('saves a lead with menu choices, the real conversation, and answers taken literally', async () => {
    const wf = single(ActionType.CREATE_LEAD, {
      mainService: '{{steps.menu.choice}}',
      pincode: '{{steps.pin.answer}}',
    });
    await executor.execute(
      wf,
      run({
        stepOutputs: { menu: { choice: 'btn_mutual_fund' }, pin: { answer: '380 015' } },
        capturedVariables: { insuranceCompany: '{{steps.menu.choice}}' },
      }),
      ctx(),
    );
    expect(leadService.createOrUpdateLead).toHaveBeenCalledWith(
      expect.objectContaining({
        mainService: 'mutual_fund',
        pincode: '380015',
        insuranceCompany: '{{steps.menu.choice}}',
        conversationId: 'conv-1',
      }),
    );
  });

  it('opts out on the word "rad" but not on a name that starts with it, and records it', async () => {
    await executor.execute(
      single(ActionType.DND_MANAGER, { sendConfirmation: false }),
      run(),
      ctx({ messageBody: 'Radhe here' }),
    );
    expect(conversationService.updateConversation).not.toHaveBeenCalled();

    await executor.execute(
      single(ActionType.DND_MANAGER, { sendConfirmation: false }),
      run(),
      ctx({ messageBody: 'rad karo' }),
    );
    expect(conversationService.updateConversation).toHaveBeenCalledWith('conv-1', 'biz', { tags: ['dnd'] });
  });

  it('sends a poll-mode menu as numbered text', async () => {
    messageService.sendText.mockResolvedValue({ messageId: 'm' });
    const wf = single(ActionType.INTERACTIVE_BUTTONS, {
      mode: 'poll',
      message: 'Pick one',
      buttons: [
        { id: 'a', text: 'Insurance' },
        { id: 'b', text: 'Mutual Fund' },
      ],
    });
    await executor.execute(wf, run(), ctx());
    expect(String((calls(messageService.sendText)[0][1] as { text: string }).text)).toContain('1️⃣');
  });

  it('runs the first node of a graph that has no trigger node', async () => {
    messageService.sendText.mockResolvedValue({ messageId: 'm' });
    const wf = {
      ...single(ActionType.SEND_MESSAGE, {}),
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes: [{ id: 'first', type: ActionType.SEND_MESSAGE, data: { config: { message: 'Welcome' } } }],
        edges: [],
      },
    } as unknown as WorkflowDefinition;
    await executor.execute(wf, run(), ctx());
    expect(messageService.sendText).toHaveBeenCalledWith('sess', { chatId: '919876543210@c.us', text: 'Welcome' });
  });
});

describe('WorkflowService keeps run rows bounded', () => {
  it('stores only the latest 200 steps', async () => {
    const runRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const service = new WorkflowService({} as never, runRepo as never, {} as never);
    const steps = Array.from({ length: 250 }, (_, i) => ({ actionId: `s${i}` }));
    await service.updateRunStatus('run', RunStatus.COMPLETED, { steps });
    const saved = (runRepo.update.mock.calls[0] as unknown[])[1] as { steps: { actionId: string }[] };
    expect(saved.steps).toHaveLength(200);
    expect(saved.steps[0].actionId).toBe('s50');
  });
});

describe('LeadService lead reuse', () => {
  let leads: Lead[];
  let service: LeadService;

  beforeEach(() => {
    leads = [];
    const repo = {
      findOne: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [...leads]
            .reverse()
            .find(
              l =>
                l.customerPhone === where.customerPhone &&
                (!where.mainService || l.mainService === where.mainService) &&
                (!where.createdAt || l.createdAt.getTime() > Date.now() - 10 * 60 * 1000),
            ) ?? null,
        ),
      ),
      create: jest.fn((dto: Partial<Lead>) => ({ ...dto, id: `l${leads.length + 1}`, createdAt: new Date() }) as Lead),
      save: jest.fn((lead: Lead) => {
        if (!leads.includes(lead)) leads.push(lead);
        return Promise.resolve(lead);
      }),
      increment: jest.fn().mockResolvedValue(undefined),
    };
    service = new LeadService(repo as never, repo as never);
  });

  const workflowLead = (mainService: string) =>
    service.createOrUpdateLead({
      businessId: 'biz',
      chatId: '919876543210@c.us',
      customerPhone: '919876543210',
      mainService,
      selectedService: 'buy_new',
      pincode: '380015',
    });

  it('upgrades the lead captured from the first message instead of adding a second one', async () => {
    const { lead: inbound } = await service.captureInboundLead({
      businessId: 'biz',
      sessionId: 'sess',
      chatId: '919876543210@c.us',
      customerPhone: '919876543210',
    });
    const upgraded = await workflowLead('insurance');

    expect(leads).toHaveLength(1);
    expect(upgraded.id).toBe(inbound.id);
    expect(upgraded).toMatchObject({ mainService: 'insurance', status: LeadStatus.QUALIFIED });
  });

  it('keeps a mutual-fund enquiry separate from an insurance lead', async () => {
    await workflowLead('insurance');
    await workflowLead('mutual_fund');
    expect(leads.map(l => l.mainService)).toEqual(['insurance', 'mutual_fund']);
    expect(leads[1].leadNumber).toMatch(/^LD-MF-[0-9A-Z]{10,}$/);
    expect(new Set(leads.map(l => l.leadNumber)).size).toBe(2);
  });
});
