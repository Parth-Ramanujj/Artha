import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { Session } from '../session/entities/session.entity';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutor } from './workflow-executor.service';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { WorkflowStatus, TriggerType, ActionType } from './entities/workflow-definition.entity';
import { RunStatus } from './entities/workflow-run.entity';
import { REQUIRED_ROLE_KEY } from '../auth/decorators/auth.decorators';

describe('WorkflowController', () => {
  let controller: WorkflowController;
  let workflowService: jest.Mocked<Partial<WorkflowService>>;
  let executor: jest.Mocked<Partial<WorkflowExecutor>>;
  let reflector: Reflector;

  const mockApiKey: ApiKey = {
    id: 'key-1',
    businessId: 'biz-1',
    role: ApiKeyRole.ADMIN,
    name: 'Admin Key',
    maskedKey: 'test-key',
    keyHash: 'hash',
    prefix: 'pk',
    sessionId: null,
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    session: null,
  };

  const mockWf = {
    id: 'wf-1',
    businessId: 'biz-1',
    name: 'Test Workflow',
    slug: 'test-wf',
    description: null,
    status: WorkflowStatus.DRAFT,
    version: 1,
    definition: {
      trigger: { type: TriggerType.MESSAGE_RECEIVED, config: {} },
      conditions: [],
      actions: [{ id: 'a1', type: ActionType.SEND_MESSAGE, config: { message: 'Hi' } }],
    },
    maxActionsPerRun: 10,
    maxExecutionSeconds: 60,
    maxRetries: 1,
    maxConcurrentRuns: 5,
    publishedBy: null,
    publishedAt: null,
    createdBy: 'key-1',
    updatedBy: 'key-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRun = {
    id: 'run-1',
    workflowId: 'wf-1',
    businessId: 'biz-1',
    sessionId: 'sess-1',
    workflowVersion: 1,
    status: RunStatus.COMPLETED,
    triggerData: {},
    steps: [],
    actionCount: 1,
    failureReason: null,
    idempotencyKey: null,
    startedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    workflowService = {
      findAll: jest.fn().mockResolvedValue([mockWf] as any),
      findOne: jest.fn().mockResolvedValue(mockWf as any),
      create: jest.fn().mockResolvedValue(mockWf as any),
      update: jest.fn().mockResolvedValue(mockWf as any),
      publish: jest.fn().mockResolvedValue({ ...mockWf, status: WorkflowStatus.PUBLISHED } as any),
      disable: jest.fn().mockResolvedValue({ ...mockWf, status: WorkflowStatus.DISABLED } as any),
      delete: jest.fn().mockResolvedValue(undefined),
      findRuns: jest.fn().mockResolvedValue([mockRun] as any),
      findRun: jest.fn().mockResolvedValue(mockRun as any),
      createRun: jest.fn().mockResolvedValue(mockRun as any),
      cancelRun: jest.fn().mockResolvedValue({ ...mockRun, status: RunStatus.CANCELLED } as any),
    };

    executor = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [
        { provide: WorkflowService, useValue: workflowService },
        { provide: WorkflowExecutor, useValue: executor },
        {
          provide: getRepositoryToken(Session, 'data'),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'sess-1', businessId: 'biz-1' }) },
        },
      ],
    }).compile();

    controller = module.get<WorkflowController>(WorkflowController);
    reflector = new Reflector();
  });

  describe('findAll & findOne', () => {
    it('returns workflow definitions for business', async () => {
      const result = await controller.findAll(mockApiKey, WorkflowStatus.DRAFT);
      expect(result).toEqual([mockWf]);
      expect(workflowService.findAll).toHaveBeenCalledWith('biz-1', {
        status: WorkflowStatus.DRAFT,
        limit: undefined,
        offset: undefined,
      });
    });

    it('returns a single workflow by ID', async () => {
      const result = await controller.findOne('wf-1', mockApiKey);
      expect(result).toEqual(mockWf);
      expect(workflowService.findOne).toHaveBeenCalledWith('wf-1', 'biz-1');
    });
  });

  describe('create, update, publish, disable, remove', () => {
    it('creates a draft workflow definition', async () => {
      const dto = {
        name: 'New WF',
        definition: {
          trigger: { type: TriggerType.MESSAGE_RECEIVED },
          actions: [{ id: 'a1', type: ActionType.SEND_MESSAGE }],
        },
      };
      await controller.create(dto as any, mockApiKey);
      expect(workflowService.create).toHaveBeenCalledWith('biz-1', dto, 'key-1');
    });

    it('publishes workflow definition', async () => {
      const res = await controller.publish('wf-1', mockApiKey);
      expect(res.status).toBe(WorkflowStatus.PUBLISHED);
      expect(workflowService.publish).toHaveBeenCalledWith('wf-1', 'biz-1', 'key-1');
    });

    it('disables workflow definition', async () => {
      const res = await controller.disable('wf-1', mockApiKey);
      expect(res.status).toBe(WorkflowStatus.DISABLED);
      expect(workflowService.disable).toHaveBeenCalledWith('wf-1', 'biz-1', 'key-1');
    });

    it('deletes draft or disabled workflow', async () => {
      await controller.remove('wf-1', mockApiKey);
      expect(workflowService.delete).toHaveBeenCalledWith('wf-1', 'biz-1');
    });
  });

  describe('testRun', () => {
    it('executes a test run immediately and returns the run result', async () => {
      const testDto = {
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: 'Test trigger',
      };

      const result = await controller.testRun('wf-1', testDto, mockApiKey);

      expect(workflowService.findOne).toHaveBeenCalledWith('wf-1', 'biz-1');
      expect(workflowService.createRun).toHaveBeenCalled();
      expect(executor.execute).toHaveBeenCalled();
      expect(result).toEqual(mockRun);
    });
  });

  describe('Runs list & cancel', () => {
    it('lists execution runs', async () => {
      const runs = await controller.findRuns(mockApiKey, 'wf-1');
      expect(runs).toEqual([mockRun]);
      expect(workflowService.findRuns).toHaveBeenCalledWith('biz-1', {
        workflowId: 'wf-1',
        status: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('cancels a running execution', async () => {
      const res = await controller.cancelRun('run-1', mockApiKey);
      expect(res.status).toBe(RunStatus.CANCELLED);
      expect(workflowService.cancelRun).toHaveBeenCalledWith('run-1', 'biz-1');
    });
  });

  describe('Role-based access control annotations', () => {
    it('requires OPERATOR role for create and update', () => {
      const createRole = reflector.get<ApiKeyRole>(REQUIRED_ROLE_KEY, controller.create);
      const updateRole = reflector.get<ApiKeyRole>(REQUIRED_ROLE_KEY, controller.update);
      expect(createRole).toBe(ApiKeyRole.OPERATOR);
      expect(updateRole).toBe(ApiKeyRole.OPERATOR);
    });

    it('requires ADMIN role for publish, disable, and remove', () => {
      const publishRole = reflector.get<ApiKeyRole>(REQUIRED_ROLE_KEY, controller.publish);
      const disableRole = reflector.get<ApiKeyRole>(REQUIRED_ROLE_KEY, controller.disable);
      const removeRole = reflector.get<ApiKeyRole>(REQUIRED_ROLE_KEY, controller.remove);
      expect(publishRole).toBe(ApiKeyRole.ADMIN);
      expect(disableRole).toBe(ApiKeyRole.ADMIN);
      expect(removeRole).toBe(ApiKeyRole.ADMIN);
    });
  });
});
