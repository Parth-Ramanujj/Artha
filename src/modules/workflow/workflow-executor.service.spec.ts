import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { ConversationService } from '../conversation/conversation.service';
import { MessageService } from '../message/message.service';
import {
  WorkflowDefinition,
  WorkflowStatus,
  TriggerType,
  ActionType,
  ConditionType,
} from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import { ConversationStatus } from '../conversation/entities/conversation.entity';

describe('WorkflowExecutor', () => {
  let executor: WorkflowExecutor;
  let workflowService: jest.Mocked<Partial<WorkflowService>>;
  let conversationService: jest.Mocked<Partial<ConversationService>>;
  let messageService: jest.Mocked<Partial<MessageService>>;

  const mockRun: WorkflowRun = {
    id: 'run-1',
    workflowId: 'wf-1',
    businessId: 'biz-1',
    sessionId: 'sess-1',
    workflowVersion: 1,
    status: RunStatus.PENDING,
    triggerData: {},
    steps: [],
    actionCount: 0,
    failureReason: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    workflowService = {
      updateRunStatus: jest.fn().mockResolvedValue(undefined),
      updateRunTriggerData: jest.fn().mockResolvedValue(undefined),
    };

    conversationService = {
      updateConversation: jest.fn().mockResolvedValue({} as any),
      findOneConversation: jest.fn().mockResolvedValue({ id: 'conv-1', tags: ['vip'] } as any),
      getOrCreateContact: jest.fn().mockResolvedValue({ id: 'contact-1' } as any),
      findContactByWaId: jest.fn().mockResolvedValue({ id: 'contact-1' } as any),
      updateContact: jest.fn().mockResolvedValue({ id: 'contact-1' } as any),
    };

    messageService = {
      sendText: jest.fn().mockResolvedValue({ messageId: 'msg-out-1' } as any),
      sendTemplate: jest.fn().mockResolvedValue({ messageId: 'msg-tpl-1' } as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutor,
        { provide: WorkflowService, useValue: workflowService },
        { provide: ConversationService, useValue: conversationService },
        { provide: MessageService, useValue: messageService },
      ],
    }).compile();

    executor = module.get<WorkflowExecutor>(WorkflowExecutor);
  });

  describe('evaluateTrigger', () => {
    it('returns true for any message when trigger is MESSAGE_RECEIVED', () => {
      const result = executor.evaluateTrigger(
        { type: TriggerType.MESSAGE_RECEIVED, config: {} },
        { businessId: 'biz-1', messageBody: 'Hello world' },
      );
      expect(result).toBe(true);
    });

    it('matches multi-keyword triggers with case insensitivity', () => {
      const trigger = {
        type: TriggerType.KEYWORD_MATCH,
        config: { keyword: 'price, quote, cost' },
      };

      expect(
        executor.evaluateTrigger(trigger, { businessId: 'biz-1', messageBody: 'Can you give me a QUOTE please?' }),
      ).toBe(true);

      expect(
        executor.evaluateTrigger(trigger, { businessId: 'biz-1', messageBody: 'What is the price?' }),
      ).toBe(true);

      expect(
        executor.evaluateTrigger(trigger, { businessId: 'biz-1', messageBody: 'Hello there' }),
      ).toBe(false);
    });
  });

  describe('evaluateConditions', () => {
    it('evaluates contact tag condition against context tags', () => {
      const cond = {
        type: ConditionType.CONTACT_TAG,
        config: { tag: 'vip' },
      };

      expect(
        executor.evaluateConditions([cond], {
          businessId: 'biz-1',
          contactTags: ['vip', 'lead'],
        }),
      ).toBe(true);

      expect(
        executor.evaluateConditions([cond], {
          businessId: 'biz-1',
          contactTags: ['standard'],
        }),
      ).toBe(false);
    });

    it('evaluates conversation status condition', () => {
      const cond = {
        type: ConditionType.CONVERSATION_STATUS,
        config: { status: ConversationStatus.OPEN },
      };

      expect(
        executor.evaluateConditions([cond], {
          businessId: 'biz-1',
          conversationStatus: ConversationStatus.OPEN,
        }),
      ).toBe(true);

      expect(
        executor.evaluateConditions([cond], {
          businessId: 'biz-1',
          conversationStatus: ConversationStatus.CLOSED,
        }),
      ).toBe(false);
    });
  });

  describe('Action Execution', () => {
    it('executes SEND_MESSAGE action with variable interpolation', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-1',
        businessId: 'biz-1',
        name: 'Echo Workflow',
        slug: 'echo',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'a1',
              type: ActionType.SEND_MESSAGE,
              config: { message: 'Hello {{name}}! We received: {{message}}' },
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: 'Interested in product A',
        metadata: { contactName: 'John Doe' },
      };

      await executor.execute(wf, { ...mockRun }, ctx);

      expect(messageService.sendText).toHaveBeenCalledWith('sess-1', {
        chatId: '919876543210@c.us',
        text: 'Hello John Doe! We received: Interested in product A',
      });
      expect(workflowService.updateRunStatus).toHaveBeenCalledWith('run-1', RunStatus.COMPLETED, expect.any(Object));
    });

    it('executes SEND_TEMPLATE action with variable substitution', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-1',
        businessId: 'biz-1',
        name: 'Template WF',
        slug: 'tmpl',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'a1',
              type: ActionType.SEND_TEMPLATE,
              config: { templateName: 'welcome_template', vars: { user: '{{name}}' } },
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        metadata: { contactName: 'Alice' },
      };

      await executor.execute(wf, { ...mockRun }, ctx);

      expect(messageService.sendTemplate).toHaveBeenCalledWith('sess-1', {
        chatId: '919876543210@c.us',
        templateName: 'welcome_template',
        templateId: undefined,
        vars: { user: 'Alice' },
      });
    });

    it('executes WEBHOOK_CALL action with payload', async () => {
      const originalFetch = global.fetch;
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ received: true }),
      });
      global.fetch = mockFetch as any;

      try {
        const wf: WorkflowDefinition = {
          id: 'wf-1',
          businessId: 'biz-1',
          name: 'Webhook WF',
          slug: 'webhook',
          description: null,
          status: WorkflowStatus.PUBLISHED,
          version: 1,
          definition: {
            trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
            conditions: [],
            actions: [
              {
                id: 'a1',
                type: ActionType.WEBHOOK_CALL,
                config: { url: 'https://example.com/api/lead', method: 'POST' },
              },
            ],
          },
          maxActionsPerRun: 10,
          maxExecutionSeconds: 30,
          maxRetries: 0,
          maxConcurrentRuns: 5,
          publishedBy: null,
          publishedAt: null,
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const ctx: TriggerContext = {
          businessId: 'biz-1',
          sessionId: 'sess-1',
          chatId: '919876543210@c.us',
          messageBody: 'Hello from customer',
        };

        await executor.execute(wf, { ...mockRun }, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api/lead',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          }),
        );
      } finally {
      }
    });

    it('executes WEBHOOK_CALL with queryParams and responseMapping', async () => {
      const originalFetch = global.fetch;
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: { orderId: 'ORD-999', status: 'approved' } }),
      });
      global.fetch = mockFetch as any;

      try {
        const wf: WorkflowDefinition = {
          id: 'wf-1',
          businessId: 'biz-1',
          name: 'Webhook Advanced WF',
          slug: 'webhook-adv',
          description: null,
          status: WorkflowStatus.PUBLISHED,
          version: 1,
          definition: {
            trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
            conditions: [],
            actions: [
              {
                id: 'a1',
                type: ActionType.WEBHOOK_CALL,
                config: {
                  url: 'https://example.com/api/orders',
                  method: 'GET',
                  queryParams: [
                    { key: 'phone', value: '{{phone}}' },
                    { key: 'tag', value: 'vip' },
                  ],
                  responseMapping: [
                    { path: 'data.orderId', variable: 'order_id' },
                  ],
                },
              },
            ],
          },
          maxActionsPerRun: 10,
          maxExecutionSeconds: 30,
          maxRetries: 0,
          maxConcurrentRuns: 5,
          publishedBy: null,
          publishedAt: null,
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const ctx: TriggerContext = {
          businessId: 'biz-1',
          sessionId: 'sess-1',
          chatId: '919876543210@c.us',
        };

        await executor.execute(wf, { ...mockRun }, ctx);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api/orders?phone=919876543210&tag=vip',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(workflowService.updateRunTriggerData).toHaveBeenCalledWith(
          'run-1',
          expect.objectContaining({
            capturedVariables: expect.objectContaining({
              order_id: 'ORD-999',
              lastHttpStatus: 200,
            }),
          }),
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('tests webhook call via testWebhookCall method', async () => {
      const originalFetch = global.fetch;
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ ok: true, echo: '919876543210' }),
      });
      global.fetch = mockFetch as any;

      try {
        const result = await executor.testWebhookCall({
          url: 'https://example.com/webhook',
          method: 'POST',
          queryParams: [{ key: 'sender', value: '{{phone}}' }],
          headers: [{ key: 'X-Test', value: 'yes' }],
          testVariables: { phone: '919876543210' },
        });

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.resolvedUrl).toBe('https://example.com/webhook?sender=919876543210');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('executes HANDOFF_TO_HUMAN action', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-1',
        businessId: 'biz-1',
        name: 'Handoff WF',
        slug: 'handoff',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'a1',
              type: ActionType.HANDOFF_TO_HUMAN,
              config: {},
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        conversationId: 'conv-1',
      };

      await executor.execute(wf, { ...mockRun }, ctx);

      expect(conversationService.updateConversation).toHaveBeenCalledWith(
        'conv-1',
        'biz-1',
        { status: ConversationStatus.PENDING },
      );
    });

    it('executes CREATE_CONTACT and UPDATE_CONTACT actions', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-1',
        businessId: 'biz-1',
        name: 'Contact WF',
        slug: 'contact',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'a1',
              type: ActionType.CREATE_CONTACT,
              config: { name: 'Bob', notes: 'VIP customer' },
            },
            {
              id: 'a2',
              type: ActionType.UPDATE_CONTACT,
              config: { tags: ['vip', 'loyalty'] },
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
      };

      await executor.execute(wf, { ...mockRun }, ctx);

      expect(conversationService.getOrCreateContact).toHaveBeenCalled();
      expect(conversationService.findContactByWaId).toHaveBeenCalledWith('biz-1', '919876543210@c.us');
      expect(conversationService.updateContact).toHaveBeenCalled();
    });
  });

  describe('Node-to-Node Data Transfer (n8n & MBG style)', () => {
    it('extractJsonPath supports dot and bracket notations', () => {
      const data = {
        user: { name: 'Rahul', city: 'Ahmedabad' },
        orders: [
          { id: 'ord-101', total: 499, items: [{ title: 'Shirt' }, { title: 'Pants' }] },
          { id: 'ord-102', total: 899 },
        ],
      };

      expect(executor.extractJsonPath(data, 'user.name')).toBe('Rahul');
      expect(executor.extractJsonPath(data, 'orders[0].id')).toBe('ord-101');
      expect(executor.extractJsonPath(data, 'orders[0].items[1].title')).toBe('Pants');
      expect(executor.extractJsonPath(data, 'orders[1].total')).toBe(899);
      expect(executor.extractJsonPath(data, 'orders[99].id')).toBeUndefined();
    });

    it('interpolates node output variables: {{steps.<nodeId>.<path>}} and {{steps.last.<path>}}', () => {
      const run: WorkflowRun = {
        ...mockRun,
        triggerData: {
          stepOutputs: {
            api_verify_user: {
              status: 200,
              data: {
                verified: true,
                customer: { name: 'Parth Patel', balance: 1250 },
                products: [{ id: 'p1', name: 'Premium Plan' }],
              },
            },
            last: {
              data: {
                customer: { name: 'Parth Patel', balance: 1250 },
              },
            },
          },
          capturedVariables: {
            couponCode: 'SAVE20',
          },
        },
      };

      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: 'Hello OpenWA',
        metadata: { contactName: 'Parth' },
      };

      // 1. Upstream node output interpolation
      const text1 = 'Hello {{steps.api_verify_user.data.customer.name}}, your balance is ₹{{steps.api_verify_user.data.customer.balance}}!';
      expect(executor.interpolateVariables(text1, ctx, run)).toBe('Hello Parth Patel, your balance is ₹1250!');

      // 2. Upstream node bracket path interpolation
      const text2 = 'Recommended item: {{steps.api_verify_user.data.products[0].name}}';
      expect(executor.interpolateVariables(text2, ctx, run)).toBe('Recommended item: Premium Plan');

      // 3. Last node shorthand
      const text3 = 'Welcome {{steps.last.data.customer.name}}!';
      expect(executor.interpolateVariables(text3, ctx, run)).toBe('Welcome Parth Patel!');

      // 4. Variables scope: {{vars.*}}
      const text4 = 'Applied coupon: {{vars.couponCode}}';
      expect(executor.interpolateVariables(text4, ctx, run)).toBe('Applied coupon: SAVE20');

      // 5. Trigger scope: {{trigger.*}}
      const text5 = 'Sender: {{trigger.phone}}, Message: {{trigger.message}}';
      expect(executor.interpolateVariables(text5, ctx, run)).toBe('Sender: 919876543210, Message: Hello OpenWA');
    });

    it('passes data from Action 1 (API call) directly into Action 2 (Send Message)', async () => {
      const apiResponse = {
        orderId: 'ORD-999',
        customerName: 'Aarav Sharma',
        trackingNumber: 'SHIP-IND-7788',
      };

      // Mock global fetch for webhook call
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => apiResponse,
      } as any);

      try {
        const wf: WorkflowDefinition = {
          id: 'wf-chain',
          businessId: 'biz-1',
          name: 'Chain WF',
          slug: 'chain-wf',
          description: null,
          status: WorkflowStatus.PUBLISHED,
          version: 1,
          definition: {
            trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
            conditions: [],
            actions: [
              {
                id: 'step_fetch_order',
                type: ActionType.WEBHOOK_CALL,
                config: {
                  url: 'https://api.example.com/orders/latest',
                  method: 'GET',
                },
              },
              {
                id: 'step_send_receipt',
                type: ActionType.SEND_MESSAGE,
                config: {
                  message: 'Dear {{steps.step_fetch_order.data.customerName}}, order #{{steps.step_fetch_order.data.orderId}} tracking is {{steps.step_fetch_order.data.trackingNumber}}!',
                },
              },
            ],
          },
          maxActionsPerRun: 10,
          maxExecutionSeconds: 30,
          maxRetries: 0,
          maxConcurrentRuns: 5,
          publishedBy: null,
          publishedAt: null,
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const runState: WorkflowRun = { ...mockRun, steps: [] };
        const ctx: TriggerContext = {
          businessId: 'biz-1',
          sessionId: 'sess-1',
          chatId: '919876543210@c.us',
        };

        await executor.execute(wf, runState, ctx);

        // Verify MessageService was invoked with the resolved data from step_fetch_order
        expect(messageService.sendText).toHaveBeenCalledWith('sess-1', {
          chatId: '919876543210@c.us',
          text: 'Dear Aarav Sharma, order #ORD-999 tracking is SHIP-IND-7788!',
        });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('Flow Studio New Node Types & Dry-Run Safety', () => {
    it('executes SET_FIELDS action, updates capturedVariables, and interpolates in subsequent step', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-set-fields',
        businessId: 'biz-1',
        name: 'Set Fields Test',
        slug: 'set-fields-test',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'step_set',
              type: ActionType.SET_FIELDS,
              config: {
                assignments: [
                  { name: 'leadScore', value: '95' },
                  { name: 'customerTier', value: 'VIP-Gold' },
                ],
              },
            },
            {
              id: 'step_send',
              type: ActionType.SEND_MESSAGE,
              config: {
                message: 'Hello, your tier is {{vars.customerTier}} with score {{vars.leadScore}}.',
              },
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const runState: WorkflowRun = { ...mockRun, triggerData: {}, steps: [] };
      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: 'Hello',
      };

      await executor.execute(wf, runState, ctx);

      // Verify capturedVariables were updated
      expect((runState.triggerData as any)?.capturedVariables?.customerTier).toBe('VIP-Gold');
      expect((runState.triggerData as any)?.capturedVariables?.leadScore).toBe('95');

      // Verify message was interpolated with captured variables
      expect(messageService.sendText).toHaveBeenCalledWith('sess-1', {
        chatId: '919876543210@c.us',
        text: 'Hello, your tier is VIP-Gold with score 95.',
      });
    });

    it('executes FILTER action and cleanly terminates execution when filter condition fails', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-filter',
        businessId: 'biz-1',
        name: 'Filter Test',
        slug: 'filter-test',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'step_filter',
              type: ActionType.FILTER,
              config: {
                field: 'trigger.message',
                operator: 'contains',
                value: 'urgent',
              },
            },
            {
              id: 'step_send',
              type: ActionType.SEND_MESSAGE,
              config: {
                message: 'Urgent priority acknowledged!',
              },
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const runState: WorkflowRun = { ...mockRun, steps: [] };
      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: 'Just a routine inquiry, nothing special.',
      };

      await executor.execute(wf, runState, ctx);

      // Filter condition was NOT met, so sendText should NOT have been called
      expect(messageService.sendText).not.toHaveBeenCalled();
      expect(workflowService.updateRunStatus).toHaveBeenCalledWith(
        'run-1',
        RunStatus.COMPLETED,
        expect.objectContaining({
          failureReason: expect.stringContaining('Workflow filtered at node step_filter'),
        }),
      );
    });

    it('executes STOP_WORKFLOW action and cleanly halts subsequent actions', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-stop',
        businessId: 'biz-1',
        name: 'Stop Test',
        slug: 'stop-test',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'step_stop',
              type: ActionType.STOP_WORKFLOW,
              config: {
                reason: 'Customer requested human handover immediately',
              },
            },
            {
              id: 'step_send',
              type: ActionType.SEND_MESSAGE,
              config: {
                message: 'This should never be sent',
              },
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const runState: WorkflowRun = { ...mockRun, steps: [] };
      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: 'Halt please',
      };

      await executor.execute(wf, runState, ctx);

      expect(messageService.sendText).not.toHaveBeenCalled();
      expect(workflowService.updateRunStatus).toHaveBeenCalledWith(
        'run-1',
        RunStatus.COMPLETED,
        expect.objectContaining({
          failureReason: expect.stringContaining('Workflow terminated at node step_stop: Customer requested human handover immediately'),
        }),
      );
    });

    it('enforces strict dry-run mode and never calls messageService when ctx.metadata.isTest is true', async () => {
      const wf: WorkflowDefinition = {
        id: 'wf-dry-run',
        businessId: 'biz-1',
        name: 'Dry Run Test',
        slug: 'dry-run-test',
        description: null,
        status: WorkflowStatus.PUBLISHED,
        version: 1,
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [
            {
              id: 'step_send',
              type: ActionType.SEND_MESSAGE,
              config: {
                message: 'Testing dry run mode safely',
              },
            },
            {
              id: 'step_media',
              type: ActionType.SEND_MEDIA,
              config: {
                mediaType: 'image',
                url: 'https://example.com/banner.jpg',
                caption: 'Studio Banner Preview',
              },
            },
            {
              id: 'step_sheets',
              type: ActionType.GOOGLE_SHEETS,
              config: {
                webhookUrl: 'https://sheets.googleapis.com/test',
                columns: { Contact: '{{phone}}', Status: 'Verified' },
              },
            },
          ],
        },
        maxActionsPerRun: 10,
        maxExecutionSeconds: 30,
        maxRetries: 0,
        maxConcurrentRuns: 5,
        publishedBy: null,
        publishedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const runState: WorkflowRun = { ...mockRun, steps: [] };
      const ctx: TriggerContext = {
        businessId: 'biz-1',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: 'Dry run check',
        metadata: { isTest: true },
      };

      await executor.execute(wf, runState, ctx);

      // Verify real outbound messaging was NOT invoked
      expect(messageService.sendText).not.toHaveBeenCalled();

      // Verify all steps completed in simulated dry-run mode
      const sendStep = runState.steps.find(s => s.actionId === 'step_send');
      expect(sendStep?.output?.['simulated']).toBe(true);
      expect(sendStep?.output?.['dryRun']).toBe(true);

      const mediaStep = runState.steps.find(s => s.actionId === 'step_media');
      expect(mediaStep?.output?.['simulated']).toBe(true);
      expect(mediaStep?.output?.['dryRun']).toBe(true);

      const sheetsStep = runState.steps.find(s => s.actionId === 'step_sheets');
      expect(sheetsStep?.output?.['simulated']).toBe(true);
      expect(sheetsStep?.output?.['dryRun']).toBe(true);
    });
  });
});
