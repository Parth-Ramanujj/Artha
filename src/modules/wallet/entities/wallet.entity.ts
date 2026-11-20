import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/** Per-message prices a customer pays, in paise (₹1 = 100 paise). */
export type WalletRates = Record<'marketing' | 'utility' | 'authentication' | 'service', number>;

/**
 * A customer business's prepaid balance for WhatsApp messages. Money is kept in integer paise so
 * repeated charges never drift the way floating-point rupees would.
 */
@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** Billing switched on by the super admin; off means messages are never charged here. */
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  balancePaise: number;

  /** Stop campaigns and one-off template sends when the balance cannot cover the next message. */
  @Column({ type: 'boolean', default: true })
  blockWhenEmpty: boolean;

  /** Notify the customer when the balance drops below this (paise). */
  @Column({ type: 'integer', default: 10_000 })
  lowBalanceAlertPaise: number;

  /** Set when the low-balance alert fired; cleared on recharge so it fires once per dip. */
  @Column({ type: 'boolean', default: false })
  lowBalanceAlerted: boolean;

  /** Customer-specific prices; null = the platform's default rates. */
  @Column({ type: jsonColumnType(), nullable: true })
  ratesPaise: WalletRates | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
