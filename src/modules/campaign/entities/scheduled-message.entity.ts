import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum ScheduledMessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('scheduled_messages')
export class ScheduledMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'varchar', length: 200 })
  chatId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: jsonColumnType(), nullable: true })
  messageOptions: Record<string, unknown> | null;

  @Index()
  @Column({ type: dateColumnType(), transformer: DateTransformer })
  scheduledAt: Date;

  @Column({ type: 'varchar', length: 20, default: ScheduledMessageStatus.PENDING })
  status: ScheduledMessageStatus;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  sentAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'integer', default: 0 })
  retryCount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  campaignId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
