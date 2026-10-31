import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

/** One row per business: greetings, the owner's daily summary, voice-note actions and auto-STOP. */
@Entity('growth_settings')
export class GrowthSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** WhatsApp number that sends greetings and the summary. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', length: 60, default: 'Asia/Kolkata' })
  timezone: string;

  @Column({ type: 'boolean', default: false })
  summaryEnabled: boolean;

  @Column({ type: 'varchar', length: 20, default: '' })
  ownerPhone: string;

  /** HH:mm in `timezone`. */
  @Column({ type: 'varchar', length: 5, default: '20:00' })
  summaryTime: string;

  @Index()
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  summaryNextRunAt: Date | null;

  @Column({ type: 'text', nullable: true })
  summaryLastError: string | null;

  @Column({ type: 'boolean', default: false })
  greetingsEnabled: boolean;

  @Column({ type: 'varchar', length: 5, default: '09:00' })
  greetingTime: string;

  @Index()
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  greetingsNextRunAt: Date | null;

  @Column({ type: 'text', default: '' })
  birthdayText: string;

  @Column({ type: 'text', default: '' })
  anniversaryText: string;

  /** 0 turns win-back off. */
  @Column({ type: 'integer', default: 0 })
  winbackDays: number;

  @Column({ type: 'text', default: '' })
  winbackText: string;

  @Column({ type: 'integer', default: 50 })
  dailySendCap: number;

  @Column({ type: 'text', nullable: true })
  greetingsLastError: string | null;

  @Column({ type: 'boolean', default: false })
  voiceActionsEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  autoStopEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** A trackable click-to-chat link: QR code, website widget, or plain short link. */
@Entity('growth_links')
export class GrowthLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12 })
  ref: string;

  /** Digits only, with country code. */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  prefillText: string;

  @Column({ type: 'integer', default: 0 })
  scans: number;

  @Column({ type: 'integer', default: 0 })
  chats: number;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastScanAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type GreetingKind = 'birthday' | 'anniversary' | 'winback';

/** One sent greeting; the unique key is what stops a second send. */
@Entity('growth_greeting_log')
@Unique('UQ_growth_greeting', ['businessId', 'chatId', 'kind', 'periodKey'])
@Index(['businessId', 'createdAt'])
export class GrowthGreetingLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  chatId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 20 })
  kind: GreetingKind;

  @Column({ type: 'varchar', length: 40 })
  periodKey: string;

  @Column({ type: 'varchar', length: 10, default: 'sent' })
  status: 'sent' | 'failed' | 'skipped';

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
