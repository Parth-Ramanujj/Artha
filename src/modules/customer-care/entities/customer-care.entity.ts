import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export interface MissedCallSettings {
  enabled: boolean;
  /** WhatsApp session to message from; '' = any connected one of this business. */
  sessionId: string;
  /** WhatsApp text; {name} and {owner} are filled in. */
  message: string;
  /** Also follow up WhatsApp calls nobody picked up (phone call logs arrive through the API). */
  includeWhatsappCalls: boolean;
  /** Call with the AI agent when the WhatsApp message gets no reply. */
  callOnNoReply: boolean;
  waitMinutes: number;
  /** Voice agent for the call; '' = the default one. */
  voiceAgentId: string;
  /** What the AI says first; {name} and {owner} are filled in. */
  callGreeting: string;
}

export interface AssistantSettings {
  enabled: boolean;
  /** Only offer on this session; '' = all sessions of this business. */
  sessionId: string;
  /** Sent with the link appended on its own line. */
  message: string;
  /** Do not offer the same chat again within this many hours. */
  cooldownHours: number;
  /** Extra instructions for the web assistant. */
  instructions: string;
  /** What the voice assistant says first; {name} and {owner} are filled in. */
  voiceGreeting: string;
}

/** One row per business: settings for the missed-call follow-up and the AI assistant link. */
@Entity('customer_care_settings')
export class CustomerCareSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** The person or business the AI speaks for ({owner}). */
  @Column({ type: 'varchar', length: 120, default: '' })
  ownerName: string;

  @Column({ type: jsonColumnType() })
  missedCall: MissedCallSettings;

  @Column({ type: jsonColumnType() })
  assistant: AssistantSettings;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * new → messaged (WhatsApp sent) → replied (they answered, done) or called (AI call queued).
 * skipped = recently followed up / opted out; failed = see error.
 */
export type MissedCallStatus = 'new' | 'messaged' | 'replied' | 'called' | 'skipped' | 'failed';

@Entity('missed_calls')
@Index(['businessId', 'createdAt'])
@Index(['status', 'callDueAt'])
export class MissedCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** E.164, e.g. +919876543210. */
  @Index()
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  /** 'phone' (reported from a phone's call log) or 'whatsapp'. */
  @Column({ type: 'varchar', length: 20, default: 'phone' })
  source: string;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: MissedCallStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  messagedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  callDueAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  repliedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  aiCallId: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

/** A private link to the web AI assistant, bound to the WhatsApp chat it was offered in. */
@Entity('assistant_links')
@Index(['sessionId', 'chatId'])
export class AssistantLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'varchar', length: 120 })
  chatId: string;

  /** E.164 when known. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: jsonColumnType() })
  transcript: AssistantTurn[];

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
