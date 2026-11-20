import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';
import type { WalletRates } from './wallet.entity';

/** Platform-wide wallet settings, one row with id "global": the default price per message. */
@Entity('wallet_settings')
export class WalletSettings {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: jsonColumnType(), nullable: true })
  ratesPaise: WalletRates | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
