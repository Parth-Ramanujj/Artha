import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { ActionType, TriggerType, WorkflowDefinition, WorkflowStatus } from './entities/workflow-definition.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { SSRF_BLOCKED_CLIENT_MESSAGE } from '../../common/security/ssrf-guard';
import { ApiKey } from '../auth/entities/api-key.entity';

describe('workflow outbound HTTP goes through the SSRF guard', () => {
  const executor = new WorkflowExecutor({} as never);

  it.each([
    ['loopback', 'http://127.0.0.1:9/admin'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/iam/security-credentials/x'],
    ['private network', 'http://10.0.0.5/internal'],
  ])('refuses %s without revealing the address', async (_label, url) => {
    const result = await executor.testWebhookCall({ url, method: 'GET' });
    expect(result.success).toBe(false);
    expect(result.error).toBe(SSRF_BLOCKED_CLIENT_MESSAGE);
    expect(JSON.stringify(result)).not.toMatch(/resolves to a blocked/);
  });

  describe('against an allowed local receiver', () => {
    let server: Server;
    let base: string;
    const previous = process.env.SSRF_ALLOWED_HOSTS;

    beforeAll(async () => {
      process.env.SSRF_ALLOWED_HOSTS = '127.0.0.1';
      server = createServer((req, res) => {
        if (req.url === '/big') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('x'.repeat(1024 * 1024 + 10));
        } else if (req.url === '/redirect') {
          res.writeHead(302, { location: 'http://169.254.169.254/' });
          res.end();
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, items: [{ name: 'Priya' }] }));
        }
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      process.env.SSRF_ALLOWED_HOSTS = previous;
      await new Promise(resolve => server.close(resolve));
    });

    it('returns parsed JSON and headers', async () => {
      const result = await executor.testWebhookCall({ url: `${base}/json`, method: 'GET' });
      expect(result).toMatchObject({ success: true, statusCode: 200, data: { ok: true, items: [{ name: 'Priya' }] } });
      expect(result.headers?.['content-type']).toContain('application/json');
    });

    it('stops reading a response larger than 1 MB', async () => {
      const result = await executor.testWebhookCall({ url: `${base}/big`, method: 'GET' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/larger than/);
    });

    it('does not follow a redirect to an internal address', async () => {
      const result = await executor.testWebhookCall({ url: `${base}/redirect`, method: 'GET' });
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
    });
  });
});

describe('an operator cannot publish through a plain update', () => {
  const draft = { id: 'wf', businessId: 'biz', status: WorkflowStatus.DRAFT, version: 1, definition: {} } as never;
  const workflowRepo = {
    findOne: jest.fn().mockResolvedValue(draft),
    save: jest.fn((wf: unknown) => Promise.resolve(wf)),
  };
  const service = new WorkflowService(workflowRepo as never, {} as never, {} as never);

  it('rejects a status change', async () => {
    await expect(service.update('wf', 'biz', { status: WorkflowStatus.PUBLISHED })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(workflowRepo.save).not.toHaveBeenCalled();
  });

  it('still accepts an edit that repeats the current status', async () => {
    await expect(service.update('wf', 'biz', { name: 'Renamed', status: WorkflowStatus.DRAFT })).resolves.toMatchObject(
      {
        name: 'Renamed',
        status: WorkflowStatus.DRAFT,
      },
    );
  });
});

describe('test runs only use a session the key may send from', () => {
  const wf = { id: 'wf', businessId: 'biz-a' } as WorkflowDefinition;
  const workflowService = {
    findOne: jest.fn().mockResolvedValue(wf),
    createRun: jest.fn().mockResolvedValue({ id: 'run' }),
    findRun: jest.fn().mockResolvedValue({ id: 'run' }),
  };
  const executor = { execute: jest.fn().mockResolvedValue(undefined) };
  const sessions: Record<string, { id: string; businessId: string | null }> = {
    'own-number': { id: 'own-number', businessId: 'biz-a' },
    'other-business': { id: 'other-business', businessId: 'biz-b' },
    unassigned: { id: 'unassigned', businessId: null },
  };
  const sessionRepo = {
    findOne: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(sessions[where.id] ?? null)),
  };
  const businessService = { getOrCreateDefaultBusiness: jest.fn().mockResolvedValue({ id: 'biz-default' }) };
  const controller = new WorkflowController(
    workflowService as never,
    executor as never,
    undefined,
    undefined,
    sessionRepo as never,
    businessService as never,
  );
  const key = (allowedSessions: string[] | null = null) => ({ businessId: 'biz-a', allowedSessions }) as ApiKey;

  beforeEach(() => jest.clearAllMocks());

  it('runs on a number of the same business', async () => {
    await controller.testRun('wf', { sessionId: 'own-number', chatId: '919876543210@c.us' }, key());
    expect(executor.execute).toHaveBeenCalled();
  });

  it.each([
    ["another business's number", 'other-business', key(), ForbiddenException],
    ['a number outside the key allow-list', 'own-number', key(['some-other-number']), ForbiddenException],
    ['a number of the default business', 'unassigned', key(), ForbiddenException],
    ['an unknown session', 'missing', key(), BadRequestException],
  ])('refuses %s', async (_label, sessionId, apiKey, error) => {
    await expect(controller.testRun('wf', { sessionId }, apiKey)).rejects.toBeInstanceOf(error);
    expect(workflowService.createRun).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });
});

describe('test runs never message the customer', () => {
  const workflowService = {
    updateRunStatus: jest.fn().mockResolvedValue(undefined),
    updateRunTriggerData: jest.fn().mockResolvedValue(undefined),
  };
  const messageService = { sendText: jest.fn().mockResolvedValue({ messageId: 'x' }) };
  const scheduledMessageRepo = { create: jest.fn(), save: jest.fn() };
  const executor = new WorkflowExecutor(
    workflowService as never,
    undefined,
    messageService as never,
    undefined,
    undefined,
    undefined,
    undefined,
    scheduledMessageRepo as never,
  );

  it('simulates questions and scheduled follow-ups instead of sending them', async () => {
    const node = (id: string, type: ActionType, config: Record<string, unknown>) => ({ id, type, data: { config } });
    const wf = {
      id: 'wf',
      businessId: 'biz',
      maxActionsPerRun: 100,
      maxExecutionSeconds: 300,
      maxRetries: 0,
      definition: {
        trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        conditions: [],
        actions: [],
        nodes: [
          { id: 'trg', type: 'trigger', data: {} },
          node('q', ActionType.ASK_QUESTION, { question: 'Your pincode?' }),
          node('f', ActionType.SCHEDULE_FOLLOWUP, { message: 'Still there?', delayMinutes: 60 }),
        ],
        edges: [
          { id: 'e1', source: 'trg', target: 'q' },
          { id: 'e2', source: 'q', target: 'f' },
        ],
      },
    } as unknown as WorkflowDefinition;
    const ctx: TriggerContext = {
      businessId: 'biz',
      sessionId: 'sess',
      chatId: '919876543210@c.us',
      metadata: { isTest: true },
    };

    await executor.execute(wf, { id: 'run', steps: [] } as unknown as WorkflowRun, ctx);

    expect(messageService.sendText).not.toHaveBeenCalled();
    expect(scheduledMessageRepo.save).not.toHaveBeenCalled();
    const lastCall = workflowService.updateRunStatus.mock.calls.at(-1) as unknown[] | undefined;
    const steps = (lastCall?.[2] as { steps: { output: { simulated?: boolean } }[] }).steps;
    expect(steps.map(s => s.output.simulated)).toEqual([true, true]);
  });
});

describe('customer text cannot change a webhook request', () => {
  let server: Server;
  let base: string;
  let received: { url?: string; body: string }[];
  const previous = process.env.SSRF_ALLOWED_HOSTS;
  const workflowService = {
    updateRunStatus: jest.fn().mockResolvedValue(undefined),
    updateRunTriggerData: jest.fn().mockResolvedValue(undefined),
  };
  const executor = new WorkflowExecutor(workflowService as never);

  beforeAll(async () => {
    process.env.SSRF_ALLOWED_HOSTS = '127.0.0.1';
    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => (body += String(chunk)));
      req.on('end', () => {
        received.push({ url: req.url, body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    process.env.SSRF_ALLOWED_HOSTS = previous;
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(() => {
    received = [];
    jest.clearAllMocks();
  });

  const sendWebhook = (config: Record<string, unknown>, messageBody: string) =>
    executor.execute(
      {
        id: 'wf',
        businessId: 'biz',
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [],
          nodes: [
            { id: 'trg', type: 'trigger', data: {} },
            { id: 'hook', type: ActionType.WEBHOOK_CALL, data: { config } },
          ],
          edges: [{ id: 'e', source: 'trg', target: 'hook' }],
        },
      } as unknown as WorkflowDefinition,
      { id: 'run', steps: [], triggerData: {} } as unknown as WorkflowRun,
      { businessId: 'biz', sessionId: 'sess', chatId: '919876543210@c.us', messageBody },
    );

  it('keeps a quote in the message inside its JSON string', async () => {
    await sendWebhook({ url: `${base}/hook`, body: '{"msg":"{{message}}"}' }, 'hi","admin":true,"x":"');
    expect(JSON.parse(received[0].body)).toEqual({ msg: 'hi","admin":true,"x":"' });
  });

  it('URL-encodes the message in the base URL', async () => {
    await sendWebhook({ url: `${base}/hook/{{message}}`, method: 'GET' }, '../admin?role=owner#');
    expect(received[0].url).toBe('/hook/..%2Fadmin%3Frole%3Downer%23');
  });

  it('stores the request URL without its query values', async () => {
    await sendWebhook({ url: `${base}/hook?apiKey=SECRET`, method: 'GET' }, 'hello');
    const lastCall = workflowService.updateRunStatus.mock.calls.at(-1) as unknown[];
    const steps = (lastCall[2] as { steps: { output: { url: string } }[] }).steps;
    expect(steps[0].output.url).toContain('apiKey=***');
    expect(JSON.stringify(steps)).not.toContain('SECRET');
  });
});
