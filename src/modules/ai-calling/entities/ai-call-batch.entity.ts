import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AiCallBatchStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
}

/** A list of numbers called by one agent, from an uploaded sheet or from selected leads. */
@Entity('ai_call_batches')
export class AiCallBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  agentId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** 'upload' or 'leads'. */
  @Column({ type: 'varchar', length: 10, default: 'upload' })
  source: string;

  @Column({ type: 'varchar', length: 12, default: AiCallBatchStatus.RUNNING })
  status: AiCallBatchStatus;

  @Column({ type: 'integer', default: 0 })
  totalContacts: number;

  /** Send the agent's WhatsApp message to verified leads from this batch. */
  @Column({ type: 'boolean', default: false })
  sendWhatsapp: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
