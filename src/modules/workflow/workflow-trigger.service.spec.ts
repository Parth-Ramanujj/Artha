import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { AiAgentService } from '../ai/ai-agent.service';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor } from './workflow-executor.service';
import { HookManager } from '../../core/hooks';
import { Session } from '../session/entities/session.entity';
import { BusinessService } from '../business/business.service';
import { ConversationService } from '../conversation/conversation.service';
import { WorkflowDefinition, WorkflowStatus, TriggerType, ActionType } from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import { AiService } from '../ai/ai.service';

describe('WorkflowTriggerService', () => {
  let triggerService: WorkflowTriggerService;
  let hookManager: { register: jest.Mock; unregister: jest.Mock };
  let workflowService: jest.Mocked<Partial<WorkflowService>>;
  let executor: jest.Mocked<Partial<WorkflowExecutor>>;
  let sessionRepo: jest.Mocked<Partial<Repository<Session>>>;
  let businessService: jest.Mocked<Partial<BusinessService>>;
  let conversationService: jest.Mocked<Partial<ConversationService>>;
  let aiService: { autoReply: jest.Mock };
  let aiAgents: { autoReply: jest.Mock };

  let registeredHookCallback: ((ctx: any) => Promise<any>) | undefined;

  const mockWorkflow: WorkflowDefinition = {
    id: 'wf-1',
    businessId: 'biz-1',
    name: 'Auto-Reply',
    slug: 'auto-reply',
    description: null,
    status: WorkflowStatus.PUBLISHED,
    version: 1,
    definition: {
      trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
      conditions: [],
      actions: [{ id: 'a1', type: ActionType.SEND_MESSAGE, config: { message: 'Hello' } }],
    },
    maxActionsPerRun: 10,
    maxExecutionSeconds: 30,
    maxRetries: 1,
    maxConcurrentRuns: 5,
    publishedBy: null,
    publishedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRun: WorkflowRun = {
    id: 'run-1',
    workflowId: 'wf-1',
    businessId: 'biz-1',
    sessionId: 'sess-1',
    chatId: null,
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
    hookManager = {
      register: jest.fn().mockImplementation((name, event, cb) => {
        registeredHookCallback = cb;
        return 'hook-id-1';
      }),
      unregister: jest.fn(),
    };

    workflowService = {
      getPublishedWorkflowsForTrigger: jest.fn().mockResolvedValue([mockWorkflow]),
      createRun: jest.fn().mockResolvedValue(mockRun),
      findActivePausedRun: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(mockWorkflow),
    };

    executor = {
      execute: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue('resumed'),
      evaluateTrigger: jest.fn().mockReturnValue(true),
      evaluateConditions: jest.fn().mockReturnValue(true),
    };
    aiService = { autoReply: jest.fn().mockResolvedValue('replied') };
    aiAgents = { autoReply: jest.fn().mockResolvedValue('skipped') };

    sessionRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'sess-1', businessId: 'biz-1' } as any),
    };

    businessService = {
      getOrCreateDefaultBusiness: jest.fn().mockResolvedValue({ id: 'biz-1' } as any),
    };

    conversationService = {
      getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1', status: 'open', tags: [] } as any),
      updateConversation: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTriggerService,
        { provide: HookManager, useValue: hookManager },
        { provide: WorkflowService, useValue: workflowService },
        { provide: WorkflowExecutor, useValue: executor },
        { provide: getRepositoryToken(Session, 'data'), useValue: sessionRepo },
        { provide: BusinessService, useValue: businessService },
        { provide: ConversationService, useValue: conversationService },
        { provide: AiService, useValue: aiService },
        { provide: AiAgentService, useValue: aiAgents },
      ],
    }).compile();

    triggerService = module.get<WorkflowTriggerService>(WorkflowTriggerService);
  });

  it('registers and unregisters hook lifecycle correctly', () => {
    triggerService.onModuleInit();
    expect(hookManager.register).toHaveBeenCalledWith(
      'workflow-trigger',
      'message:received',
      expect.any(Function),
      900,
    );

    triggerService.onModuleDestroy();
    expect(hookManager.unregister).toHaveBeenCalledWith('hook-id-1');
  });

  it('ignores outgoing messages sent fromMe', async () => {
    triggerService.onModuleInit();

    const result = await registeredHookCallback?.({
      sessionId: 'sess-1',
      data: { fromMe: true, body: 'Outgoing message' },
    });

    expect(result).toEqual({ continue: true });
    expect(workflowService.createRun).not.toHaveBeenCalled();
  });

  it('triggers published workflows on incoming message', async () => {
    triggerService.onModuleInit();

    await registeredHookCallback?.({
      sessionId: 'sess-1',
      data: {
        fromMe: false,
        id: 'msg-in-1',
        chatId: '919876543210@c.us',
        from: '919876543210@c.us',
        to: 'bot@c.us',
        body: 'Hello bot',
        type: 'text',
        kind: 'individual',
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

    // Flush async microtask queue since handleMessageTrigger is fire-and-forget in hook
    await new Promise(resolve => setImmediate(resolve));

    expect(workflowService.createRun).toHaveBeenCalledWith(
      mockWorkflow,
      expect.any(Object),
      'sess-1',
      expect.any(String),
      '919876543210@c.us',
    );
    expect(executor.execute).toHaveBeenCalled();
  });

  it.each([
    ['a group', { chatId: '120363000000@g.us', isGroup: true, kind: 'group' }],
    ['a channel', { chatId: '120363158599536155@newsletter', kind: 'channel' }],
    ['a junk chat id', { chatId: '0@c.us' }],
    ['history older than two hours', { timestamp: Math.floor(Date.now() / 1000) - 3 * 3600 }],
  ])('does not start workflows for %s', async (_label, overrides) => {
    triggerService.onModuleInit();
    await registeredHookCallback?.({
      sessionId: 'sess-1',
      data: {
        fromMe: false,
        id: 'msg-x',
        chatId: '919876543210@c.us',
        from: '919876543210@c.us',
        body: 'Hi',
        type: 'text',
        kind: 'individual',
        timestamp: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    });
    await new Promise(resolve => setImmediate(resolve));

    expect(workflowService.findActivePausedRun).not.toHaveBeenCalled();
    expect(workflowService.createRun).not.toHaveBeenCalled();
  });

  it('starts workflows afresh when the customer restarts a waiting run', async () => {
    (workflowService.findActivePausedRun as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.PAUSED });
    (executor.resume as jest.Mock).mockResolvedValue('restart');
    triggerService.onModuleInit();

    await registeredHookCallback?.({
      sessionId: 'sess-1',
      data: {
        fromMe: false,
        id: 'msg-menu',
        chatId: '919876543210@c.us',
        from: '919876543210@c.us',
        body: 'menu',
        type: 'text',
        kind: 'individual',
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    await new Promise(resolve => setImmediate(resolve));

    expect(executor.resume).toHaveBeenCalled();
    expect(workflowService.createRun).toHaveBeenCalled();
  });

  it('resumes active paused workflow when incoming reply arrives', async () => {
    const pausedRun = {
      ...mockRun,
      status: RunStatus.PAUSED,
      triggerData: { chatId: '919876543210@c.us', waitingForInput: true },
    };
    workflowService.findActivePausedRun?.mockResolvedValue(pausedRun);

    triggerService.onModuleInit();

    await registeredHookCallback?.({
      sessionId: 'sess-1',
      data: {
        fromMe: false,
        id: 'msg-reply-1',
        chatId: '919876543210@c.us',
        from: '919876543210@c.us',
        body: '1',
        type: 'text',
        kind: 'individual',
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

    await new Promise(resolve => setImmediate(resolve));

    expect(executor.resume).toHaveBeenCalledWith(mockWorkflow, pausedRun, expect.any(Object), '1', {
      id: 'msg-reply-1',
      timestamp: expect.any(Number),
    });
    expect(workflowService.createRun).not.toHaveBeenCalled();
  });

  describe('one workflow per message and full context', () => {
    const fire = async (body: string) => {
      triggerService.onModuleInit();
      await registeredHookCallback?.({
        sessionId: 'sess-1',
        data: {
          fromMe: false,
          id: `msg-${body}`,
          chatId: '919876543210@c.us',
          from: '919876543210@c.us',
          body,
          type: 'text',
          kind: 'individual',
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
      await new Promise(resolve => setImmediate(resolve));
    };

    it('starts only the first matching workflow, trying keyword workflows first', async () => {
      const catchAll = { ...mockWorkflow, id: 'wf-catch-all' };
      const keyword = {
        ...mockWorkflow,
        id: 'wf-keyword',
        definition: {
          ...mockWorkflow.definition,
          trigger: { type: TriggerType.KEYWORD_MATCH, config: { keyword: 'hi' } },
        },
      };
      (workflowService.getPublishedWorkflowsForTrigger as jest.Mock).mockImplementation(
        (_b: string, type: TriggerType) => Promise.resolve(type === TriggerType.KEYWORD_MATCH ? [keyword] : [catchAll]),
      );

      await fire('hi');

      expect(workflowService.createRun).toHaveBeenCalledTimes(1);
      expect(((workflowService.createRun as jest.Mock).mock.calls as unknown[][])[0][0]).toMatchObject({
        id: 'wf-keyword',
      });
    });

    it('gives a resumed run the conversation, tags and contact name', async () => {
      (workflowService.findActivePausedRun as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.PAUSED });
      (conversationService.getOrCreateConversation as jest.Mock).mockResolvedValue({
        id: 'conv-9',
        status: 'open',
        tags: ['vip'],
      });

      await fire('1');

      const ctx = ((executor.resume as jest.Mock).mock.calls as unknown[][])[0][2] as Record<string, unknown>;
      expect(ctx).toMatchObject({ conversationId: 'conv-9', contactTags: ['vip'] });
    });

    it('lifts an opt-out when the customer sends START, and only then', async () => {
      const optedOut = { id: 'conv-9', status: 'open', tags: ['vip', 'dnd'] };
      (conversationService.getOrCreateConversation as jest.Mock).mockResolvedValue(optedOut);
      (conversationService.updateConversation as jest.Mock).mockResolvedValue({ ...optedOut, tags: ['vip'] });

      await fire('hello');
      expect(conversationService.updateConversation).not.toHaveBeenCalledWith('conv-9', 'biz-1', expect.anything());

      await fire('START');
      expect(conversationService.updateConversation).toHaveBeenCalledWith('conv-9', 'biz-1', { tags: ['vip'] });
    });
  });

  describe('AI assistant coordination', () => {
    const deliver = async (body = 'what are your plans?') => {
      triggerService.onModuleInit();
      await registeredHookCallback?.({
        sessionId: 'sess-1',
        data: {
          fromMe: false,
          id: `msg-${body}`,
          chatId: '919876543210@c.us',
          from: '919876543210@c.us',
          body,
          type: 'text',
          kind: 'individual',
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
      await new Promise(resolve => setImmediate(resolve));
    };

    it('stays quiet when a workflow takes the message', async () => {
      await deliver();
      expect(executor.execute).toHaveBeenCalled();
      expect(aiService.autoReply).not.toHaveBeenCalled();
    });

    it('stays quiet while the customer is answering a workflow question', async () => {
      (workflowService.findActivePausedRun as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.PAUSED });
      await deliver('1');
      expect(executor.resume).toHaveBeenCalled();
      expect(aiService.autoReply).not.toHaveBeenCalled();
    });

    it('answers when no workflow matches, without creating a run', async () => {
      (executor.evaluateTrigger as jest.Mock).mockReturnValue(false);
      await deliver();
      expect(workflowService.createRun).not.toHaveBeenCalled();
      expect(aiService.autoReply).toHaveBeenCalledWith(
        'sess-1',
        'biz-1',
        expect.objectContaining({ body: 'what are your plans?' }),
      );
    });

    it('leaves a chat assigned to a person alone', async () => {
      (workflowService.getPublishedWorkflowsForTrigger as jest.Mock).mockResolvedValue([]);
      (conversationService.getOrCreateConversation as jest.Mock).mockResolvedValue({
        id: 'conv-1',
        status: 'open',
        assignedTo: 'agent-7',
        tags: [],
      });
      await deliver();
      expect(aiService.autoReply).not.toHaveBeenCalled();
    });

    it.each(['failed', 'handoff'])('hands the conversation to the team when the AI %s', async outcome => {
      (workflowService.getPublishedWorkflowsForTrigger as jest.Mock).mockResolvedValue([]);
      aiService.autoReply.mockResolvedValue(outcome);
      await deliver();
      expect(conversationService.updateConversation).toHaveBeenCalledWith('conv-1', 'biz-1', { status: 'pending' });
    });

    it('lets a business agent answer instead of the general assistant, never both', async () => {
      (workflowService.getPublishedWorkflowsForTrigger as jest.Mock).mockResolvedValue([]);
      aiAgents.autoReply.mockResolvedValue('replied');
      await deliver();
      expect(aiAgents.autoReply).toHaveBeenCalledWith(
        'sess-1',
        'biz-1',
        expect.objectContaining({ body: 'what are your plans?' }),
      );
      expect(aiService.autoReply).not.toHaveBeenCalled();
    });

    it('hands the chat to the team when the business agent fails', async () => {
      (workflowService.getPublishedWorkflowsForTrigger as jest.Mock).mockResolvedValue([]);
      aiAgents.autoReply.mockResolvedValue('failed');
      await deliver();
      expect(aiService.autoReply).not.toHaveBeenCalled();
      expect(conversationService.updateConversation).toHaveBeenCalledWith('conv-1', 'biz-1', { status: 'pending' });
    });

    it('does not change the conversation after a normal AI reply', async () => {
      (workflowService.getPublishedWorkflowsForTrigger as jest.Mock).mockResolvedValue([]);
      await deliver();
      expect(aiService.autoReply).toHaveBeenCalled();
      expect(conversationService.updateConversation).not.toHaveBeenCalled();
    });
  });
});
