import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import type { Readiness, StudioContent, StudioKind } from '../studio-content';

export enum StudioMessageStatus {
  /** Being written; never sent by an automation. */
  DRAFT = 'draft',
  /** Checked and published: automations may send it. */
  READY = 'ready',
  ARCHIVED = 'archived',
}

/** What the last test send handed to WhatsApp. "submitted" means accepted by the API, not delivered. */
export interface StudioTestResult {
  at: string;
  sessionId: string;
  recipient: string;
  parts: Array<{ type: string; status: 'submitted' | 'failed'; messageId?: string; error?: string }>;
}

/** A reusable WhatsApp message built in Message Studio. */
@Entity('studio_messages')
export class StudioMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  kind: StudioKind;

  @Column({ type: 'varchar', length: 20, default: StudioMessageStatus.DRAFT })
  status: StudioMessageStatus;

  @Column({ type: jsonColumnType() })
  content: StudioContent;

  /** The preset it was started from, if any (e.g. "welcome"). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  presetKey: string | null;

  /** Readiness from the last save, for list badges; always recomputed before a send. */
  @Column({ type: 'varchar', length: 20, default: 'needs_attention' })
  readiness: Readiness;

  @Column({ type: jsonColumnType(), nullable: true })
  lastTest: StudioTestResult | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
