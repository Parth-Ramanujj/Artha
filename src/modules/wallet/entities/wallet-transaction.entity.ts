import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type WalletTxType = 'recharge' | 'charge' | 'adjustment';
export type WalletTxStatus = 'pending' | 'success' | 'failed';

/**
 * One movement of money in a wallet. `reference` is unique per type so the same Razorpay order or the
 * same WhatsApp message can never be credited or charged twice, even if a webhook repeats.
 */
@Entity('wallet_transactions')
@Index('UQ_wallet_tx_type_reference', ['type', 'reference'], { unique: true })
@Index('IDX_wallet_tx_business_created', ['businessId', 'createdAt'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 20 })
  type: WalletTxType;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status: WalletTxStatus;

  /** Signed: + money in (recharge, credit), − money out (message charge, debit). */
  @Column({ type: 'integer' })
  amountPaise: number;

  /** Balance right after this transaction was applied (null while pending). */
  @Column({ type: 'integer', nullable: true })
  balanceAfterPaise: number | null;

  @Column({ type: 'varchar', length: 300 })
  description: string;

  /** Razorpay order id, "msg:<session>:<wamid>", or "adj:<uuid>". */
  @Column({ type: 'varchar', length: 200 })
  reference: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpayPaymentId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
