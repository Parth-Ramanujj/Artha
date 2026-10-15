import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum ConversationStatus {
  OPEN = 'open',
  PENDING = 'pending',
  CLOSED = 'closed',
}

@Entity('conversations')
@Unique('UQ_conversations_session_chat', ['sessionId', 'chatId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'varchar', length: 100 })
  chatId: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  chatName: string | null;

  @Column({ type: 'varchar', length: 20, default: ConversationStatus.OPEN })
  status: ConversationStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedTo: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  assignedName: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  tags: string[] | null;

  @Column({ type: 'integer', default: 0 })
  unreadCount: number;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastMessageAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastInboundAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastMessagePreview: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
