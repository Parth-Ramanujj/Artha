import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/** One customer's answers to a WhatsApp Form, recorded when their submission arrives. */
@Entity('whatsapp_form_submissions')
@Index(['formId'])
@Index(['businessId'])
export class WhatsAppFormSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36 })
  formId: string;

  @Column({ type: 'varchar', length: 64 })
  sessionId: string;

  @Column({ type: 'varchar', length: 120 })
  chatId: string;

  /** The WhatsApp message id of the submission. Unique, so a webhook Meta redelivers is stored once. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200 })
  messageId: string;

  @Column({ type: 'varchar', length: 120 })
  flowToken: string;

  @Column({ type: jsonColumnType() })
  answers: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
