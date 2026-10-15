import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('advisor_alert_configs')
@Index(['businessId', 'sessionId', 'advisorChatId'], { unique: true })
export class AdvisorAlertConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @Column({ type: 'varchar', length: 100 })
  advisorChatId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  advisorName: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
