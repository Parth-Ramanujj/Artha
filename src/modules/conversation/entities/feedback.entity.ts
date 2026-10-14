import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  chatId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  agentName: string | null;

  @Column({ type: 'integer', default: 0 })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  tags: string[] | null;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
