import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import {
  WorkflowDefinition,
  WorkflowStatus,
  TriggerType,
  ActionType,
  ConditionType,
} from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import { BusinessService } from '../business/business.service';

function createMockWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'wf-1',
    businessId: 'biz-1',
    name: 'Test Workflow',
    slug: 'test-workflow',
    description: 'A test workflow',
    status: WorkflowStatus.DRAFT,
    version: 1,
    definition: {
      trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
      conditions: [],
      actions: [{ id: 'step-1', type: ActionType.SEND_MESSAGE, config: { message: 'Hello' } }],
    },
    maxActionsPerRun: 100,
    maxExecutionSeconds: 300,
    maxRetries: 3,
    maxConcurrentRuns: 5,
    publishedBy: null,
    publishedAt: null,
    createdBy: 'key-1',
    updatedBy: 'key-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
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
    ...overrides,
  };
}

describe('WorkflowService', () => {
  let service: WorkflowService;
  let workflowRepo: jest.Mocked<Partial<Repository<WorkflowDefinition>>>;
  let runRepo: jest.Mocked<Partial<Repository<WorkflowRun>>>;
  let businessService: jest.Mocked<Partial<BusinessService>>;

  beforeEach(async () => {
    workflowRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation(data => ({ id: 'wf-1', ...data }) as WorkflowDefinition),
      save: jest.fn().mockImplementation(data => Promise.resolve(data)),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };

    runRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(data => ({ id: 'run-1', ...data }) as WorkflowRun),
      save: jest.fn().mockImplementation(data => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({} as any),
      createQueryBuilder: jest.fn(),
    };

    businessService = {
      getOrCreateDefaultBusiness: jest.fn().mockResolvedValue({ id: 'biz-1', name: 'Default Business' } as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: getRepositoryToken(WorkflowDefinition, 'data'), useValue: workflowRepo },
        { provide: getRepositoryToken(WorkflowRun, 'data'), useValue: runRepo },
        { provide: BusinessService, useValue: businessService },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  describe('create', () => {
    it('creates a new draft workflow with valid definition', async () => {
      workflowRepo.findOne?.mockResolvedValue(null);

      const result = await service.create('biz-1', {
        name: 'Welcome Bot',
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
          conditions: [],
          actions: [{ id: 'a1', type: ActionType.SEND_MESSAGE, config: { message: 'Hi' } }],
        },
      });

      expect(result.name).toBe('Welcome Bot');
      expect(result.slug).toBe('welcome-bot');
      expect(workflowRepo.save).toHaveBeenCalled();
    });

    it('throws ConflictException if slug already exists for the business', async () => {
      workflowRepo.findOne?.mockResolvedValue(createMockWorkflow());

      await expect(
        service.create('biz-1', {
          name: 'Test Workflow',
          definition: {
            trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
            actions: [{ id: 'a1', type: ActionType.SEND_MESSAGE }],
          },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if definition has invalid action type', async () => {
      await expect(
        service.create('biz-1', {
          name: 'Invalid WF',
          definition: {
            trigger: { type: TriggerType.MESSAGE_RECEIVED },
            actions: [{ id: 'a1', type: 'unknown_action' as any }],
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('returns the workflow when found and businessId matches', async () => {
      workflowRepo.findOne?.mockResolvedValue(createMockWorkflow({ id: 'wf-1', businessId: 'biz-1' }));

      const wf = await service.findOne('wf-1', 'biz-1');
      expect(wf.id).toBe('wf-1');
    });

    it('throws NotFoundException if workflow does not exist', async () => {
      workflowRepo.findOne?.mockResolvedValue(null);
      await expect(service.findOne('wf-999', 'biz-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if businessId does not match', async () => {
      workflowRepo.findOne?.mockResolvedValue(createMockWorkflow({ id: 'wf-1', businessId: 'biz-1' }));
      await expect(service.findOne('wf-1', 'biz-2')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('publish & disable', () => {
    it('publishes a draft workflow and increments version', async () => {
      const draft = createMockWorkflow({ status: WorkflowStatus.DRAFT, version: 1 });
      workflowRepo.findOne?.mockResolvedValue(draft);

      const published = await service.publish('wf-1', 'biz-1', 'admin-key');
      expect(published.status).toBe(WorkflowStatus.PUBLISHED);
      expect(published.version).toBe(2);
      expect(published.publishedBy).toBe('admin-key');
    });

    it('throws BadRequestException when publishing an already published workflow', async () => {
      const pub = createMockWorkflow({ status: WorkflowStatus.PUBLISHED });
      workflowRepo.findOne?.mockResolvedValue(pub);

      await expect(service.publish('wf-1', 'biz-1')).rejects.toThrow(BadRequestException);
    });

    it('disables a workflow successfully', async () => {
      const pub = createMockWorkflow({ status: WorkflowStatus.PUBLISHED });
      workflowRepo.findOne?.mockResolvedValue(pub);

      const disabled = await service.disable('wf-1', 'biz-1', 'admin-key');
      expect(disabled.status).toBe(WorkflowStatus.DISABLED);
    });
  });

  describe('delete', () => {
    it('deletes draft or disabled workflow', async () => {
      const draft = createMockWorkflow({ status: WorkflowStatus.DRAFT });
      workflowRepo.findOne?.mockResolvedValue(draft);

      await service.delete('wf-1', 'biz-1');
      expect(workflowRepo.remove).toHaveBeenCalledWith(draft);
    });

    it('throws BadRequestException when deleting a published workflow', async () => {
      const pub = createMockWorkflow({ status: WorkflowStatus.PUBLISHED });
      workflowRepo.findOne?.mockResolvedValue(pub);

      await expect(service.delete('wf-1', 'biz-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Run lifecycle', () => {
    it('creates a new run when concurrency limit is not exceeded', async () => {
      const wf = createMockWorkflow();
      runRepo.count?.mockResolvedValue(0);

      const run = await service.createRun(wf, { msg: 'hi' }, 'sess-1');
      expect(run).toBeDefined();
      expect(run?.workflowId).toBe(wf.id);
      expect(runRepo.save).toHaveBeenCalled();
    });

    it('returns null when concurrency limit is reached', async () => {
      const wf = createMockWorkflow({ maxConcurrentRuns: 2 });
      runRepo.count?.mockResolvedValue(2);

      const run = await service.createRun(wf, {}, 'sess-1');
      expect(run).toBeNull();
    });

    it('cancels an active run', async () => {
      const activeRun = createMockRun({ status: RunStatus.RUNNING });
      runRepo.findOne?.mockResolvedValue(activeRun);

      const cancelled = await service.cancelRun('run-1', 'biz-1');
      expect(cancelled.status).toBe(RunStatus.CANCELLED);
      expect(cancelled.failureReason).toContain('Cancelled by operator');
    });

    it('throws BadRequestException when cancelling already completed run', async () => {
      const completedRun = createMockRun({ status: RunStatus.COMPLETED });
      runRepo.findOne?.mockResolvedValue(completedRun);

      await expect(service.cancelRun('run-1', 'biz-1')).rejects.toThrow(BadRequestException);
    });
  });
});
