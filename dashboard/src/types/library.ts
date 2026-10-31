export type LibraryItemType = 'text' | 'image' | 'video';

export interface LibraryItem {
  id: string;
  title: string;
  category: string;
  tags: string[];
  type: LibraryItemType;
  text: string;
  mediaMimetype: string | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryItemInput {
  title: string;
  category?: string;
  tags?: string[];
  text?: string;
  media?: { base64: string; mimetype: string };
  removeMedia?: boolean;
}

export interface LibrarySchedule {
  kind: 'once' | 'daily' | 'weekly';
  at?: string;
  time?: string;
  days?: number[];
  timezone: string;
}

export interface LibraryTarget {
  sessionId: string;
  postToStatus: boolean;
  chatIds: string[];
}

export interface LibraryAutomationInput extends LibraryTarget {
  name: string;
  itemIds: string[];
  schedule: LibrarySchedule;
  enabled?: boolean;
}

export interface LibraryAutomation extends LibraryAutomationInput {
  id: string;
  cursor: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: string;
}

export interface LibraryRun {
  id: string;
  automationId: string | null;
  itemId: string | null;
  itemTitle: string;
  sessionId: string;
  postedToStatus: boolean;
  sent: number;
  failed: number;
  skipped: number;
  error: string | null;
  createdAt: string;
}

export interface LibraryOverview {
  items: number;
  byType: Record<LibraryItemType, number>;
  categories: string[];
  activeAutomations: number;
  nextRunAt: string | null;
  sentThisWeek: number;
  statusPostsThisWeek: number;
}
