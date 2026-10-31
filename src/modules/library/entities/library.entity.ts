import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export type LibraryItemType = 'text' | 'image' | 'video';

export interface LibrarySchedule {
  kind: 'once' | 'daily' | 'weekly';
  /** ISO instant, for `once`. */
  at?: string;
  /** HH:mm wall-clock time in `timezone`, for daily/weekly. */
  time?: string;
  /** 0 = Sunday … 6 = Saturday, for weekly. */
  days?: number[];
  timezone: string;
}

/** One reusable post: text, or an image/video with a caption. Media lives in storage, never in the row. */
@Entity('library_items')
export class LibraryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  category: string;

  @Column({ type: jsonColumnType() })
  tags: string[];

  @Column({ type: 'varchar', length: 10, default: 'text' })
  type: LibraryItemType;

  /** Message text, or the caption for media. */
  @Column({ type: 'text', default: '' })
  text: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  mediaPath: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mediaMimetype: string | null;

  @Column({ type: 'integer', default: 0 })
  useCount: number;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Posts library items on a schedule: to WhatsApp Status and/or straight to chats. With several items
 * it rotates, one item per run, so a pool of posts becomes a daily/weekly content calendar.
 */
@Entity('library_automations')
export class LibraryAutomation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: jsonColumnType() })
  itemIds: string[];

  /** Index into itemIds of the item the next run posts. */
  @Column({ type: 'integer', default: 0 })
  cursor: number;

  @Column({ type: 'boolean', default: false })
  postToStatus: boolean;

  @Column({ type: jsonColumnType() })
  chatIds: string[];

  @Column({ type: jsonColumnType() })
  schedule: LibrarySchedule;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Index()
  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  nextRunAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastRunAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'integer', default: 0 })
  runCount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** One delivery attempt of one item (a scheduled run or a manual "post now"). */
@Entity('library_runs')
@Index(['businessId', 'createdAt'])
export class LibraryRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  automationId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  itemId: string | null;

  @Column({ type: 'varchar', length: 200, default: '' })
  itemTitle: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'boolean', default: false })
  postedToStatus: boolean;

  @Column({ type: 'integer', default: 0 })
  sent: number;

  @Column({ type: 'integer', default: 0 })
  failed: number;

  @Column({ type: 'integer', default: 0 })
  skipped: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
