import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

/** Per-business message-cost settings: the monthly budget and when its alert last fired. */
@Entity('message_cost_settings')
export class MessageCostSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** Monthly budget in INR; null = no budget. */
  @Column({ type: 'float', nullable: true })
  monthlyBudgetInr: number | null;

  /** "YYYY-MM" of the last month a budget alert was sent, so it fires once per month. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  alertedMonth: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
