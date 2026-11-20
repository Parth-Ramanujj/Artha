import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

/** One WhatsApp voice call on an official number (from Meta's `calls` webhook). */
@Entity('wa_calls')
@Index('IDX_wa_calls_session_created', ['sessionId', 'createdAt'])
export class WaCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  sessionId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 191 })
  callId: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  /** USER_INITIATED | BUSINESS_INITIATED */
  @Column({ type: 'varchar', length: 24 })
  direction: string;

  /** ringing | completed | missed | failed */
  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'int', default: 0 })
  durationSec: number;

  @CreateDateColumn()
  createdAt: Date;
}
