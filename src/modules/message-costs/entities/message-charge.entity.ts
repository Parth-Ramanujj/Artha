import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * One outgoing WhatsApp Cloud API message and what Meta says it costs. Filled from the `pricing`
 * block Meta puts on message status webhooks (billable, category, type); a campaign send writes the
 * row first so the status can be tied back to the campaign and its recipient.
 */
@Entity('message_charges')
@Index('UQ_message_charges_session_wamid', ['sessionId', 'waMessageId'], { unique: true })
@Index('IDX_message_charges_session_created', ['sessionId', 'createdAt'])
export class MessageCharge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  sessionId: string;

  @Column({ type: 'varchar', length: 128 })
  waMessageId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  chatId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  campaignId: string | null;

  /** campaign | template_send | auto_test | other */
  @Column({ type: 'varchar', length: 20, default: 'other' })
  source: string;

  /** Meta pricing category: marketing, utility, authentication, service … (null until Meta reports it) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  category: string | null;

  /** Meta pricing type: regular, free_customer_service, free_entry_point … */
  @Column({ type: 'varchar', length: 40, nullable: true })
  pricingType: string | null;

  @Column({ type: 'boolean', nullable: true })
  billable: boolean | null;

  /** sent | delivered | read | failed */
  @Column({ type: 'varchar', length: 20, default: 'sent' })
  status: string;

  @Column({ type: 'integer', nullable: true })
  errorCode: number | null;

  /** Meta's error text for a failed message (title, plus details when Meta gives them). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  errorTitle: string | null;

  /** Estimated cost in INR from our rate table (0 when Meta says it is not billable). */
  @Column({ type: 'float', default: 0 })
  estimatedInr: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
