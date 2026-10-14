import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkflowDefinition,
  WorkflowStatus,
  WorkflowDefinitionSchema,
  TriggerType,
  ActionType,
  ConditionType,
} from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus } from './entities/workflow-run.entity';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { createLogger } from '../../common/services/logger.service';
import { BusinessService } from '../business/business.service';

@Injectable()
export class WorkflowService {
  private readonly logger = createLogger('WorkflowService');

  constructor(
    @InjectRepository(WorkflowDefinition, 'data')
    private readonly workflowRepo: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowRun, 'data')
    private readonly runRepo: Repository<WorkflowRun>,
    private readonly businessService: BusinessService,
  ) {}

  // ── Definition CRUD ──

  async create(businessId: string | null, dto: CreateWorkflowDto, apiKeyId?: string): Promise<WorkflowDefinition> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    this.validateDefinition(dto.definition, false);

    const slug = this.generateSlug(dto.name);
    const existing = await this.workflowRepo.findOne({ where: { businessId: targetBusinessId, slug } });
    if (existing) {
      throw new ConflictException(`Workflow with slug "${slug}" already exists`);
    }

    const workflow = this.workflowRepo.create({
      businessId: targetBusinessId,
      name: dto.name,
      slug,
      description: dto.description ?? null,
      definition: dto.definition as unknown as WorkflowDefinitionSchema,
      maxActionsPerRun: dto.maxActionsPerRun ?? 100,
      maxExecutionSeconds: dto.maxExecutionSeconds ?? 300,
      maxRetries: dto.maxRetries ?? 3,
      maxConcurrentRuns: dto.maxConcurrentRuns ?? 5,
      createdBy: apiKeyId ?? null,
      updatedBy: apiKeyId ?? null,
    });
    return this.workflowRepo.save(workflow);
  }

  async findAll(
    businessId: string | null,
    opts: { status?: WorkflowStatus; limit?: number; offset?: number } = {},
  ): Promise<WorkflowDefinition[]> {
    const qb = this.workflowRepo.createQueryBuilder('w');
    if (businessId) qb.where('w.businessId = :businessId', { businessId });

    if (opts.status) qb.andWhere('w.status = :status', { status: opts.status });

    qb.orderBy('w.updatedAt', 'DESC');
    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async findOne(id: string, businessId: string | null): Promise<WorkflowDefinition> {
    const wf = await this.workflowRepo.findOne({ where: { id } });
    if (!wf) throw new NotFoundException('Workflow not found');
    if (businessId && wf.businessId !== businessId) throw new ForbiddenException('Not authorized for this workflow');
    return wf;
  }

  async update(
    id: string,
    businessId: string | null,
    dto: UpdateWorkflowDto,
    apiKeyId?: string,
  ): Promise<WorkflowDefinition> {
    const wf = await this.findOne(id, businessId);

    const isPublished = wf.status === WorkflowStatus.PUBLISHED;
    if (dto.definition) this.validateDefinition(dto.definition, isPublished);

    if (dto.name !== undefined) wf.name = dto.name;
    if (dto.description !== undefined) wf.description = dto.description ?? null;
    if (dto.definition !== undefined) wf.definition = dto.definition as unknown as WorkflowDefinitionSchema;
    if (dto.maxActionsPerRun !== undefined) wf.maxActionsPerRun = dto.maxActionsPerRun;
    if (dto.maxExecutionSeconds !== undefined) wf.maxExecutionSeconds = dto.maxExecutionSeconds;
    if (dto.maxRetries !== undefined) wf.maxRetries = dto.maxRetries;
    if (dto.maxConcurrentRuns !== undefined) wf.maxConcurrentRuns = dto.maxConcurrentRuns;
    if (dto.status !== undefined) wf.status = dto.status;

    if (isPublished) {
      wf.version += 1;
      wf.publishedAt = new Date();
      wf.publishedBy = apiKeyId ?? null;
    }
    wf.updatedBy = apiKeyId ?? null;

    return this.workflowRepo.save(wf);
  }

  async publish(id: string, businessId: string | null, apiKeyId?: string): Promise<WorkflowDefinition> {
    const wf = await this.findOne(id, businessId);

    if (wf.status === WorkflowStatus.PUBLISHED) {
      throw new BadRequestException('Workflow is already published');
    }

    this.validateDefinition(wf.definition, true);

    wf.status = WorkflowStatus.PUBLISHED;
    wf.version += 1;
    wf.publishedBy = apiKeyId ?? null;
    wf.publishedAt = new Date();
    wf.updatedBy = apiKeyId ?? null;

    return this.workflowRepo.save(wf);
  }

  async disable(id: string, businessId: string | null, apiKeyId?: string): Promise<WorkflowDefinition> {
    const wf = await this.findOne(id, businessId);

    wf.status = WorkflowStatus.DISABLED;
    wf.updatedBy = apiKeyId ?? null;

    return this.workflowRepo.save(wf);
  }

  async delete(id: string, businessId: string | null): Promise<void> {
    const wf = await this.findOne(id, businessId);

    if (wf.status === WorkflowStatus.PUBLISHED) {
      throw new BadRequestException('Cannot delete a published workflow. Disable it first.');
    }

    await this.workflowRepo.remove(wf);
  }

  // ── Run management ──

  async findRuns(
    businessId: string | null,
    opts: { workflowId?: string; status?: RunStatus; limit?: number; offset?: number } = {},
  ): Promise<WorkflowRun[]> {
    const qb = this.runRepo.createQueryBuilder('r');
    if (businessId) qb.where('r.businessId = :businessId', { businessId });

    if (opts.workflowId) qb.andWhere('r.workflowId = :workflowId', { workflowId: opts.workflowId });
    if (opts.status) qb.andWhere('r.status = :status', { status: opts.status });

    qb.orderBy('r.createdAt', 'DESC');
    qb.take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);

    return qb.getMany();
  }

  async findRun(id: string, businessId: string | null): Promise<WorkflowRun> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Workflow run not found');
    if (businessId && run.businessId !== businessId) throw new ForbiddenException('Not authorized for this run');
    return run;
  }

  async cancelRun(id: string, businessId: string | null): Promise<WorkflowRun> {
    const run = await this.findRun(id, businessId);

    if (run.status !== RunStatus.RUNNING && run.status !== RunStatus.PENDING && run.status !== RunStatus.PAUSED) {
      throw new BadRequestException(`Cannot cancel a run in status "${run.status}"`);
    }

    run.status = RunStatus.CANCELLED;
    run.completedAt = new Date();
    run.failureReason = 'Cancelled by operator';

    return this.runRepo.save(run);
  }

  async getPublishedWorkflowsForTrigger(businessId: string | null, triggerType: TriggerType): Promise<WorkflowDefinition[]> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    const all = await this.workflowRepo.find({
      where: { businessId: targetBusinessId, status: WorkflowStatus.PUBLISHED },
    });
    return all.filter(wf => wf.definition.trigger.type === triggerType);
  }

  async createRun(
    workflow: WorkflowDefinition,
    triggerData: Record<string, unknown>,
    sessionId?: string,
    idempotencyKey?: string,
  ): Promise<WorkflowRun | null> {
    if (idempotencyKey) {
      const existing = await this.runRepo.findOne({
        where: { workflowId: workflow.id, idempotencyKey },
      });
      if (existing) return null;
    }

    const activeRuns = await this.runRepo.count({
      where: [
        { workflowId: workflow.id, status: RunStatus.RUNNING },
        { workflowId: workflow.id, status: RunStatus.PENDING },
      ],
    });
    if (activeRuns >= workflow.maxConcurrentRuns) {
      this.logger.warn('Concurrent run limit reached', {
        workflowId: workflow.id,
        activeRuns,
        limit: workflow.maxConcurrentRuns,
      });
      return null;
    }

    const run = this.runRepo.create({
      workflowId: workflow.id,
      businessId: workflow.businessId,
      sessionId: sessionId ?? null,
      workflowVersion: workflow.version,
      triggerData,
      idempotencyKey: idempotencyKey ?? null,
      steps: [],
    });
    return this.runRepo.save(run);
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    extra: { failureReason?: string; steps?: unknown[]; actionCount?: number } = {},
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === RunStatus.RUNNING) update.startedAt = new Date();
    if ([RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED, RunStatus.TIMED_OUT].includes(status)) {
      update.completedAt = new Date();
    }
    if (extra.failureReason) update.failureReason = extra.failureReason;
    if (extra.steps) update.steps = extra.steps;
    if (extra.actionCount !== undefined) update.actionCount = extra.actionCount;

    await this.runRepo.update(runId, update);
  }

  async findActivePausedRun(businessId: string, chatId: string): Promise<WorkflowRun | null> {
    const pausedRuns = await this.runRepo.find({
      where: { businessId, status: RunStatus.PAUSED },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    for (const r of pausedRuns) {
      if (r.triggerData?.['chatId'] === chatId && r.triggerData?.['waitingForInput']) {
        return r;
      }
    }
    return null;
  }

  async updateRunTriggerData(runId: string, triggerData: Record<string, unknown>): Promise<void> {
    await this.runRepo.update(runId, { triggerData: triggerData as any });
  }

  // ── Validation ──

  private validateDefinition(def: unknown, isPublish = false): void {
    const d = def as WorkflowDefinitionSchema;
    if (!d || typeof d !== 'object') throw new BadRequestException('Invalid workflow definition');

    if (!d.trigger?.type || !Object.values(TriggerType).includes(d.trigger.type)) {
      throw new BadRequestException(`Invalid trigger type: ${d.trigger?.type}`);
    }

    if (!d.trigger.config) {
      d.trigger.config = {};
    }

    if (d.conditions && !Array.isArray(d.conditions)) {
      throw new BadRequestException('Conditions must be an array');
    }
    if (Array.isArray(d.conditions)) {
      for (const c of d.conditions) {
        if (!Object.values(ConditionType).includes(c.type)) {
          throw new BadRequestException(`Invalid condition type: ${c.type}`);
        }
      }
    } else {
      d.conditions = [];
    }

    if (!Array.isArray(d.actions)) {
      d.actions = [];
    }

    if (isPublish && d.actions.length === 0 && (!d.nodes || d.nodes.length === 0)) {
      throw new BadRequestException('At least one action or node is required to publish a workflow');
    }

    if (d.nodes && Array.isArray(d.nodes)) {
      const nodeIds = new Set<string>();
      for (const n of d.nodes) {
        if (!n.id) throw new BadRequestException('Each node must have an id');
        if (nodeIds.has(n.id)) throw new BadRequestException(`Duplicate node id: ${n.id}`);
        nodeIds.add(n.id);
      }
    }

    const actionIds = new Set<string>();
    for (const a of d.actions) {
      if (!a.id) throw new BadRequestException('Each action must have an id');
      if (actionIds.has(a.id)) throw new BadRequestException(`Duplicate action id: ${a.id}`);
      actionIds.add(a.id);
      if (!Object.values(ActionType).includes(a.type)) {
        throw new BadRequestException(`Invalid action type: ${a.type}`);
      }
      if (!a.config) {
        a.config = {};
      }
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }
}
