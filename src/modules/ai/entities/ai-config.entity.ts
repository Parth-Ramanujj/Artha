import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export enum AiProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GROQ = 'groq',
  CUSTOM = 'custom',
}

@Entity('ai_configs')
@Unique('UQ_ai_config_business', ['businessId'])
export class AiConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 30, default: AiProvider.OPENAI })
  provider: AiProvider;

  @Column({ type: 'varchar', length: 200, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  apiEndpoint: string | null;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ type: 'integer', default: 2000 })
  maxTokens: number;

  @Column({ type: 'integer', default: 10 })
  maxContextMessages: number;

  @Column({ type: 'boolean', default: true })
  useKnowledgeBase: boolean;

  @Column({ type: 'boolean', default: true })
  autoHandoff: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  handoffKeywords: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fallbackMessage: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  sessionScopes: string[] | null;

  @Column({ type: jsonColumnType(), nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
