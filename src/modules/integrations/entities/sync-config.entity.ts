import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export enum SyncProvider {
  GOOGLE_SHEETS = 'google_sheets',
  ZOHO_CRM = 'zoho_crm',
  HUBSPOT = 'hubspot',
  SALESFORCE = 'salesforce',
}

export enum SyncDirection {
  PUSH = 'push',
  PULL = 'pull',
  BIDIRECTIONAL = 'bidirectional',
}

export enum SyncStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
}

@Entity('sync_configs')
export class SyncConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 30 })
  provider: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: SyncDirection.PUSH })
  direction: string;

  @Column({ type: 'varchar', length: 20, default: SyncStatus.PAUSED })
  status: string;

  @Column({ type: jsonColumnType(), nullable: true })
  config: Record<string, unknown> | null;

  @Column({ type: jsonColumnType(), nullable: true })
  fieldMapping: Record<string, string> | null;

  @Column({ type: 'varchar', length: 30, default: 'contacts' })
  dataType: string;

  @Column({ type: 'integer', default: 0 })
  syncedCount: number;

  @Column({ type: 'integer', default: 0 })
  errorCount: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastSyncAt: Date | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
