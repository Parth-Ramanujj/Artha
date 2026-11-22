export type ChannelType = 'whatsapp' | 'instagram' | 'facebook' | 'google' | 'telegram';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: 'Growth' | 'Enterprise' | 'Starter';
  businessUuid: string;
  activeChannels: number;
  createdAt: string;
}

export interface PlatformConnection {
  id: string;
  type: ChannelType;
  name: string;
  identifier: string; // phone number, @handle, or location
  status: 'WORKING' | 'CONNECTED' | 'OFFLINE';
  subBadge?: string;
  secondaryInfo?: string;
  activeFollowersOrReviews?: string;
}

export interface QuickStat {
  id: string;
  label: string;
  value: string;
  delta?: string;
  statusText?: string;
  isAmber?: boolean;
}

export interface ActivityItem {
  id: string;
  senderName: string;
  avatarText: string;
  timestamp: string;
  message: string;
  channel: string;
  channelType: ChannelType;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'contact' | 'system';
  text: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  channel: ChannelType;
}

export interface InboxConversation {
  id: string;
  contactName: string;
  contactPhone: string;
  channel: ChannelType;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  initials: string;
  status: 'open' | 'resolved' | 'pending';
  messages: ChatMessage[];
}

export interface CrmDeal {
  id: string;
  title: string;
  company: string;
  value: string;
  channel: ChannelType;
  stage: 'new' | 'qualified' | 'proposal' | 'won';
  tag?: string;
  contact: string;
  lastActive: string;
  priority?: 'high' | 'normal';
}

export interface FollowUpTask {
  id: string;
  contactName: string;
  company: string;
  value: string;
  channel: ChannelType;
  actionRequired: string;
  dueTime: string;
  isUrgent: boolean;
  status: 'pending' | 'completed';
}

export interface GoogleReview {
  id: string;
  author: string;
  rating: number;
  comment: string;
  timestamp: string;
  branch: string;
  replyStatus: 'replied' | 'pending';
  draftReply?: string;
}

export interface WhatsAppBroadcast {
  id: string;
  name: string;
  templateName: string;
  audienceSize: number;
  sentCount: number;
  deliveredPercent: number;
  readRatePercent: number;
  status: 'COMPLETED' | 'SENDING' | 'SCHEDULED';
  createdAt: string;
}

export interface CatalogProduct {
  id: string;
  title: string;
  price: string;
  originalPrice?: string;
  sku: string;
  stockUnits: number;
  category: string;
  imageUrl: string;
  inStock: boolean;
}

export interface WhatsAppFlowStep {
  stepNumber: number;
  title: string;
  fields: string[];
}

export interface WhatsAppFlow {
  id: string;
  title: string;
  metaFlowId: string;
  status: 'PUBLISHED' | 'DRAFT';
  steps: WhatsAppFlowStep[];
  submissionsCount: number;
}

export interface WorkflowRule {
  id: string;
  name: string;
  triggerEvent: string;
  actionTaken: string;
  channel: ChannelType;
  executionsCount: number;
  isActive: boolean;
}

export interface MediaAsset {
  id: string;
  title: string;
  type: 'status' | 'image' | 'pdf' | 'video';
  fileSize: string;
  uploadedAt: string;
  previewUrl: string;
}

export interface IntegrationApp {
  id: string;
  name: string;
  identifier: string;
  type: 'shopify' | 'woocommerce' | 'hubspot' | 'zoho';
  status: 'CONNECTED' | 'DISCONNECTED';
  syncStatus: string;
  eventsCount: number;
}

export interface WebhookLog {
  id: string;
  event: string;
  source: string;
  status: 'DELIVERED' | 'FAILED' | 'RETRYING';
  statusCode: number;
  timestamp: string;
  payload?: any;
}
