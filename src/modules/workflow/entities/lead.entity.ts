import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum LeadStatus {
  NEW = 'new',
  QUALIFIED = 'qualified',
  ASSIGNED = 'assigned',
  CONTACTED = 'contacted',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
  UNASSIGNED = 'unassigned',
}

@Entity('workflow_leads')
@Index(['businessId', 'chatId'])
@Index(['businessId', 'status'])
@Index(['businessId', 'pincode'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  leadNumber: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', length: 100 })
  chatId: string;

  @Column({ type: 'varchar', length: 30 })
  customerPhone: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', length: 50 })
  mainService: string; // 'insurance' | 'mutual_fund'

  @Column({ type: 'varchar', length: 100 })
  selectedService: string; // 'buy_new' | 'port' | 'renew' | 'claim_support' | 'insurance_audit' | 'sip' | 'lumpsum' etc.

  @Column({ type: 'varchar', length: 100, nullable: true })
  productCategory: string | null; // 'life_insurance' | 'health_insurance' | 'motor_insurance' | 'sme_insurance'

  @Column({ type: 'varchar', length: 150, nullable: true })
  subProduct: string | null; // 'term_insurance' | 'family_floater' | 'car_insurance' etc.

  @Column({ type: 'varchar', length: 100, nullable: true })
  claimIssueType: string | null; // 'rejected' | 'short_settled' | 'delayed' | 'misselling'

  @Column({ type: 'varchar', length: 200, nullable: true })
  insuranceCompany: string | null;

  @Column({ type: 'text', nullable: true })
  issueDescription: string | null;

  @Column({ type: 'varchar', length: 10 })
  pincode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  matchedAgentId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  matchedAgentName: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  matchedAgentPhone: string | null;

  @Column({ type: 'varchar', length: 30, default: LeadStatus.QUALIFIED })
  status: LeadStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  workflowId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  conversationId: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  contactedAt: Date | null;

  @CreateDateColumn({ transformer: DateTransformer })
  createdAt: Date;

  @UpdateDateColumn({ transformer: DateTransformer })
  updatedAt: Date;
}
