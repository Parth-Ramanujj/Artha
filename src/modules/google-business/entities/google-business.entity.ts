import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export interface GbpLocation {
  /** accounts/{a}/locations/{l} */
  name: string;
  title: string;
  address: string;
  /** Google's "write a review" link for this place. */
  reviewUrl: string;
  mapsUrl: string;
  averageRating?: number;
  totalReviewCount?: number;
}

/** One Google Business Profile automation per business. */
@Entity('gbp_configs')
export class GbpConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** Turns the background sync (and with it auto drafts, auto replies and alerts) on. */
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** A google_business integration. */
  @Column({ type: 'varchar', length: 36, default: '' })
  integrationId: string;

  /** accounts/{a} */
  @Column({ type: 'varchar', length: 100, default: '' })
  accountName: string;

  @Column({ type: jsonColumnType() })
  locations: GbpLocation[];

  /** Draft an AI reply for every new review. */
  @Column({ type: 'boolean', default: true })
  autoDraft: boolean;

  /** Reviews with at least this many stars are answered without approval. 0 = always wait for approval. */
  @Column({ type: 'integer', default: 0 })
  autoPublishMinStars: number;

  /** Only auto-publish when the review has written text too (a bare star rating gets a short thank-you). */
  @Column({ type: 'boolean', default: false })
  autoPublishRequiresText: boolean;

  @Column({ type: 'varchar', length: 200, default: '' })
  tone: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  signature: string;

  /** Facts the AI may use: what the business does, how unhappy customers can reach the owner. */
  @Column({ type: 'text', default: '' })
  instructions: string;

  /** WhatsApp alert for low ratings: sent from this session to this number. */
  @Column({ type: 'varchar', length: 100, default: '' })
  alertSessionId: string;

  @Column({ type: 'varchar', length: 20, default: '' })
  alertPhone: string;

  /** Reviews at or below this many stars trigger the alert. 0 = no alerts. */
  @Column({ type: 'integer', default: 3 })
  alertMaxStars: number;

  @Column({ type: 'integer', default: 30 })
  syncMinutes: number;

  /** Message sent when asking customers for a review; {name} and {link} are filled in. */
  @Column({ type: 'text', default: '' })
  reviewRequestTemplate: string;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastSyncAt: Date | null;

  @Column({ type: 'text', default: '' })
  lastError: string;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * new: not answered, no draft yet · pending_review: draft waiting for a person · replied: answer is live
 * on Google · failed: publishing failed · skipped: a person chose not to answer.
 */
export type GbpReviewStatus = 'new' | 'pending_review' | 'replied' | 'failed' | 'skipped';

/** A Google review, mirrored so drafts, approvals and stats work without calling Google each time. */
@Entity('gbp_reviews')
@Index(['businessId', 'reviewName'], { unique: true })
@Index(['businessId', 'status'])
export class GbpReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** accounts/{a}/locations/{l}/reviews/{r} */
  @Column({ type: 'varchar', length: 300 })
  reviewName: string;

  @Column({ type: 'varchar', length: 200 })
  locationName: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  locationTitle: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  reviewerName: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  reviewerPhoto: string;

  /** 1–5; 0 when Google did not say. */
  @Column({ type: 'integer', default: 0 })
  stars: number;

  @Column({ type: 'text', default: '' })
  comment: string;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  reviewedAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  reviewUpdatedAt: Date | null;

  /** The answer live on Google. */
  @Column({ type: 'text', default: '' })
  replyText: string;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  repliedAt: Date | null;

  /** Who sent the live answer: a dashboard user, 'autopilot', or 'google' (answered outside this app). */
  @Column({ type: 'varchar', length: 100, default: '' })
  repliedBy: string;

  @Column({ type: 'text', default: '' })
  draft: string;

  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: GbpReviewStatus;

  @Column({ type: 'text', default: '' })
  error: string;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  alertedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
