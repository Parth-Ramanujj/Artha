import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum NotificationType {
  CONVERSATION_ASSIGNED = 'conversation_assigned',
  CONVERSATION_UNREAD = 'conversation_unread',
  CAMPAIGN_COMPLETED = 'campaign_completed',
  CAMPAIGN_FAILED = 'campaign_failed',
  WORKFLOW_ERROR = 'workflow_error',
  SLA_BREACH = 'sla_breach',
  NEW_CONTACT = 'new_contact',
  SYSTEM = 'system',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  recipientId: string | null;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  data: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
