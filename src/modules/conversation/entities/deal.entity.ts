import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export enum DealStage {
  LEAD = 'lead',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

export enum DealPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('deals')
export class Deal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  contactName: string;

  @Column({ type: 'varchar', length: 50 })
  contactPhone: string;

  @Column({ type: 'float', default: 0 })
  amount: number;

  @Index()
  @Column({ type: 'varchar', length: 50, default: DealStage.LEAD })
  stage: DealStage;

  @Column({ type: 'varchar', length: 20, default: DealPriority.MEDIUM })
  priority: DealPriority;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  contactId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Unassigned' })
  assignedTo: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  tags: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
