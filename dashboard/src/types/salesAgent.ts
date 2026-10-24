export type SalesChannelName = 'whatsapp' | 'email';
export type ProspectStatus = 'new' | 'queued' | 'contacted' | 'replied' | 'lost' | 'opted_out' | 'write_failed';
export type OutboxStatus = 'pending_review' | 'approved' | 'sending' | 'sent' | 'rejected' | 'cancelled' | 'failed';

export interface SalesAgentConfig {
  id: string;
  enabled: boolean;
  requireApproval: boolean;
  sendingPaused: boolean;
  persona: { name: string; company: string; role: string; tone: string; website: string };
  product: {
    name: string;
    description: string;
    pricing: string;
    benefits: string[];
    goal: string;
    bookingUrl: string;
    objectionResponses: Record<string, string>;
  };
  icp: { industries: string[]; titles: string[]; geography: string[] };
  whatsapp: {
    enabled: boolean;
    sessionId: string;
    maxDailySends: number;
    optOutLine: string;
    defaultCountryCode: string;
  };
  email: {
    enabled: boolean;
    integrationId: string;
    imapHost: string;
    imapPort: number;
    maxDailySends: number;
    optOutLine: string;
    postalAddress: string;
  };
  schedule: { heartbeatMinutes: number; quietStart: string; quietEnd: string; timezone: string };
  lastCycleAt: string | null;
}

export interface SalesOverview {
  enabled: boolean;
  requireApproval: boolean;
  sendingPaused: boolean;
  lastCycleAt: string | null;
  quietNow: boolean;
  channels: Array<{ name: SalesChannelName; ready: boolean; dailyCap: number }>;
  sentToday: Record<string, number>;
  companies: number;
  prospects: Record<ProspectStatus, number>;
  outbox: Record<'pending_review' | 'approved' | 'sent' | 'failed', number>;
  needsHuman: number;
}

export interface ProspectRef {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  status: ProspectStatus;
}

export interface SalesProspect extends ProspectRef {
  id: string;
  title: string;
  channel: SalesChannelName | null;
  notes: string;
  source: string;
  createdAt: string;
}

export interface SalesOutboxItem {
  id: string;
  prospectId: string;
  channel: SalesChannelName;
  kind: 'sequence' | 'reply';
  step: number;
  subject: string;
  body: string;
  status: OutboxStatus;
  sendAt: string;
  sentAt: string | null;
  error: string;
  approvedBy: string;
  prospect: ProspectRef | null;
}

export interface SalesConversation {
  id: string;
  prospectId: string;
  channel: SalesChannelName;
  thread: Array<{ from: 'agent' | 'prospect'; text: string; at: string }>;
  intent: string;
  stage: string;
  status: 'open' | 'needs_human' | 'closed';
  updatedAt: string;
  prospect: ProspectRef | null;
}

export interface SalesCompany {
  id: string;
  name: string;
  website: string;
  phone: string;
  industry: string;
  location: string;
  signals: Array<{ code: string; detail: string }>;
  profiledAt: string | null;
}

export interface SalesActivity {
  id: string;
  type: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface DiscoverResult {
  found: number;
  added: number;
  understood: { business: string; nameWords: string[]; place: string; radiusKm: number };
}

export interface NewProspect {
  name?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}
