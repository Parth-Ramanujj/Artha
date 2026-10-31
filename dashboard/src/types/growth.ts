export interface GrowthSettings {
  id: string;
  sessionId: string | null;
  timezone: string;
  summaryEnabled: boolean;
  ownerPhone: string;
  summaryTime: string;
  summaryNextRunAt: string | null;
  summaryLastError: string | null;
  greetingsEnabled: boolean;
  greetingTime: string;
  greetingsNextRunAt: string | null;
  greetingsLastError: string | null;
  birthdayText: string;
  anniversaryText: string;
  winbackDays: number;
  winbackText: string;
  dailySendCap: number;
  voiceActionsEnabled: boolean;
  autoStopEnabled: boolean;
}

export type GrowthSettingsInput = Partial<
  Omit<GrowthSettings, 'id' | 'summaryNextRunAt' | 'summaryLastError' | 'greetingsNextRunAt' | 'greetingsLastError'>
>;

export interface GrowthLink {
  id: string;
  name: string;
  ref: string;
  phone: string;
  prefillText: string;
  scans: number;
  chats: number;
  lastScanAt: string | null;
  createdAt: string;
}

export interface GrowthLinkInput {
  name: string;
  phone: string;
  prefillText?: string;
}

export interface GreetingLogEntry {
  id: string;
  chatId: string;
  name: string | null;
  kind: 'birthday' | 'anniversary' | 'winback';
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  createdAt: string;
}

export interface SummaryPreview {
  text: string;
  ai: boolean;
  facts: {
    date: string;
    newLeads: number;
    dealsWon: number;
    wonAmount: number;
    complaints: number;
    messagesIn: number;
    messagesOut: number;
    followUps: { name: string; reason: string }[];
  };
}

export interface ComplianceReport {
  days: number;
  sent: number;
  failed: number;
  optIns: number;
  optOuts: number;
  peakPerHour: number;
  dndChats: number;
  truncated: boolean;
  health: { score: number; level: 'good' | 'watch' | 'risk'; warnings: string[] };
  sessions: {
    sessionId: string;
    name: string;
    phone: string | null;
    sent: number;
    failed: number;
    peakPerHour: number;
  }[];
  proof: {
    waContactId: string;
    status: 'opted_in' | 'opted_out';
    source: string | null;
    consentedAt: string | null;
    revokedAt: string | null;
  }[];
}
