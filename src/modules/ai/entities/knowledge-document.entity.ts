import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 50 })
  fileType: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 20, default: DocumentStatus.READY })
  status: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uploadedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
