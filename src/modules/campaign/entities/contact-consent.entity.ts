import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { dateColumnType } from '../../../common/utils/column-types';

export enum ConsentStatus {
  OPTED_IN = 'opted_in',
  OPTED_OUT = 'opted_out',
  UNKNOWN = 'unknown',
}

@Entity('contact_consents')
@Unique('UQ_consent_business_contact_channel', ['businessId', 'waContactId', 'channel'])
export class ContactConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  waContactId: string;

  @Column({ type: 'varchar', length: 50, default: 'whatsapp' })
  channel: string;

  @Column({ type: 'varchar', length: 20, default: ConsentStatus.UNKNOWN })
  status: ConsentStatus;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  consentedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  source: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
