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

  @Column({ type: 'varchar', length: 500, nullable: true })
  externalAuthToken: string | null;

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
