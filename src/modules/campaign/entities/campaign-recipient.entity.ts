import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, Unique } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { dateColumnType } from '../../../common/utils/column-types';

export enum RecipientStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity('campaign_recipients')
@Unique('UQ_campaign_recipient', ['campaignId', 'chatId'])
export class CampaignRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  campaignId: string;

  @Column({ type: 'varchar', length: 200 })
  chatId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', length: 20, default: RecipientStatus.PENDING })
  status: RecipientStatus;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  sentAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  deliveredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
