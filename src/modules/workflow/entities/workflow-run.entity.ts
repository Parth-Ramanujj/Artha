import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum RunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMED_OUT = 'timed_out',
  PAUSED = 'paused',
}

export interface StepResult {
  actionId: string;
  actionType: string;
  status: 'success' | 'failed' | 'skipped' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  output?: Record<string, unknown>;
  error?: string;
  retryCount?: number;
}

@Entity('workflow_runs')
export class WorkflowRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  workflowId: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  chatId: string | null;

  @Column({ type: 'integer' })
  workflowVersion: number;

  @Column({ type: 'varchar', length: 20, default: RunStatus.PENDING })
  status: RunStatus;

  @Column({ type: jsonColumnType(), nullable: true })
  triggerData: Record<string, unknown> | null;

  @Column({ type: jsonColumnType(), nullable: true })
  steps: StepResult[] | null;

  @Column({ type: 'integer', default: 0 })
  actionCount: number;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  startedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
