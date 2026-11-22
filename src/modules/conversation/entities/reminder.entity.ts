import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum ReminderStatus {
  OPEN = 'open',
  DONE = 'done',
}

/** Why a reminder exists: typed by staff, or raised automatically by a deal-stage follow-up rule. */
export enum ReminderReason {
  MANUAL = 'manual',
  SEQUENCE_EXHAUSTED = 'sequence_exhausted',
  CUSTOMER_REPLIED = 'customer_replied',
}

@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  dealId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceRuleId: string | null;

  @Column({ type: 'varchar', length: 40, default: ReminderReason.MANUAL })
  reason: string;

  /** The follow-up cycle an automatic reminder belongs to (its last attempt), so one cycle raises at most one. */
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  cycleAt: Date | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Unassigned' })
  assignedTo: string;

  @Column({ type: dateColumnType(), transformer: DateTransformer })
  dueAt: Date;

  @Column({ type: 'varchar', length: 20, default: ReminderStatus.OPEN })
  status: ReminderStatus;

  /** Set once the due notification has been raised, so a reminder notifies exactly once. */
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  notifiedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
