import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** How an AI calling agent introduces itself, what it is after, and when it may call. */
@Entity('voice_agents')
export class VoiceAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** The name the agent uses on the call, e.g. "Pooja". */
  @Column({ type: 'varchar', length: 60 })
  personaName: string;

  @Column({ type: 'varchar', length: 120 })
  companyName: string;

  /** First sentence of every call; {name}, {persona} and {company} are filled in. */
  @Column({ type: 'text' })
  greeting: string;

  /** What the agent knows and is trying to achieve; written in plain language by the business. */
  @Column({ type: 'text' })
  script: string;

  /** When a call counts as a verified lead, in plain language. */
  @Column({ type: 'text' })
  verifiedLeadCriteria: string;

  /** Language the call opens in: 'gu-IN' or 'hi-IN'. The agent follows the customer after that. */
  @Column({ type: 'varchar', length: 10, default: 'gu-IN' })
  defaultLanguage: string;

  @Column({ type: 'varchar', length: 60, default: 'pooja_gu_customer' })
  gujaratiVoice: string;

  @Column({ type: 'varchar', length: 60, default: 'ritu_hi_customer_warm' })
  hindiVoice: string;

  /** Speaking speed, 0.8–1.3. */
  @Column({ type: 'float', default: 1 })
  pace: number;

  @Column({ type: 'varchar', length: 80, default: 'openai/gpt-oss-120b' })
  model: string;

  @Column({ type: 'integer', default: 300 })
  maxCallSeconds: number;

  /** Calls placed at the same time by this agent. Twilio trial accounts allow one. */
  @Column({ type: 'integer', default: 1 })
  concurrency: number;

  /** Attempts per number, counting the first; unanswered and busy calls are retried. */
  @Column({ type: 'integer', default: 2 })
  maxAttempts: number;

  @Column({ type: 'integer', default: 30 })
  retryAfterMinutes: number;

  /** Local calling window, "HH:MM", in callingTimezone. */
  @Column({ type: 'varchar', length: 5, default: '09:00' })
  callingStart: string;

  @Column({ type: 'varchar', length: 5, default: '21:00' })
  callingEnd: string;

  @Column({ type: 'varchar', length: 50, default: 'Asia/Kolkata' })
  callingTimezone: string;

  @Column({ type: 'boolean', default: false })
  whatsappFollowup: boolean;

  /** WhatsApp message to verified leads; {name}, {persona} and {company} are filled in. */
  @Column({ type: 'text', nullable: true })
  whatsappMessage: string | null;

  /** WhatsApp number (session) the follow-up is sent from; the first connected one when empty. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  whatsappSessionId: string | null;

  @Column({ type: 'boolean', default: true })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
