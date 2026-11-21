import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export type SocialPlatform = 'instagram' | 'facebook' | 'telegram' | 'youtube';
export type SocialPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type SocialMediaType = 'IMAGE' | 'VIDEO';
export type RuleMatchType = 'contains' | 'exact' | 'regex' | 'all';
export type CommentLogStatus = 'success' | 'failed' | 'ignored';
export type RuleAppliesTo = 'comments' | 'dms' | 'both';

/** Connected Instagram / Facebook Page Account */
@Entity('social_accounts')
@Index(['businessId'])
@Index(['accountId'])
export class SocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 20 })
  platform: SocialPlatform;

  @Column({ type: 'varchar', length: 150 })
  accountName: string;

  /** Instagram Business Account ID or Facebook Page ID */
  @Column({ type: 'varchar', length: 100 })
  accountId: string;

  /** Long-lived Page Access Token. Never returned by the API (select: false). */
  @Column({ type: 'text', select: false })
  accessToken: string;

  /** Associated Facebook Page ID (required for Instagram Graph API) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  pageId: string | null;

  /** Custom webhook verification token configured in Meta developer portal */
  @Column({ type: 'varchar', length: 150, nullable: true })
  webhookVerifyToken: string | null;

  /** The business's AI chatbot answers DMs on this account that no rule answered. */
  @Column({ type: 'boolean', default: false })
  aiAutoReply: boolean;

  @Column({ type: 'varchar', length: 20, default: 'connected' })
  status: 'connected' | 'disconnected';

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  tokenExpiresAt: Date | null;

  /** Extra profile metadata, e.g. profile picture, follower count */
  @Column({ type: 'text', default: '{}' })
  metadata: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Automated / Scheduled Social Post */
@Entity('social_posts')
@Index(['businessId'])
@Index(['status', 'scheduledAt'])
export class SocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  accountId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'instagram' })
  platform: SocialPlatform;

  @Column({ type: 'text' })
  caption: string;

  /** Publicly accessible URL for image or video */
  @Column({ type: 'text' })
  mediaUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'IMAGE' })
  mediaType: SocialMediaType;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: SocialPostStatus;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  scheduledAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  publishedAt: Date | null;

  /** ID returned by Meta after successful publication */
  @Column({ type: 'varchar', length: 100, nullable: true })
  remotePostId: string | null;

  /** Public URL to the post on Instagram or Facebook */
  @Column({ type: 'text', nullable: true })
  permalink: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Rules for automatically replying to and liking comments */
@Entity('social_comment_rules')
@Index(['businessId'])
export class SocialCommentRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'all' })
  platform: 'all' | SocialPlatform;

  /** Specific post ID to target, or null for all posts */
  @Column({ type: 'varchar', length: 100, nullable: true })
  postId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'contains' })
  matchType: RuleMatchType;

  /** JSON array of keywords, e.g. ["price", "cost", "dm", "link"] */
  @Column({ type: 'text', default: '[]' })
  keywords: string;

  /** JSON array of reply variations to rotate randomly and avoid spam detection */
  @Column({ type: 'text', default: '[]' })
  replyTemplates: string;

  /** Whether to automatically hit like on matching comments */
  @Column({ type: 'boolean', default: true })
  autoLike: boolean;

  /** Whether to also send an automated private direct message (DM) */
  @Column({ type: 'boolean', default: false })
  autoDm: boolean;

  @Column({ type: 'text', nullable: true })
  autoDmTemplate: string | null;

  /** Whether to use AI (OpenAI / Gemini) to craft dynamic, human-like replies */
  @Column({ type: 'boolean', default: false })
  useAi: boolean;

  /** Custom AI prompt or persona instructions for comment replies */
  @Column({ type: 'text', nullable: true })
  aiPrompt: string | null;

  /** Delay in seconds before replying (anti-spam measure, recommended: 2-5s) */
  @Column({ type: 'integer', default: 3 })
  delaySeconds: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** What the rule answers: post comments, Instagram/Facebook DMs, or both. */
  @Column({ type: 'varchar', length: 20, default: 'comments' })
  appliesTo: RuleAppliesTo;

  @Column({ type: 'integer', default: 0 })
  triggerCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Activity logs of processed comments, auto-likes and auto-replies */
@Entity('social_comment_logs')
@Index(['businessId', 'createdAt'])
@Index(['businessId', 'commentId'], { unique: true })
export class SocialCommentLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 20 })
  platform: SocialPlatform;

  @Column({ type: 'varchar', length: 100 })
  postId: string;

  @Column({ type: 'varchar', length: 100 })
  commentId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fromUserId: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  fromUserName: string | null;

  @Column({ type: 'text' })
  commentText: string;

  @Column({ type: 'boolean', default: false })
  liked: boolean;

  @Column({ type: 'boolean', default: false })
  replied: boolean;

  @Column({ type: 'text', nullable: true })
  replyText: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  ruleId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status: CommentLogStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** One Instagram DM or Facebook Messenger message, in or out. A thread is (accountId, threadId). */
@Entity('social_messages')
@Index(['businessId', 'platform', 'createdAt'])
@Index(['accountId', 'threadId'])
export class SocialMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** SocialAccount.id the conversation belongs to. */
  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 20 })
  platform: SocialPlatform;

  /** The customer's Instagram-scoped or Page-scoped user ID. */
  @Column({ type: 'varchar', length: 100 })
  threadId: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', length: 10 })
  direction: 'in' | 'out';

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'text', nullable: true })
  mediaUrl: string | null;

  /** Meta's message id (mid); unique, so a webhook retry or the echo of our own send is stored once. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  remoteMessageId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
