import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';
import type { WalletRates } from './wallet.entity';

/** From the `fromMessages`-th paid message in a calendar month (UTC), messages cost `discountPercent` less. */
export interface VolumeTier {
  fromMessages: number;
  discountPercent: number;
}

/** Platform-wide wallet settings, one row with id "global": the default price per message. */
@Entity('wallet_settings')
export class WalletSettings {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: jsonColumnType(), nullable: true })
  ratesPaise: WalletRates | null;

  @Column({ type: jsonColumnType(), nullable: true })
  volumeTiers: VolumeTier[] | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
