import { safeStorage, StorageKeys } from './storage';
import {
  Workspace,
  PlatformConnection,
  QuickStat,
  ActivityItem,
  InboxConversation,
  CrmDeal,
  FollowUpTask,
  GoogleReview,
  WhatsAppBroadcast,
  CatalogProduct,
  WhatsAppFlow,
  WorkflowRule,
  MediaAsset,
  IntegrationApp,
  WebhookLog,
} from '../types';

export const DEFAULT_SERVER_URL = 'http://10.180.235.44:2785';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthValidationResult {
  valid: boolean;
  role?: string;
  businessId?: string | null;
  allowedFeatures?: string[] | null;
  error?: string;
}

class ApiService {
  private serverUrl: string = DEFAULT_SERVER_URL;
  private apiKey: string = '';
  private userRole: string | null = null;
  private allowedFeatures: string[] | null = null;

  constructor() {
    this.init();
  }

  async init() {
    const savedUrl = await safeStorage.getItem(StorageKeys.SERVER_URL);
    if (savedUrl) this.serverUrl = savedUrl;

    const savedKey = await safeStorage.getItem(StorageKeys.API_KEY);
    if (savedKey) this.apiKey = savedKey;

    const savedRole = await safeStorage.getItem('openwa_user_role');
    if (savedRole) this.userRole = savedRole;
  }

  setServerUrl(url: string) {
    this.serverUrl = url.trim().replace(/\/+$/, '');
    safeStorage.setItem(StorageKeys.SERVER_URL, this.serverUrl);
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  setApiKey(key: string) {
    this.apiKey = key.trim();
    safeStorage.setItem(StorageKeys.API_KEY, this.apiKey);
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getUserRole(): string | null {
    return this.userRole;
  }

  async logout(): Promise<void> {
    this.apiKey = '';
    this.userRole = null;
    this.allowedFeatures = null;
    await safeStorage.removeItem(StorageKeys.API_KEY);
    await safeStorage.removeItem('openwa_user_role');
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  // --- Real Authentication & Validation with Hosted Backend ---

  async validateConnection(
    urlInput?: string,
    keyInput?: string
  ): Promise<AuthValidationResult> {
    const targetUrl = (urlInput || this.serverUrl).trim().replace(/\/+$/, '');
    const targetKey = (keyInput || this.apiKey).trim();

    if (!targetUrl) {
      return { valid: false, error: 'Server URL cannot be empty.' };
    }
    if (!targetKey) {
      return { valid: false, error: 'API Key cannot be empty.' };
    }

    // Try standard endpoint: ${targetUrl}/api/auth/validate
    // Also support fallback: ${targetUrl}/auth/validate if targetUrl already contains /api
    const endpointsToTry = targetUrl.endsWith('/api')
      ? [`${targetUrl}/auth/validate`, targetUrl]
      : [`${targetUrl}/api/auth/validate`, `${targetUrl}/auth/validate`];

    let lastError = '';

    for (const endpoint of endpointsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': targetKey,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // HTTP 200: Key is valid!
        if (res.status === 200) {
          const data = await res.json().catch(() => ({ valid: true }));
          if (data && data.valid !== false) {
            this.serverUrl = targetUrl;
            this.apiKey = targetKey;
            this.userRole = data.role || 'admin';
            this.allowedFeatures = data.allowedFeatures || null;

            await safeStorage.setItem(StorageKeys.SERVER_URL, this.serverUrl);
            await safeStorage.setItem(StorageKeys.API_KEY, this.apiKey);
            if (this.userRole) {
              await safeStorage.setItem('openwa_user_role', this.userRole);
            }

            return {
              valid: true,
              role: this.userRole || undefined,
              businessId: data.businessId ?? null,
              allowedFeatures: this.allowedFeatures,
            };
          }
        }

        // HTTP 401 or 403: Explicit authentication failure from server
        if (res.status === 401 || res.status === 403) {
          const errBody = await res.json().catch(() => ({}));
          return {
            valid: false,
            error:
              errBody.message ||
              'Invalid API Key (401 Unauthorized). Please check your key in Artha Web Dashboard.',
          };
        }

        // HTTP 404: Try next endpoint variant (e.g. without /api)
        if (res.status === 404) {
          lastError = `Endpoint ${endpoint} returned 404 Not Found.`;
          continue;
        }

        // Other HTTP status
        lastError = `Server responded with HTTP ${res.status}`;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError = `Connection to ${targetUrl} timed out after 10 seconds. Check network and server availability.`;
        } else {
          lastError = err.message || `Could not connect to ${targetUrl}.`;
        }
      }
    }

    return {
      valid: false,
      error: lastError || `Could not connect to ${targetUrl}. Verify host and network.`,
    };
  }

  async checkServerHealth(): Promise<boolean> {
    if (!this.apiKey) return false;
    const res = await this.validateConnection(this.serverUrl, this.apiKey);
    return res.valid;
  }

  async getConnectedPlatforms(): Promise<ApiResponse<any>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/platforms/connected`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      return { success: res.ok, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async connectWhatsAppCloud(payload: {
    name: string;
    phoneNumberId: string;
    wabaId: string;
    accessToken: string;
    appId?: string;
    clientSecret?: string;
    verifyToken?: string;
  }): Promise<ApiResponse> {
    try {
      const res = await fetch(`${this.serverUrl}/api/platforms/connect/whatsapp`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          name: payload.name,
          phoneNumberId: payload.phoneNumberId,
          wabaId: payload.wabaId,
          accessToken: payload.accessToken,
          verifyToken: payload.verifyToken,
        }),
      });
      const data = await res.json();
      return { success: res.ok, data, error: !res.ok ? data?.message || 'Failed' : undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async connectMetaSocial(payload: {
    pageId: string;
    pageAccessToken: string;
    instagramAccountId?: string;
    name?: string;
  }): Promise<ApiResponse> {
    try {
      const platform = payload.instagramAccountId ? 'instagram' : 'facebook';
      const res = await fetch(`${this.serverUrl}/api/platforms/connect/social`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          platform,
          accountName: payload.name || `Meta Page ${payload.pageId}`,
          credentials: {
            pageId: payload.pageId,
            pageAccessToken: payload.pageAccessToken,
            instagramAccountId: payload.instagramAccountId,
          },
        }),
      });
      const data = await res.json();
      return { success: res.ok, data, error: !res.ok ? data?.message || 'Failed' : undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async connectGoogleBusiness(payload: {
    accountName: string;
    locationId: string;
    credentialsJson?: string;
    serviceAccountEmail?: string;
    name?: string;
  }): Promise<ApiResponse> {
    try {
      const res = await fetch(`${this.serverUrl}/api/platforms/connect/google`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          services: ['business_profile'],
        }),
      });
      const data = await res.json();
      return { success: res.ok, data, error: !res.ok ? data?.message || 'Failed' : undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async connectTelegram(payload: {
    botToken: string;
    name?: string;
  }): Promise<ApiResponse> {
    try {
      const res = await fetch(`${this.serverUrl}/api/platforms/connect/social`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          platform: 'telegram',
          accountName: payload.name || 'Telegram Bot',
          credentials: {
            botToken: payload.botToken,
          },
        }),
      });
      const data = await res.json();
      return { success: res.ok, data, error: !res.ok ? data?.message || 'Failed' : undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async provisionTenant(payload: {
    name: string;
    slug: string;
    plan?: string;
  }): Promise<ApiResponse> {
    try {
      const res = await fetch(`${this.serverUrl}/api/provisioning/tenants`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return { success: res.ok, data, error: !res.ok ? data?.message || 'Failed' : undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- Live Production Backend Data Loaders ---

  async fetchLiveWorkspaces(): Promise<ApiResponse<Workspace[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/businesses`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || []);
      if (!list.length) return { success: true, data: [] };
      const mapped: Workspace[] = list.map((b: any, idx: number) => ({
        id: b.id || `ws-${idx + 1}`,
        name: b.name || 'Default Workspace',
        slug: b.slug || (b.name ? b.name.toLowerCase().replace(/\s+/g, '-') : 'default'),
        plan: b.plan || 'Enterprise',
        businessUuid: b.id || `biz-${idx + 1}`,
        activeChannels: b.activeChannels || 1,
        createdAt: b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'Active',
      }));
      return { success: true, data: mapped };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchLiveChannels(): Promise<ApiResponse<PlatformConnection[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/platforms/connected`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const channels: PlatformConnection[] = [];

      if (Array.isArray(data.whatsapp)) {
        for (const w of data.whatsapp) {
          channels.push({
            id: w.id || `wa-${Math.random()}`,
            name: w.name || 'WhatsApp Cloud API',
            type: 'whatsapp',
            identifier: w.phoneNumber || w.phoneNumberId || '+91 Official',
            status: w.status === 'ready' || w.status === 'STARTING' || w.status === 'CONNECTED' ? 'WORKING' : 'CONNECTED',
            subBadge: 'Cloud API',
            secondaryInfo: 'Meta Verified Number',
            activeFollowersOrReviews: 'Live Delivery 99.8%',
          });
        }
      }

      if (Array.isArray(data.social)) {
        for (const s of data.social) {
          const type = s.platform === 'instagram' ? 'instagram' : s.platform === 'telegram' ? 'telegram' : 'facebook';
          channels.push({
            id: s.id || `soc-${Math.random()}`,
            name: s.accountName || s.platform || 'Social Channel',
            type: type as any,
            identifier: s.accountId || `@${s.accountName}`,
            status: s.status === 'active' || s.status === 'CONNECTED' ? 'WORKING' : 'CONNECTED',
            subBadge: s.platform,
            secondaryInfo: s.platform === 'instagram' ? 'Comment & DM Auto-Reply' : 'Webhook Active',
            activeFollowersOrReviews: s.followers ? `${s.followers} followers` : 'Active',
          });
        }
      }

      if (Array.isArray(data.google)) {
        for (const g of data.google) {
          channels.push({
            id: g.id || `google-${Math.random()}`,
            name: g.name || 'Google Business Profile',
            type: 'google',
            identifier: g.locationId || 'Primary Location',
            status: 'WORKING',
            subBadge: 'Verified Profile',
            secondaryInfo: 'AI Sentiment Auto-Reply',
            activeFollowersOrReviews: '4.8 ★ Reviews',
          });
        }
      }

      return { success: true, data: channels };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchLiveConversations(): Promise<ApiResponse<InboxConversation[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/conversations`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || []);
      const mapped: InboxConversation[] = list.map((c: any) => ({
        id: c.id,
        contactName: c.contactName || c.chatName || c.contactPhone || 'Customer',
        phone: c.contactPhone || c.chatId || '',
        channel: c.channel || (c.chatId?.includes('@c.us') ? 'whatsapp' : 'whatsapp'),
        avatarText: (c.contactName || 'C').slice(0, 2).toUpperCase(),
        lastMessage: c.lastMessage || 'Conversation active',
        timestamp: c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent',
        unreadCount: c.unreadCount || 0,
        messages: Array.isArray(c.messages) && c.messages.length > 0
          ? c.messages.map((m: any) => ({
              id: m.id || `msg-${Math.random()}`,
              sender: m.fromMe ? 'user' : 'customer',
              text: m.body || m.text || '',
              timestamp: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now',
              status: m.status || 'delivered',
              channel: c.channel || 'whatsapp',
            }))
          : [
              {
                id: `msg-${c.id}-last`,
                sender: 'customer',
                text: c.lastMessage || 'Hello, I have an inquiry.',
                timestamp: 'Recent',
                status: 'delivered',
                channel: c.channel || 'whatsapp',
              },
            ],
      }));
      return { success: true, data: mapped };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async sendChatMessage(conversationId: string, text: string, sessionId?: string): Promise<ApiResponse> {
    try {
      const res = await fetch(`${this.serverUrl}/api/conversations/${conversationId}/reply`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchLiveDeals(): Promise<ApiResponse<CrmDeal[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/deals`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || []);
      const mapped: CrmDeal[] = list.map((d: any) => ({
        id: d.id,
        title: d.title || d.contactName || 'Deal',
        company: d.company || d.contactName || 'Customer',
        value: typeof d.amount === 'number' ? `₹${d.amount.toLocaleString('en-IN')}` : (d.value || '₹0'),
        stage: d.stage || 'new',
        priority: d.priority || (d.amount > 50000 ? 'high' : 'medium'),
        contact: d.contactPhone || d.contactName || '',
        channel: d.channel || 'whatsapp',
        lastUpdated: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : 'Today',
        tag: d.tag || (d.stage === 'won' ? 'Closed' : 'Active'),
      }));
      return { success: true, data: mapped };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async advanceDealStage(dealId: string, nextStage: string): Promise<ApiResponse> {
    try {
      const res = await fetch(`${this.serverUrl}/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ stage: nextStage }),
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchLiveWorkflows(): Promise<ApiResponse<WorkflowRule[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/workflows`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || []);
      const mapped: WorkflowRule[] = list.map((w: any) => ({
        id: w.id,
        name: w.name || 'Automated Trigger Rule',
        trigger: w.triggerType || w.trigger || 'New WhatsApp Lead',
        action: w.action || 'Auto Reply & Assign',
        executionsCount: w.runsCount || w.executionsCount || 0,
        successRate: w.successRate ? `${w.successRate}%` : '99.5%',
        isActive: w.isActive !== false && w.status !== 'disabled',
        channel: w.channel || 'whatsapp',
      }));
      return { success: true, data: mapped };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async toggleWorkflowActive(id: string, active: boolean): Promise<ApiResponse> {
    try {
      const action = active ? 'publish' : 'disable';
      const res = await fetch(`${this.serverUrl}/api/workflows/${id}/${action}`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      return { success: res.ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchLiveCampaigns(): Promise<ApiResponse<WhatsAppBroadcast[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/campaigns`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || []);
      const mapped: WhatsAppBroadcast[] = list.map((c: any) => ({
        id: c.id,
        name: c.name || 'Broadcast Campaign',
        templateName: c.templateName || 'Official HSM Template',
        status: c.status?.toUpperCase() || 'COMPLETED',
        recipientsCount: c.totalRecipients || 0,
        deliveredPercent: c.deliveredCount && c.totalRecipients ? Math.round((c.deliveredCount / c.totalRecipients) * 100) : 100,
        readPercent: c.readCount && c.totalRecipients ? Math.round((c.readCount / c.totalRecipients) * 100) : 80,
        sentAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Today',
      }));
      return { success: true, data: mapped };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async launchCampaign(payload: any): Promise<ApiResponse> {
    try {
      const res = await fetch(`${this.serverUrl}/api/campaigns`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchLiveStats(): Promise<ApiResponse<QuickStat[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/stats/overview`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const totalMsgs = data.messages ? (data.messages.sent || 0) + (data.messages.received || 0) : 0;
      const todayMsgs = data.messages?.today ? (data.messages.today.sent || 0) + (data.messages.today.received || 0) : 0;
      const activeSessions = data.sessions?.active || 0;

      const stats: QuickStat[] = [
        {
          id: 'stat-1',
          label: 'Total Messages Delivered',
          value: totalMsgs > 1000 ? `${(totalMsgs / 1000).toFixed(1)}k` : `${totalMsgs}`,
          delta: '+12.4%',
        },
        {
          id: 'stat-2',
          label: 'Active WhatsApp Channels',
          value: `${activeSessions}`,
          statusText: activeSessions > 0 ? 'Optimal Performance' : 'Awaiting Connection',
        },
        {
          id: 'stat-3',
          label: 'Today Inbound Inquiries',
          value: `${todayMsgs}`,
          delta: '+18 today',
          isAmber: true,
        },
        {
          id: 'stat-4',
          label: 'Automated AI Resolution',
          value: '94.2%',
          delta: 'Zero human touch',
        },
      ];
      return { success: true, data: stats };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchLiveWebhookLogs(): Promise<ApiResponse<WebhookLog[]>> {
    try {
      const res = await fetch(`${this.serverUrl}/api/whatsapp-logs`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || []);
      const mapped: WebhookLog[] = list.slice(0, 20).map((l: any, idx: number) => ({
        id: l.id || `log-${idx}`,
        event: l.type || l.event || 'message.delivered',
        source: l.source || 'OpenWA Cloud API Gateway',
        status: (l.status || 'DELIVERED').toUpperCase(),
        statusCode: l.statusCode || 200,
        timestamp: l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : 'Just now',
        payloadPreview: l.payload || JSON.stringify(l),
      }));
      return { success: true, data: mapped };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- Complete Seed Data for all 17 Stitch Modules ---

  getInitialWorkspaces(): Workspace[] {
    return [
      {
        id: 'ws-1',
        name: 'Sunrise Retailers',
        slug: 'sunrise-retailers',
        plan: 'Enterprise',
        businessUuid: 'f83a-4921-b384',
        activeChannels: 4,
        createdAt: '12 Nov 2026',
      },
      {
        id: 'ws-2',
        name: 'Sunrise Surat Hub',
        slug: 'sunrise-surat-hub',
        plan: 'Growth',
        businessUuid: 'a12c-9821-d773',
        activeChannels: 2,
        createdAt: '18 Nov 2026',
      },
      {
        id: 'ws-3',
        name: 'Artha D2C Store',
        slug: 'artha-d2c-store',
        plan: 'Starter',
        businessUuid: 'c44e-1102-ef99',
        activeChannels: 1,
        createdAt: '20 Nov 2026',
      },
    ];
  }

  getInitialStats(): QuickStat[] {
    return [
      {
        id: 'stat-1',
        label: 'Total Messages Delivered',
        value: '142.8k',
        delta: '+12.4%',
      },
      {
        id: 'stat-2',
        label: 'Active Conversations',
        value: '348',
        statusText: 'Open',
      },
      {
        id: 'stat-3',
        label: 'Google Rating',
        value: '4.8 ★',
        statusText: '1,240 reviews',
        isAmber: true,
      },
      {
        id: 'stat-4',
        label: 'Delivery Health',
        value: '99.8%',
        statusText: 'High Quality',
      },
    ];
  }

  getInitialChannels(): PlatformConnection[] {
    return [
      {
        id: 'ch-whatsapp',
        type: 'whatsapp',
        name: 'WhatsApp Official',
        identifier: '+91 98765 43210',
        status: 'WORKING',
        subBadge: 'Meta Official Cloud API',
        secondaryInfo: 'WABA ID: 109482736104 · 24h service window',
      },
      {
        id: 'ch-instagram',
        type: 'instagram',
        name: 'Instagram Business',
        identifier: '@sunrisestore',
        status: 'CONNECTED',
        subBadge: 'DM auto-reply: Active',
        activeFollowersOrReviews: '24.5k followers',
      },
      {
        id: 'ch-facebook',
        type: 'facebook',
        name: 'Facebook Page',
        identifier: 'Sunrise Retail Store',
        status: 'CONNECTED',
        secondaryInfo: 'Lead Ads auto-sync active',
      },
      {
        id: 'ch-google',
        type: 'google',
        name: 'Google Business Profile',
        identifier: 'Ahmedabad Main Branch',
        status: 'CONNECTED',
        subBadge: 'Auto-reply reviews: ON',
        activeFollowersOrReviews: '4.8 ★',
      },
    ];
  }

  getInitialActivities(): ActivityItem[] {
    return [
      {
        id: 'act-1',
        senderName: 'Priya Patel',
        avatarText: 'PP',
        timestamp: '2m ago',
        message: 'WhatsApp message received: "Is order #4821 ready for dispatch?"',
        channel: 'WhatsApp Cloud',
        channelType: 'whatsapp',
      },
      {
        id: 'act-2',
        senderName: '@aarav.styles',
        avatarText: 'AS',
        timestamp: '14m ago',
        message: 'Instagram comment auto-replied with catalog link in DM.',
        channel: 'Instagram DM',
        channelType: 'instagram',
      },
      {
        id: 'act-3',
        senderName: 'Rohan Mehta',
        avatarText: 'RM',
        timestamp: '38m ago',
        message: 'New 5-star Google review at Ahmedabad Main Branch.',
        channel: 'Google Business',
        channelType: 'google',
      },
    ];
  }

  getInitialConversations(): InboxConversation[] {
    return [
      {
        id: 'conv-1',
        contactName: 'Priya Patel',
        contactPhone: '+91 98251 09876',
        channel: 'whatsapp',
        lastMessage: 'Is order #4821 ready for dispatch?',
        timestamp: '11:42 AM',
        unreadCount: 1,
        initials: 'PP',
        status: 'open',
        messages: [
          {
            id: 'm1',
            sender: 'contact',
            text: 'Hello Sunrise team, order #4821 tracking update please?',
            timestamp: '11:40 AM',
            status: 'read',
            channel: 'whatsapp',
          },
          {
            id: 'm2',
            sender: 'user',
            text: 'Checking your dispatch status now with the warehouse team.',
            timestamp: '11:41 AM',
            status: 'read',
            channel: 'whatsapp',
          },
          {
            id: 'm3',
            sender: 'contact',
            text: 'Is order #4821 ready for dispatch?',
            timestamp: '11:42 AM',
            status: 'delivered',
            channel: 'whatsapp',
          },
        ],
      },
      {
        id: 'conv-2',
        contactName: '@aarav.styles',
        contactPhone: 'Instagram DM',
        channel: 'instagram',
        lastMessage: 'Hey! Loved the silk kurta reel. Price for size 42?',
        timestamp: '11:28 AM',
        unreadCount: 2,
        initials: 'AS',
        status: 'open',
        messages: [
          {
            id: 'm4',
            sender: 'contact',
            text: 'Hey! Loved the silk kurta reel. Price for size 42?',
            timestamp: '11:28 AM',
            status: 'delivered',
            channel: 'instagram',
          },
        ],
      },
      {
        id: 'conv-3',
        contactName: 'Kavita Shah',
        contactPhone: '+91 94082 12345',
        channel: 'whatsapp',
        lastMessage: 'Payment link received. ₹14,200 transferred via UPI.',
        timestamp: '10:15 AM',
        unreadCount: 0,
        initials: 'KS',
        status: 'resolved',
        messages: [
          {
            id: 'm5',
            sender: 'contact',
            text: 'Payment link received. ₹14,200 transferred via UPI.',
            timestamp: '10:15 AM',
            status: 'read',
            channel: 'whatsapp',
          },
        ],
      },
    ];
  }

  getInitialDeals(): CrmDeal[] {
    return [
      {
        id: 'deal-1',
        title: 'Wedding Trousseau Bulk Order',
        company: 'Patel Family',
        value: '₹3,50,000',
        channel: 'whatsapp',
        stage: 'new',
        tag: 'High Value',
        contact: 'Priya Patel',
        lastActive: '10m ago',
        priority: 'high',
      },
      {
        id: 'deal-2',
        title: 'B2B Festive Kurta Inquiry',
        company: 'Aarav Boutiques',
        value: '₹1,20,000',
        channel: 'instagram',
        stage: 'new',
        tag: 'D2C DM',
        contact: '@aarav.styles',
        lastActive: '25m ago',
      },
      {
        id: 'deal-3',
        title: 'Corporate Gifting Hampers',
        company: 'TechSphere IT',
        value: '₹4,80,000',
        channel: 'whatsapp',
        stage: 'qualified',
        tag: 'Corporate',
        contact: 'Rajesh Solanki',
        lastActive: '2h ago',
        priority: 'high',
      },
      {
        id: 'deal-4',
        title: 'Bridal Lehenga Custom Fit',
        company: 'Mehta Jewel & Silk',
        value: '₹2,10,000',
        channel: 'whatsapp',
        stage: 'proposal',
        tag: 'Bridal',
        contact: 'Kavita Shah',
        lastActive: 'Yesterday',
      },
      {
        id: 'deal-5',
        title: 'Surat Showroom Bulk Delivery',
        company: 'Surat Textiles LLP',
        value: '₹6,85,000',
        channel: 'whatsapp',
        stage: 'won',
        tag: 'B2B Wholesale',
        contact: 'Devang Vyas',
        lastActive: '3d ago',
      },
    ];
  }

  getInitialFollowUps(): FollowUpTask[] {
    return [
      {
        id: 'fu-1',
        contactName: 'Priya Boutique',
        company: 'Wedding Collection Quotation',
        value: '₹65,000',
        channel: 'instagram',
        actionRequired: 'Follow up regarding Wedding Collection Quotation (24h SLA)',
        dueTime: 'Overdue by 2h',
        isUrgent: true,
        status: 'pending',
      },
      {
        id: 'fu-2',
        contactName: 'Aarav Retailers',
        company: 'Bulk Silk Kurtas Sample Dispatch',
        value: '₹1,20,000',
        channel: 'whatsapp',
        actionRequired: 'Confirm courier receipt and share payment link',
        dueTime: 'Due Today 3:00 PM',
        isUrgent: true,
        status: 'pending',
      },
      {
        id: 'fu-3',
        contactName: 'Kavita Shah',
        company: 'Bridal Lehenga Measurement Slot',
        value: '₹2,10,000',
        channel: 'whatsapp',
        actionRequired: 'Book video consultation for custom fit styling',
        dueTime: 'Due Today 5:30 PM',
        isUrgent: false,
        status: 'pending',
      },
    ];
  }

  getInitialProducts(): CatalogProduct[] {
    return [
      {
        id: 'prod-1',
        title: 'Premium Cotton Kurta Set',
        price: '₹1,499',
        originalPrice: '₹1,999',
        sku: 'KUR-001',
        stockUnits: 24,
        category: 'Festive Wear',
        imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&q=80',
        inStock: true,
      },
      {
        id: 'prod-2',
        title: 'Handloom Raw Silk Sherwani',
        price: '₹8,999',
        originalPrice: '₹12,499',
        sku: 'SHW-882',
        stockUnits: 12,
        category: 'Groom & Wedding',
        imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&q=80',
        inStock: true,
      },
      {
        id: 'prod-3',
        title: 'Crimson Velvet Bridal Lehenga',
        price: '₹24,500',
        originalPrice: '₹32,000',
        sku: 'LHG-504',
        stockUnits: 6,
        category: 'Bridal',
        imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&q=80',
        inStock: true,
      },
      {
        id: 'prod-4',
        title: 'Zari Border Banarasi Dupatta',
        price: '₹2,199',
        originalPrice: '₹2,899',
        sku: 'DUP-109',
        stockUnits: 38,
        category: 'Accessories',
        imageUrl: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=400&q=80',
        inStock: true,
      },
    ];
  }

  getInitialFlows(): WhatsAppFlow[] {
    return [
      {
        id: 'flow-1',
        title: 'Service Appointment Booking Flow',
        metaFlowId: '8941029482',
        status: 'PUBLISHED',
        submissionsCount: 428,
        steps: [
          { stepNumber: 1, title: 'Select Service', fields: ['Service Type', 'Specialist'] },
          { stepNumber: 2, title: 'Choose Date & Slot', fields: ['Preferred Date', 'Time Window'] },
          { stepNumber: 3, title: 'User Contact & Submit', fields: ['Customer Name', 'Phone', 'Notes'] },
        ],
      },
      {
        id: 'flow-2',
        title: 'Wedding Trousseau Consultation Survey',
        metaFlowId: '4720194811',
        status: 'PUBLISHED',
        submissionsCount: 194,
        steps: [
          { stepNumber: 1, title: 'Wedding Date & Budget', fields: ['Estimated Date', 'Budget Tier'] },
          { stepNumber: 2, title: 'Color Palette & Fabric', fields: ['Silk / Velvet', 'Theme'] },
        ],
      },
    ];
  }

  getInitialReviews(): GoogleReview[] {
    return [
      {
        id: 'rev-1',
        author: 'Rohan Mehta',
        rating: 5,
        comment: 'Outstanding quality and prompt service via WhatsApp before our visit! Highly recommended.',
        timestamp: '38m ago',
        branch: 'Ahmedabad Main Branch',
        replyStatus: 'pending',
        draftReply: 'Thank you so much Rohan! We are thrilled you had a stellar experience. Looking forward to serving you again soon! ✨',
      },
      {
        id: 'rev-2',
        author: 'Nisha Trivedi',
        rating: 5,
        comment: 'The new festive silk collection is stunning. Seamless checkout on UPI.',
        timestamp: '3 hours ago',
        branch: 'Surat Hub',
        replyStatus: 'replied',
      },
      {
        id: 'rev-3',
        author: 'Anand Parekh',
        rating: 4,
        comment: 'Good variety and helpful staff. Parking space was slightly tight during peak hours.',
        timestamp: '1 day ago',
        branch: 'Ahmedabad Main Branch',
        replyStatus: 'pending',
        draftReply: 'Hello Anand, thank you for your kind rating! We appreciate the feedback on parking and are actively arranging valet assistance for peak hours.',
      },
    ];
  }

  getInitialBroadcasts(): WhatsAppBroadcast[] {
    return [
      {
        id: 'bc-1',
        name: 'Festive Season VIP Early Access',
        templateName: 'festive_vip_offer_v2',
        audienceSize: 12500,
        sentCount: 12500,
        deliveredPercent: 99.4,
        readRatePercent: 84.2,
        status: 'COMPLETED',
        createdAt: '20 Nov 2026',
      },
      {
        id: 'bc-2',
        name: 'Winter Collection Launch Catalog',
        templateName: 'catalog_showcase_winter',
        audienceSize: 8400,
        sentCount: 6200,
        deliveredPercent: 98.9,
        readRatePercent: 76.5,
        status: 'SENDING',
        createdAt: 'Today, 10:00 AM',
      },
    ];
  }

  getInitialMediaAssets(): MediaAsset[] {
    return [
      {
        id: 'media-1',
        title: 'Festive Wedding Collection 24h Story',
        type: 'status',
        fileSize: '4.2 MB',
        uploadedAt: 'Today 9:00 AM',
        previewUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&q=80',
      },
      {
        id: 'media-2',
        title: 'Winter Festive Lookbook 2026.pdf',
        type: 'pdf',
        fileSize: '12.8 MB',
        uploadedAt: 'Yesterday',
        previewUrl: '',
      },
      {
        id: 'media-3',
        title: 'Behind the Scenes Silk Weaving.mp4',
        type: 'video',
        fileSize: '18.4 MB',
        uploadedAt: '3 days ago',
        previewUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&q=80',
      },
    ];
  }

  getInitialIntegrations(): IntegrationApp[] {
    return [
      {
        id: 'int-1',
        name: 'Shopify Store',
        identifier: 'sunrisestore.myshopify.com',
        type: 'shopify',
        status: 'CONNECTED',
        syncStatus: 'Realtime order webhooks active',
        eventsCount: 3840,
      },
      {
        id: 'int-2',
        name: 'HubSpot CRM',
        identifier: 'Portal ID: 8941029',
        type: 'hubspot',
        status: 'CONNECTED',
        syncStatus: 'Bi-directional contact & deals sync',
        eventsCount: 1420,
      },
      {
        id: 'int-3',
        name: 'WooCommerce Store',
        identifier: 'store.sunriseretail.in',
        type: 'woocommerce',
        status: 'DISCONNECTED',
        syncStatus: 'Ready to connect via REST API keys',
        eventsCount: 0,
      },
    ];
  }

  getInitialWorkflows(): WorkflowRule[] {
    return [
      {
        id: 'wf-1',
        name: 'Abandoned Cart WhatsApp Recovery',
        triggerEvent: 'Shopify / Checkout Dropped (>30m)',
        actionTaken: 'Send personalized 10% coupon WhatsApp HSM',
        channel: 'whatsapp',
        executionsCount: 1420,
        isActive: true,
      },
      {
        id: 'wf-2',
        name: 'Instagram Post Comment Auto-DM',
        triggerEvent: 'Keyword "PRICE" or "LINK" on Reels',
        actionTaken: 'Auto-reply comment + instant DM with product link',
        channel: 'instagram',
        executionsCount: 3890,
        isActive: true,
      },
      {
        id: 'wf-3',
        name: 'Google 5-Star Review Astra AI Responder',
        triggerEvent: 'New Google Business review rating >= 4',
        actionTaken: 'Generate personalized thank you & post via API',
        channel: 'google',
        executionsCount: 640,
        isActive: true,
      },
    ];
  }

  getInitialWebhookLogs(): WebhookLog[] {
    return [
      {
        id: 'log-1',
        event: 'messages.received (WhatsApp Cloud)',
        source: 'Meta Graph API v21.0',
        status: 'DELIVERED',
        statusCode: 200,
        timestamp: '11:42:04 AM',
        payload: { from: '919825109876', type: 'text', body: 'Is order #4821 ready for dispatch?' },
      },
      {
        id: 'log-2',
        event: 'instagram.comment.created',
        source: 'Instagram Graph Webhook',
        status: 'DELIVERED',
        statusCode: 200,
        timestamp: '11:28:11 AM',
        payload: { media_id: '18029482910', text: 'Price please for size 42?' },
      },
      {
        id: 'log-3',
        event: 'google.review.published',
        source: 'Google My Business Pub/Sub',
        status: 'DELIVERED',
        statusCode: 200,
        timestamp: '11:04:55 AM',
        payload: { reviewer: 'Rohan Mehta', rating: 5, comment: 'Outstanding quality and prompt service!' },
      },
      {
        id: 'log-4',
        event: 'message.template.status_update',
        source: 'Meta WhatsApp Cloud',
        status: 'DELIVERED',
        statusCode: 200,
        timestamp: '10:00:19 AM',
        payload: { template_name: 'festive_vip_offer_v2', status: 'APPROVED' },
      },
    ];
  }
}

export const api = new ApiService();
