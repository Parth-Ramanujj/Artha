import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/** A new template to send to the test phone once Meta approves it (only inside the free 24h window). */
export interface TemplateAutoTest {
  sessionId: string;
  name: string;
  language: string;
  phone: string;
  /** waiting → sent | not_sent (window closed / would cost money) | rejected | expired */
  state: 'waiting' | 'sent' | 'not_sent' | 'rejected' | 'expired';
  /** Plain-language outcome shown in the dashboard. */
  note?: string;
  createdAt: string;
  doneAt?: string;
}

/** Per-business Message Studio settings. */
@Entity('studio_settings')
export class StudioSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** Meta commerce catalog connected to the WhatsApp Business account (for product messages). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  metaCatalogId: string | null;

  /** Phone (digits with country code) that gets a copy of each newly approved template. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  testPhone: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  autoTests: TemplateAutoTest[] | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
