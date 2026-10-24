export interface GbpLocation {
  name: string;
  title: string;
  address: string;
  reviewUrl: string;
  mapsUrl: string;
  averageRating?: number;
  totalReviewCount?: number;
}

export interface GbpConfig {
  id: string;
  enabled: boolean;
  integrationId: string;
  accountName: string;
  locations: GbpLocation[];
  autoDraft: boolean;
  autoPublishMinStars: number;
  autoPublishRequiresText: boolean;
  tone: string;
  signature: string;
  instructions: string;
  alertSessionId: string;
  alertPhone: string;
  alertMaxStars: number;
  syncMinutes: number;
  reviewRequestTemplate: string;
  lastSyncAt: string | null;
  lastError: string;
}

export type GbpReviewStatus = 'new' | 'pending_review' | 'replied' | 'failed' | 'skipped';

export interface GbpReview {
  id: string;
  reviewName: string;
  locationName: string;
  locationTitle: string;
  reviewerName: string;
  reviewerPhoto: string;
  stars: number;
  comment: string;
  reviewedAt: string | null;
  replyText: string;
  repliedAt: string | null;
  repliedBy: string;
  draft: string;
  status: GbpReviewStatus;
  error: string;
}

export interface GbpOverview {
  enabled: boolean;
  connected: boolean;
  locations: GbpLocation[];
  lastSyncAt: string | null;
  lastError: string;
  total: number;
  average: number;
  byStars: number[];
  replied: number;
  waiting: number;
  unanswered: number;
  failed: number;
  autoReplied: number;
  responseRate: number;
  avgResponseHours: number | null;
  last30Days: number;
}

export interface GbpSyncSummary {
  fetched: number;
  newReviews: number;
  drafted: number;
  published: number;
  alerted: number;
  errors: string[];
}
