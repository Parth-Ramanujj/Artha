export type SocialPlatform = 'instagram' | 'facebook' | 'telegram' | 'youtube' | 'x';
export type SocialPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type SocialMediaType = 'IMAGE' | 'VIDEO';
export type RuleMatchType = 'contains' | 'exact' | 'regex' | 'all';
export type CommentLogStatus = 'success' | 'failed' | 'ignored';
export type RuleAppliesTo = 'comments' | 'dms' | 'both';

export interface SocialAccount {
  id: string;
  businessId: string;
  platform: SocialPlatform;
  accountName: string;
  accountId: string;
  pageId: string | null;
  webhookVerifyToken: string | null;
  /** Absent on servers older than this field. */
  aiAutoReply?: boolean;
  status: 'connected' | 'disconnected';
  tokenExpiresAt: string | null;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPost {
  id: string;
  businessId: string;
  accountId: string | null;
  platform: SocialPlatform;
  caption: string;
  mediaUrl: string;
  mediaType: SocialMediaType;
  status: SocialPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  remotePostId: string | null;
  permalink: string | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialCommentRule {
  id: string;
  businessId: string;
  name: string;
  platform: 'all' | SocialPlatform;
  postId: string | null;
  matchType: RuleMatchType;
  keywords: string;
  replyTemplates: string;
  autoLike: boolean;
  autoDm: boolean;
  autoDmTemplate: string | null;
  useAi: boolean;
  aiPrompt: string | null;
  delaySeconds: number;
  enabled: boolean;
  /** Absent on servers older than this field: treat as comments. */
  appliesTo?: RuleAppliesTo;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SocialCommentLog {
  id: string;
  businessId: string;
  platform: SocialPlatform;
  postId: string;
  commentId: string;
  fromUserId: string | null;
  fromUserName: string | null;
  commentText: string;
  liked: boolean;
  replied: boolean;
  replyText: string | null;
  ruleId: string | null;
  status: CommentLogStatus;
  error: string | null;
  createdAt: string;
}

export interface SocialOverview {
  totalAccounts: number;
  connectedAccounts: number;
  totalPosts: number;
  publishedPosts: number;
  scheduledPosts: number;
  failedPosts: number;
  totalCommentsLogged: number;
  autoLikesGiven: number;
  autoRepliesSent: number;
  totalRules: number;
  activeRules: number;
  recentLogs: SocialCommentLog[];
  /** DM / Messenger volume, last 30 days. Absent on servers older than this field. */
  messages?: Record<SocialPlatform, { received: number; sent: number; customers: number }>;
  /** Absent on servers older than this field. */
  webhook?: {
    secretConfigured: boolean;
    /** reason: 'signature' (App secret mismatch) or 'no-secret' (META_APP_SECRET unset). */
    lastRejected: { at: string; reason: 'signature' | 'no-secret' } | null;
    /** Meta's last accepted webhook since the server started (in memory). */
    lastDelivery?: { at: string; object: string; comments: number; messages: number } | null;
    /** A comment or DM for an Instagram/Page ID that no connected account matches. */
    lastUnmatched?: { at: string; platform: SocialPlatform; accountId: string } | null;
    serverStartedAt?: string;
  };
}

export interface SimulateCommentResult {
  matched: boolean;
  message?: string;
  ruleName?: string;
  ruleId?: string;
  matchType?: string;
  willAutoLike?: boolean;
  willAutoDm?: boolean;
  dmText?: string | null;
  generatedReply?: string;
  delaySeconds?: number;
}

export interface SocialAccountInput {
  platform: SocialPlatform;
  accountName?: string;
  /** Not needed for Telegram: the server reads the bot id from the token. */
  accountId?: string;
  /** Write-only: the API never returns it. Leave empty on update to keep the stored token. */
  accessToken?: string;
  pageId?: string;
  webhookVerifyToken?: string;
  aiAutoReply?: boolean;
  /** X only: the other three keys of the app (the access token goes in accessToken). */
  apiKey?: string;
  apiSecret?: string;
  accessTokenSecret?: string;
  /** YouTube only: the connected google_youtube integration. */
  integrationId?: string;
}

export interface SocialPostInput {
  platform: SocialPlatform;
  caption: string;
  /** Not used for X posts (text only). */
  mediaUrl?: string;
  mediaType?: SocialMediaType;
  scheduledAt?: string | null;
  publishNow?: boolean;
  accountId?: string;
}

export interface SocialRuleInput {
  name: string;
  platform: 'all' | SocialPlatform;
  appliesTo?: RuleAppliesTo;
  postId?: string;
  matchType: RuleMatchType;
  keywords: string[];
  replyTemplates: string[];
  autoLike: boolean;
  autoDm: boolean;
  autoDmTemplate?: string;
  useAi: boolean;
  aiPrompt?: string;
  delaySeconds: number;
  enabled: boolean;
}

/** One Instagram DM / Facebook Messenger conversation in the Chats inbox. */
export interface SocialThread {
  accountId: string;
  accountName: string;
  threadId: string;
  customerName: string | null;
  lastText: string;
  lastDirection: 'in' | 'out';
  lastAt: string;
}

export interface SocialMessage {
  id: string;
  accountId: string;
  platform: SocialPlatform;
  threadId: string;
  customerName: string | null;
  direction: 'in' | 'out';
  text: string | null;
  mediaUrl: string | null;
  createdAt: string;
}
