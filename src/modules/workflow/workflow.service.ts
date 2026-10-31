import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import {
  WorkflowDefinition,
  WorkflowStatus,
  WorkflowDefinitionSchema,
  TriggerType,
  ActionType,
  ConditionType,
} from './entities/workflow-definition.entity';
import { WorkflowRun, RunStatus, StepResult } from './entities/workflow-run.entity';
import { parseKeywords } from './keyword-match';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { createLogger } from '../../common/services/logger.service';
import { BusinessService } from '../business/business.service';

// Longer than any legitimate pass (actions plus WAIT nodes) between two writes to the run row.
const STALE_RUN_MS = 30 * 60 * 1000;
const STUCK_RUN_SWEEP_MS = 5 * 60 * 1000;
const MAX_STORED_STEPS = 200;

@Injectable()
export class WorkflowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('WorkflowService');
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(WorkflowDefinition, 'data')
    private readonly workflowRepo: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowRun, 'data')
    private readonly runRepo: Repository<WorkflowRun>,
    private readonly businessService: BusinessService,
  ) {}

  onModuleInit(): void {
    const sweep = () =>
      void this.failStuckRuns().catch(err =>
        this.logger.warn(`Stuck run sweep failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    sweep();
    this.sweepTimer = setInterval(sweep, STUCK_RUN_SWEEP_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

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

    // Publishing and disabling are admin-only actions with their own validation; an operator edit
    // must not be a side door to either.
    if (dto.status !== undefined && dto.status !== wf.status) {
      throw new BadRequestException('Change a workflow status with the publish or disable action');
    }

    const isPublished = wf.status === WorkflowStatus.PUBLISHED;
    if (dto.definition) this.validateDefinition(dto.definition, isPublished);

    if (dto.name !== undefined) wf.name = dto.name;
    if (dto.description !== undefined) wf.description = dto.description ?? null;
    if (dto.definition !== undefined) wf.definition = dto.definition as unknown as WorkflowDefinitionSchema;
    if (dto.maxActionsPerRun !== undefined) wf.maxActionsPerRun = dto.maxActionsPerRun;
    if (dto.maxExecutionSeconds !== undefined) wf.maxExecutionSeconds = dto.maxExecutionSeconds;
    if (dto.maxRetries !== undefined) wf.maxRetries = dto.maxRetries;
    if (dto.maxConcurrentRuns !== undefined) wf.maxConcurrentRuns = dto.maxConcurrentRuns;

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

    if (![RunStatus.RUNNING, RunStatus.PENDING, RunStatus.PAUSED, RunStatus.WAITING].includes(run.status)) {
      throw new BadRequestException(`Cannot cancel a run in status "${run.status}"`);
    }

    run.status = RunStatus.CANCELLED;
    run.completedAt = new Date();
    run.failureReason = 'Cancelled by operator';

    return this.runRepo.save(run);
  }

  async getPublishedWorkflowsForTrigger(
    businessId: string | null,
    triggerType: TriggerType,
  ): Promise<WorkflowDefinition[]> {
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
    chatId?: string,
  ): Promise<WorkflowRun | null> {
    if (idempotencyKey) {
      const existing = await this.runRepo.findOne({
        where: { workflowId: workflow.id, idempotencyKey },
      });
      if (existing) return null;
    }

    // Only runs that are still making progress count; a crashed run must not block new customers.
    const activeSince = MoreThan(new Date(Date.now() - STALE_RUN_MS));
    const activeRuns = await this.runRepo.count({
      where: [
        { workflowId: workflow.id, status: RunStatus.RUNNING, updatedAt: activeSince },
        { workflowId: workflow.id, status: RunStatus.PENDING, updatedAt: activeSince },
        { workflowId: workflow.id, status: RunStatus.WAITING },
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
      chatId: chatId ?? null,
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
    // A long-lived run (many resumes) would otherwise grow its row without bound; keep the latest.
    if (extra.steps) update.steps = extra.steps.slice(-MAX_STORED_STEPS);
    if (extra.actionCount !== undefined) update.actionCount = extra.actionCount;

    await this.runRepo.update(runId, update);
  }

  /**
   * The run waiting for this customer's answer on this WhatsApp number. Expired waits are closed as
   * TIMED_OUT, and older waits in the same chat are cancelled so they cannot swallow later messages.
   */
  async findActivePausedRun(
    businessId: string,
    sessionId: string,
    chatId: string,
    now = new Date(),
  ): Promise<WorkflowRun | null> {
    const pausedRuns = await this.runRepo.find({
      where: { businessId, sessionId, chatId, status: RunStatus.PAUSED },
      order: { updatedAt: 'DESC' },
      take: 20,
    });
    let active: WorkflowRun | null = null;
    for (const r of pausedRuns) {
      const rawTimeout = r.triggerData?.['timeoutAt'];
      const timeoutAt = typeof rawTimeout === 'string' ? Date.parse(rawTimeout) : NaN;
      const expired = Number.isFinite(timeoutAt) && timeoutAt < now.getTime();
      if (!active && !expired && r.triggerData?.['waitingForInput']) {
        active = r;
        continue;
      }
      await this.updateRunStatus(r.id, expired ? RunStatus.TIMED_OUT : RunStatus.CANCELLED, {
        failureReason: expired ? 'Customer did not answer in time' : 'Replaced by a newer run in the same chat',
      });
    }
    return active;
  }

  /** Atomically moves a waiting run to RUNNING; false when another message already took it. */
  async claimPausedRun(runId: string): Promise<boolean> {
    const result = await this.runRepo.update({ id: runId, status: RunStatus.PAUSED }, { status: RunStatus.RUNNING });
    return (result.affected ?? 0) > 0;
  }

  /** Puts a run to sleep in one write, so a crash cannot leave it WAITING without its wake point. */
  async markRunWaiting(runId: string, triggerData: Record<string, unknown>, steps: StepResult[]): Promise<void> {
    const update: Record<string, unknown> = {
      status: RunStatus.WAITING,
      triggerData,
      steps: steps.slice(-MAX_STORED_STEPS),
    };
    await this.runRepo.update(runId, update);
  }

  findWaitingRuns(limit = 500): Promise<WorkflowRun[]> {
    return this.runRepo.find({ where: { status: RunStatus.WAITING }, order: { updatedAt: 'ASC' }, take: limit });
  }

  /** Atomically wakes a sleeping run; false when another timer, poll or instance already took it. */
  async claimWaitingRun(runId: string): Promise<boolean> {
    const result = await this.runRepo.update({ id: runId, status: RunStatus.WAITING }, { status: RunStatus.RUNNING });
    return (result.affected ?? 0) > 0;
  }

  /** Runs left RUNNING/PENDING by a crash or restart never finish on their own; close them. */
  async failStuckRuns(now = new Date()): Promise<number> {
    const result = await this.runRepo.update(
      {
        status: In([RunStatus.RUNNING, RunStatus.PENDING]),
        updatedAt: LessThan(new Date(now.getTime() - STALE_RUN_MS)),
      },
      {
        status: RunStatus.FAILED,
        failureReason: 'Run stopped making progress (server restart or crash)',
        completedAt: now,
      },
    );
    const failed = result.affected ?? 0;
    if (failed > 0) this.logger.warn(`Marked ${failed} stuck workflow run(s) as failed`);
    return failed;
  }

  async updateRunTriggerData(runId: string, triggerData: Record<string, unknown>): Promise<void> {
    const update: Record<string, unknown> = { triggerData };
    await this.runRepo.update(runId, update);
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

    if (
      isPublish &&
      d.trigger.type === TriggerType.KEYWORD_MATCH &&
      parseKeywords(d.trigger.config['keyword']).length === 0
    ) {
      throw new BadRequestException('A keyword trigger needs at least one keyword');
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

  // ── Analytics ──

  async getAnalyticsSummary(businessId: string) {
    const definitions = await this.workflowRepo.find({ where: { businessId } });
    const total = definitions.length;
    const published = definitions.filter(d => d.status === WorkflowStatus.PUBLISHED).length;
    const draft = definitions.filter(d => d.status === WorkflowStatus.DRAFT).length;

    const runs = await this.runRepo.find({ where: { businessId } });
    const totalRuns = runs.length;
    const completedRuns = runs.filter(r => r.status === RunStatus.COMPLETED).length;
    const failedRuns = runs.filter(r => r.status === RunStatus.FAILED).length;

    return {
      totalWorkflows: total,
      published,
      draft,
      totalRuns,
      completedRuns,
      failedRuns,
      successRate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0,
    };
  }

  async getPathStats(workflowId: string, businessId: string) {
    const definition = await this.workflowRepo.findOne({ where: { id: workflowId, businessId } });
    if (!definition) throw new NotFoundException('Workflow not found');

    const runs = await this.runRepo.find({ where: { workflowId } });
    const actionCounts: Record<string, number> = {};
    for (const run of runs) {
      if (run.steps && Array.isArray(run.steps)) {
        for (const step of run.steps) {
          const key = step.actionType ?? 'unknown';
          actionCounts[key] = (actionCounts[key] || 0) + 1;
        }
      }
    }

    return {
      workflowId,
      workflowName: definition.name,
      totalRuns: runs.length,
      actionCounts,
      averageDuration:
        runs.length > 0
          ? Math.round(
              runs.reduce((sum, r) => {
                const start = new Date(r.createdAt).getTime();
                const end = r.updatedAt ? new Date(r.updatedAt).getTime() : start;
                return sum + (end - start);
              }, 0) /
                runs.length /
                1000,
            )
          : 0,
    };
  }
}
