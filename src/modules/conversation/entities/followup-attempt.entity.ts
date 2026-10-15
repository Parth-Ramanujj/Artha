import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

@Entity('followup_attempts')
@Index(['ruleId', 'conversationId'])
export class FollowupAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  ruleId: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'varchar', length: 100 })
  chatId: string;

  @Column({ type: dateColumnType(), transformer: DateTransformer })
  sentAt: Date;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  recoveredAt: Date | null;
}
