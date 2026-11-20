import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/**
 * One step in the life of an official (Cloud API) WhatsApp message, or one webhook call from Meta:
 * the send request and Meta's answer, every status webhook, incoming messages, and webhooks that were
 * rejected or matched no number. Kept 7 days, so "why didn't it arrive?" has an answer.
 */
@Entity('whatsapp_events')
@Index('IDX_whatsapp_events_created', ['createdAt'])
@Index('IDX_whatsapp_events_session_created', ['sessionId', 'createdAt'])
export class WhatsAppEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null for webhooks that matched no connected number (or failed the signature check). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionId: string | null;

  /** send.accepted, send.rejected, webhook.received, webhook.rejected, webhook.unmatched, status.sent … */
  @Column({ type: 'varchar', length: 40 })
  kind: string;

  /** info | success | warning | error — drives the colour in the log. */
  @Column({ type: 'varchar', length: 10, default: 'info' })
  level: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  waMessageId: string | null;

  /** The other party's number (recipient of a send, sender of an incoming message). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 300 })
  summary: string;

  /** Trimmed request/response/payload for the details view. */
  @Column({ type: jsonColumnType(), nullable: true })
  details: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
