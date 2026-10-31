import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum AiCallStatus {
  QUEUED = 'queued',
  DIALING = 'dialing',
  RINGING = 'ringing',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  FAILED = 'failed',
  CANCELED = 'canceled',
  SKIPPED = 'skipped',
}

/** Statuses of a call that is still being placed or talked on. */
export const ACTIVE_CALL_STATUSES = [AiCallStatus.DIALING, AiCallStatus.RINGING, AiCallStatus.IN_PROGRESS];

export enum AiCallOutcome {
  INTERESTED = 'interested',
  CALLBACK = 'callback',
  NOT_INTERESTED = 'not_interested',
  WRONG_NUMBER = 'wrong_number',
  DO_NOT_CALL = 'do_not_call',
  NO_CONVERSATION = 'no_conversation',
}

export type AiCallSentiment = 'positive' | 'neutral' | 'negative';

export interface TranscriptTurn {
  role: 'agent' | 'customer';
  text: string;
  at: string;
  language?: string;
  interrupted?: boolean;
  /** Agent turns: the voice tone the model chose (see VOICE_TONES). */
  tone?: string;
}

export interface CallExtraction {
  name?: string | null;
  interest?: 'insurance' | 'mutual_fund' | 'claim_support' | 'general' | null;
  need?: string | null;
  pincode?: string | null;
  city?: string | null;
  callbackTime?: string | null;
  notes?: string | null;
}

/** One AI phone call: queue entry, live state and, once over, the call log. */
@Entity('ai_calls')
@Index(['businessId', 'createdAt'])
@Index(['businessId', 'status'])
export class AiCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  agentId: string;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  batchId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  leadId: string | null;

  /** E.164, e.g. +919876543210; "browser" for a dashboard test call. */
  @Index()
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contactName: string | null;

  /** 'phone' (Twilio) or 'browser' (dashboard test call). */
  @Column({ type: 'varchar', length: 10, default: 'phone' })
  channel: string;

  /** Optional opening line for this call only; the agent's greeting otherwise. */
  @Column({ type: 'text', nullable: true })
  greeting: string | null;

  /** Optional background for this call only (why we are calling), added to the agent's prompt. */
  @Column({ type: 'text', nullable: true })
  briefing: string | null;

  @Column({ type: 'varchar', length: 20, default: AiCallStatus.QUEUED })
  status: AiCallStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  nextAttemptAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  twilioCallSid: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  startedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  answeredAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  endedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  durationSeconds: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  transcript: TranscriptTurn[] | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  sentiment: AiCallSentiment | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome: AiCallOutcome | null;

  @Column({ type: jsonColumnType(), nullable: true })
  extracted: CallExtraction | null;

  @Index()
  @Column({ type: 'boolean', default: false })
  isVerifiedLead: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  leadTemperature: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  whatsappSentAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
