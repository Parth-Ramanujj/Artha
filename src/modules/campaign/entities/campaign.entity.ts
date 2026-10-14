import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  templateId: string | null;

  @Column({ type: 'text', nullable: true })
  messageContent: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  messageOptions: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: CampaignStatus.DRAFT })
  status: CampaignStatus;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  scheduledAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  startedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  completedAt: Date | null;

  @Column({ type: 'integer', default: 10 })
  ratePerMinute: number;

  @Column({ type: 'integer', default: 0 })
  totalRecipients: number;

  @Column({ type: 'integer', default: 0 })
  sentCount: number;

  @Column({ type: 'integer', default: 0 })
  deliveredCount: number;

  @Column({ type: 'integer', default: 0 })
  failedCount: number;

  @Column({ type: jsonColumnType(), nullable: true })
  targetFilters: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
