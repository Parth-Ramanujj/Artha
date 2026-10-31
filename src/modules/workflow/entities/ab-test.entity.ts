import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum AbTestStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  COMPLETED = 'completed',
  PAUSED = 'paused',
}

@Entity('ab_tests')
export class AbTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: AbTestStatus.DRAFT })
  status: AbTestStatus;

  @Column({ type: jsonColumnType() })
  variants: Array<{ id: string; name: string; weight: number; content: Record<string, unknown> }>;

  @Column({ type: jsonColumnType(), nullable: true })
  results: Record<string, { sent: number; delivered: number; replied: number }> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  winningVariantId: string | null;

  @Column({ type: 'integer', default: 100 })
  sampleSize: number;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  startedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
