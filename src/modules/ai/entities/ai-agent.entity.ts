import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export enum AgentStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DRAFT = 'draft',
}

@Entity('ai_agents')
export class AiAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, default: 'Customer Support' })
  role: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, default: 'llama-3.3-70b-versatile' })
  model: string;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ type: 'varchar', length: 255, default: '🤖' })
  avatar: string;

  @Column({ type: 'varchar', length: 20, default: AgentStatus.ACTIVE })
  status: AgentStatus;

  @Column({ type: 'integer', default: 0 })
  conversationsHandled: number;

  @Column({ type: 'integer', default: 95 })
  resolutionRate: number;

  @Column({ type: 'boolean', default: false })
  isExternal: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  externalWebhookUrl: string | null;

  /** Authorization header value for the external webhook, e.g. "Bearer …"; never returned by the API. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  externalAuthToken: string | null;

  /** flowise, n8n, dify, langchain, botpress or custom: decides the request body shape. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  externalPlatform: string | null;

  /** Dot path to the reply text in the external webhook's JSON response, e.g. "output.text". */
  @Column({ type: 'varchar', length: 200, nullable: true })
  responseJsonPath: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  externalStatus: string | null;

  @Column({ type: 'integer', nullable: true })
  lastPingMs: number | null;

  @Column({ type: 'float', default: 0.5 })
  temperature: number;

  /** Words that route a chat to this agent; empty means it answers any chat no other agent claims. */
  @Column({ type: jsonColumnType(), nullable: true })
  triggerKeywords: string[] | null;

  /** WhatsApp session it answers on; null means every number of the business. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  /** Replies to customers on its own; off means it can only be tried in the test chat. */
  @Column({ type: 'boolean', default: false })
  autonomous: boolean;

  @Column({ type: 'boolean', default: false })
  isVoiceEnabled: boolean;

  @Column({ type: jsonColumnType(), nullable: true })
  voiceConfig: {
    language?: string;
    voiceName?: string;
    speed?: number;
    pitch?: number;
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
