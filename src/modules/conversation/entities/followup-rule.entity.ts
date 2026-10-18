import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export enum FollowupTrigger {
  NO_REPLY = 'no_reply',
  CONVERSATION_IDLE = 'conversation_idle',
  CART_ABANDONED = 'cart_abandoned',
  FORM_INCOMPLETE = 'form_incomplete',
  LEAD_MORNING = 'lead_morning',
}

@Entity('followup_rules')
export class FollowupRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 30 })
  trigger: string;

  @Column({ type: 'integer', default: 60 })
  delayMinutes: number;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'integer', default: 3 })
  maxAttempts: number;

  @Column({ type: 'integer', default: 1440 })
  cooldownMinutes: number;

  @Column({ type: jsonColumnType(), nullable: true })
  conditions: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  totalSent: number;

  @Column({ type: 'integer', default: 0 })
  totalRecovered: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
