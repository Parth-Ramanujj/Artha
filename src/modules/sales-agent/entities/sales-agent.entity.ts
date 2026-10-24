import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export type SalesChannelName = 'whatsapp' | 'email';

export interface SalesPersona {
  name: string;
  company: string;
  role: string;
  tone: string;
  website: string;
}

export interface SalesProduct {
  name: string;
  description: string;
  pricing: string;
  benefits: string[];
  /** What a "yes" looks like: book_call, start_trial, reply. */
  goal: string;
  bookingUrl: string;
  /** Owner-written answers to common objections, keyed by a short trigger word. */
  objectionResponses: Record<string, string>;
}

export interface SalesIcp {
  industries: string[];
  titles: string[];
  geography: string[];
}

export interface SalesWhatsAppSettings {
  enabled: boolean;
  sessionId: string;
  maxDailySends: number;
  optOutLine: string;
  /** Prepended to local numbers from listings, e.g. 91. */
  defaultCountryCode: string;
}

export interface SalesEmailSettings {
  enabled: boolean;
  /** An EMAIL_SMTP integration; its login is also used for IMAP reply reading. */
  integrationId: string;
  imapHost: string;
  imapPort: number;
  maxDailySends: number;
  optOutLine: string;
  postalAddress: string;
}

export interface SalesSchedule {
  heartbeatMinutes: number;
  quietStart: string;
  quietEnd: string;
  timezone: string;
}

/** One sales agent per business: who it is, what it sells, who to, and over which channels. */
@Entity('sales_agent_configs')
export class SalesAgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** Every outgoing message waits in the outbox for a human unless this is off (autopilot). */
  @Column({ type: 'boolean', default: true })
  requireApproval: boolean;

  /** Kill switch: nothing leaves the outbox while set. */
  @Column({ type: 'boolean', default: false })
  sendingPaused: boolean;

  @Column({ type: jsonColumnType() })
  persona: SalesPersona;

  @Column({ type: jsonColumnType() })
  product: SalesProduct;

  @Column({ type: jsonColumnType() })
  icp: SalesIcp;

  @Column({ type: jsonColumnType() })
  whatsapp: SalesWhatsAppSettings;

  @Column({ type: jsonColumnType() })
  email: SalesEmailSettings;

  @Column({ type: jsonColumnType() })
  schedule: SalesSchedule;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastCycleAt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}

export interface CompanySignal {
  code: string;
  detail: string;
}

@Entity('sales_agent_companies')
@Index(['businessId'])
export class SalesCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  domain: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  website: string;

  @Column({ type: 'varchar', length: 40, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  industry: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  location: string;

  /** e.g. `osm:node/123`; dedupes repeat discovery runs. */
  @Column({ type: 'varchar', length: 100, default: '' })
  externalId: string;

  @Column({ type: jsonColumnType() })
  signals: CompanySignal[];

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  profiledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

export type ProspectStatus = 'new' | 'queued' | 'contacted' | 'replied' | 'lost' | 'opted_out' | 'write_failed';

@Entity('sales_agent_prospects')
@Index(['businessId', 'status'])
export class SalesProspect {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 200, default: '' })
  name: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  companyName: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  title: string;

  /** Digits only, with country code. */
  @Column({ type: 'varchar', length: 20, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  email: string;

  /** Chosen when the first message is written; replies come back on the same channel. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  channel: SalesChannelName | null;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: ProspectStatus;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ type: 'varchar', length: 40, default: 'manual' })
  source: string;

  @Column({ type: 'int', default: 0 })
  writeAttempts: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type OutboxStatus = 'pending_review' | 'approved' | 'sending' | 'sent' | 'rejected' | 'cancelled' | 'failed';

@Entity('sales_agent_outbox')
@Index(['businessId', 'status'])
@Index(['prospectId'])
export class SalesOutboxItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  prospectId: string;

  @Column({ type: 'varchar', length: 20 })
  channel: SalesChannelName;

  /** `sequence` = cold outreach step, `reply` = answer to the prospect. */
  @Column({ type: 'varchar', length: 20, default: 'sequence' })
  kind: 'sequence' | 'reply';

  @Column({ type: 'int', default: 1 })
  step: number;

  @Column({ type: 'varchar', length: 200, default: '' })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 20 })
  status: OutboxStatus;

  @Column({ type: dateColumnType(), transformer: DateTransformer })
  sendAt: Date;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  sentAt: Date | null;

  @Column({ type: 'varchar', length: 300, default: '' })
  providerMessageId: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  inReplyTo: string;

  @Column({ type: 'text', default: '' })
  error: string;

  /** `you` | `autopilot` | '' */
  @Column({ type: 'varchar', length: 20, default: '' })
  approvedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export interface ThreadEntry {
  from: 'agent' | 'prospect';
  text: string;
  at: string;
  /** Inbound WhatsApp message id / email Message-ID, so a redelivery is handled once. */
  ref?: string;
}

export type ConversationStage =
  | 'initial_outreach'
  | 'engaged'
  | 'qualifying'
  | 'presenting'
  | 'negotiating'
  | 'closing'
  | 'closed_won'
  | 'closed_lost';

@Entity('sales_agent_conversations')
@Index(['businessId', 'status'])
export class SalesConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  prospectId: string;

  @Column({ type: 'varchar', length: 20 })
  channel: SalesChannelName;

  @Column({ type: jsonColumnType() })
  thread: ThreadEntry[];

  @Column({ type: 'varchar', length: 30, default: '' })
  intent: string;

  @Column({ type: 'varchar', length: 30, default: 'initial_outreach' })
  stage: ConversationStage;

  /** open = the agent handles it, needs_human = handed back, closed = done. */
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: 'open' | 'needs_human' | 'closed';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('sales_agent_activity')
@Index(['businessId', 'createdAt'])
export class SalesActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: jsonColumnType() })
  details: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
