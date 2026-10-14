import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor } from './workflow-executor.service';
import { HookManager } from '../../core/hooks';
import { Session } from '../session/entities/session.entity';
import { BusinessService } from '../business/business.service';
import { ConversationService } from '../conversation/conversation.service';
import {
  WorkflowDefinition,
  WorkflowStatus,
  TriggerType,
  ActionType,
} from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';

describe('WorkflowTriggerService', () => {
  let triggerService: WorkflowTriggerService;
  let hookManager: { register: jest.Mock; unregister: jest.Mock };
  let workflowService: jest.Mocked<Partial<WorkflowService>>;
  let executor: jest.Mocked<Partial<WorkflowExecutor>>;
  let sessionRepo: jest.Mocked<Partial<Repository<Session>>>;
  let businessService: jest.Mocked<Partial<BusinessService>>;
  let conversationService: jest.Mocked<Partial<ConversationService>>;

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
      resume: jest.fn().mockResolvedValue(undefined),
    };

    sessionRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'sess-1', businessId: 'biz-1' } as any),
    };

    businessService = {
      getOrCreateDefaultBusiness: jest.fn().mockResolvedValue({ id: 'biz-1' } as any),
    };

    conversationService = {
      getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1', status: 'open', tags: [] } as any),
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
        timestamp: 1600000000,
      },
    });

    // Flush async microtask queue since handleMessageTrigger is fire-and-forget in hook
    await new Promise(resolve => setImmediate(resolve));

    expect(workflowService.createRun).toHaveBeenCalledWith(
      mockWorkflow,
      expect.any(Object),
      'sess-1',
      expect.any(String),
    );
    expect(executor.execute).toHaveBeenCalled();
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
      },
    });

    await new Promise(resolve => setImmediate(resolve));

    expect(executor.resume).toHaveBeenCalledWith(
      mockWorkflow,
      pausedRun,
      expect.any(Object),
      '1',
    );
    expect(workflowService.createRun).not.toHaveBeenCalled();
  });
});
