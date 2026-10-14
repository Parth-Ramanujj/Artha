import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum SlaEventType {
  FIRST_RESPONSE_MET = 'first_response_met',
  FIRST_RESPONSE_BREACHED = 'first_response_breached',
  RESOLUTION_MET = 'resolution_met',
  RESOLUTION_BREACHED = 'resolution_breached',
}

@Entity('sla_events')
export class SlaEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  policyId: string | null;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'integer', nullable: true })
  targetMinutes: number | null;

  @Column({ type: 'integer', nullable: true })
  actualMinutes: number | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  deadlineAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
