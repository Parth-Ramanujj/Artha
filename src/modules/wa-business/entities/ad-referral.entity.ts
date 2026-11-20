import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

/** A customer who opened a chat from a Click-to-WhatsApp ad (Meta's `referral` on the first message). */
@Entity('ad_referrals')
@Index('IDX_ad_referrals_session_created', ['sessionId', 'createdAt'])
export class AdReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  sessionId: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  customerName: string | null;

  /** ad | post */
  @Column({ type: 'varchar', length: 16 })
  sourceType: string;

  /** The ad id in Meta Ads Manager. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  headline: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  firstMessage: string | null;

  /** Click id for Meta's Conversions API. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  ctwaClid: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
