/**
 * WhatsApp Cloud API (Official) Engine Adapter
 *
 * Uses Meta's Graph API v21.0 to send messages and media. Incoming messages arrive
 * via the Cloud API webhook receiver (see cloud-api-webhook module), which calls
 * `dispatchWebhookPayload` on the adapter to convert Meta's format into the neutral
 * IncomingMessage shape.
 *
 * Required env / config:
 *   CLOUD_API_ACCESS_TOKEN   – permanent or long-lived system-user token
 *   CLOUD_API_PHONE_NUMBER_ID – the phone number id from Meta Business Manager
 *   CLOUD_API_WABA_ID         – WhatsApp Business Account ID
 *   CLOUD_API_VERIFY_TOKEN    – webhook verification token (shared secret)
 *   CLOUD_API_APP_SECRET      – Meta App Secret for payload signature validation
 *
 * Limitations vs unofficial engines:
 *   - No QR code / pairing – auth is token-based
 *   - Many features (groups, contacts, channels, statuses, labels, catalogs) are
 *     not available through the Cloud API and throw EngineNotSupportedError (501)
 *   - Outbound conversations outside the 24-hour window require approved templates
 */

import { EventEmitter } from 'events';
import * as https from 'https';
import * as http from 'http';
import { randomUUID } from 'crypto';
import { createLogger } from '../../common/services/logger.service';
import { EngineNotSupportedError } from '../../common/errors/engine-not-supported.error';
import {
  IWhatsAppEngine,
  EngineStatus,
  EngineEventCallbacks,
  MessageResult,
  MediaInput,
  IncomingMessage,
  Contact,
  Group,
  GroupInfo,
  ParticipantOperationResult,
  ContactCard,
  LocationInput,
  PollInput,
  MessageReaction,
  Label,
  Channel,
  ChannelMessage,
  Status,
  StatusPostOptions,
  StatusResult,
  Catalog,
  Product,
  ProductQueryOptions,
  PaginatedProducts,
  ChatSummary,
  ChatState,
  DeliveryStatus,
  MessageType,
  ReactionEvent,
} from '../interfaces/whatsapp-engine.interface';
import type { ChatKind } from '../identity/wa-id';
import { CATALOG_MAX, formatPrice } from './catalog-format';

const GRAPH_API_VERSION = 'v21.0';

/**
 * A WhatsApp Form submission (`nfm_reply`): "field: value" lines for the inbox, plus the flow token
 * and answers for code that tracks submissions. A reply with unreadable JSON keeps Meta's own text.
 */
export function parseFlowResponse(reply: Record<string, unknown> | undefined): {
  body: string;
  flowReply?: { flowToken: string; answers: Record<string, unknown> };
} {
  const fallback = typeof reply?.body === 'string' ? reply.body : '';
  try {
    const raw = typeof reply?.response_json === 'string' ? reply.response_json : '';
    const { flow_token: flowToken, ...answers } = JSON.parse(raw) as Record<string, unknown>;
    const lines = Object.entries(answers).map(
      ([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
    );
    return {
      body: lines.length ? lines.join('\n') : fallback,
      ...(typeof flowToken === 'string' ? { flowReply: { flowToken, answers } } : {}),
    };
  } catch {
    return { body: fallback };
  }
}

export interface CloudApiAdapterConfig {
  sessionId: string;
  accessToken: string;
  phoneNumberId: string;
  wabaId?: string;
  verifyToken?: string;
  appSecret?: string;
  appId?: string;
  graphApiVersion?: string;
}

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

interface GraphApiResponse {
  messaging_product?: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: { message: string; type: string; code: number; fbtrace_id: string };
}

export class CloudApiAdapter extends EventEmitter implements IWhatsAppEngine {
  private readonly logger = createLogger('CloudApiAdapter');
  private accessToken: string;
  private readonly phoneNumberId: string;
  private readonly wabaId: string;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly graphBase: string;
  private status: EngineStatus = EngineStatus.DISCONNECTED;
  private callbacks: EngineEventCallbacks = {};
  private phoneNumber: string | null = null;
  private displayName: string | null = null;
  private readonly lastMessageIdByChat = new Map<string, string>();
  private tokenExchangeAttempted = false;
  readonly sessionId: string;

  getPhoneNumberId(): string {
    return this.phoneNumberId;
  }

  constructor(config: CloudApiAdapterConfig) {
    super();
    this.sessionId = config.sessionId;
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.wabaId = config.wabaId ?? '';
    this.appId = config.appId ?? '';
    this.appSecret = config.appSecret ?? '';
    const version = config.graphApiVersion ?? GRAPH_API_VERSION;
    this.graphBase = `https://graph.facebook.com/${version}`;
  }

  // ============================================================================
  // Graph API HTTP helpers
  // ============================================================================

  private ensureReady(): void {
    if (this.status !== EngineStatus.READY) {
      throw new Error(`Cloud API engine is not ready (status: ${this.status})`);
    }
  }

  private async graphRequest<T = unknown>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    try {
      return await this.graphRequestRaw<T>(method, path, body);
    } catch (error) {
      if (error instanceof TokenExpiredError && !this.tokenExchangeAttempted) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          return this.graphRequestRaw<T>(method, path, body);
        }
      }
      throw error;
    }
  }

  private graphRequestRaw<T = unknown>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };
    let payload: string | undefined;
    if (body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    return this.graphSend<T>(method, path, headers, payload);
  }

  /** Multipart upload for the Graph endpoints that take a file (Flow JSON assets). */
  private graphMultipart<T = unknown>(
    path: string,
    fields: Record<string, string>,
    file: { filename: string; contentType: string; data: Buffer },
  ): Promise<T> {
    const boundary = `----openwa${randomUUID()}`;
    const crlf = '\r\n';
    const parts: Uint8Array[] = Object.entries(fields).map(([name, value]) =>
      Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`),
    );
    parts.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="${file.filename}"${crlf}` +
          `Content-Type: ${file.contentType}${crlf}${crlf}`,
      ),
      file.data,
      Buffer.from(`${crlf}--${boundary}--${crlf}`),
    );
    return this.graphSend<T>(
      'POST',
      path,
      { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      Buffer.concat(parts),
    );
  }

  private graphSend<T = unknown>(
    method: string,
    path: string,
    headers: Record<string, string>,
    payload?: string | Uint8Array,
  ): Promise<T> {
    const url = `${this.graphBase}${path}`;
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));

    return new Promise<T>((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
        timeout: 30_000,
      };

      const req = https.request(options, res => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            const data = JSON.parse(raw) as Record<string, unknown>;
            if (data.error) {
              const err = data.error as { message: string; code: number; error_subcode?: number };
              if (err.code === 190) {
                reject(
                  new TokenExpiredError(
                    `Access token expired. ${this.appId && this.appSecret ? 'Attempting auto-refresh...' : 'Set CLOUD_API_APP_ID and CLOUD_API_APP_SECRET to enable auto-refresh, or generate a new token at https://developers.facebook.com and update CLOUD_API_ACCESS_TOKEN.'}`,
                  ),
                );
              } else {
                reject(new Error(`Graph API error ${err.code}: ${err.message}`));
              }
            } else {
              resolve(data as T);
            }
          } catch {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Graph API HTTP ${res.statusCode}: ${raw}`));
            } else {
              resolve(raw as unknown as T);
            }
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Graph API request timed out after 30s'));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  private async sendMessage(to: string, messageBody: Record<string, unknown>): Promise<MessageResult> {
    this.ensureReady();
    const response = await this.graphRequest<GraphApiResponse>('POST', `/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...messageBody,
    });

    const messageId = response.messages?.[0]?.id ?? `cloud_${Date.now()}`;
    return { id: messageId, timestamp: Math.floor(Date.now() / 1000) };
  }

  private toE164(chatId: string): string {
    return chatId.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
  }

  private toNeutralJid(phone: string): string {
    return `${phone.replace(/\D/g, '')}@c.us`;
  }

  // ============================================================================
  // Token management
  // ============================================================================

  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
    this.tokenExchangeAttempted = false;
    this.logger.log('Access token updated at runtime', { action: 'token_updated' });
  }

  private async tryRefreshToken(): Promise<boolean> {
    this.tokenExchangeAttempted = true;

    if (!this.appId || !this.appSecret) {
      this.logger.warn(
        'Cannot refresh token: CLOUD_API_APP_ID and CLOUD_API_APP_SECRET are required',
        'CloudApiAdapter',
      );
      return false;
    }

    this.logger.log('Attempting to exchange for long-lived token...', { action: 'token_exchange_start' });

    try {
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: this.accessToken,
      });
      const path = `/oauth/access_token?${params.toString()}`;
      const result = await this.graphRequestRaw<{
        access_token?: string;
        token_type?: string;
        expires_in?: number;
      }>('GET', path);

      if (result.access_token) {
        this.accessToken = result.access_token;
        const expiresIn = result.expires_in ? `${Math.round(result.expires_in / 86400)} days` : 'unknown';
        this.logger.log(`Token exchanged successfully, expires in ${expiresIn}`, { action: 'token_exchange_success' });
        return true;
      }

      this.logger.warn('Token exchange returned no access_token', 'CloudApiAdapter');
      return false;
    } catch (error) {
      this.logger.error(
        'Token exchange failed — generate a new token at https://developers.facebook.com',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(callbacks: EngineEventCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.status = EngineStatus.INITIALIZING;
    callbacks.onStateChanged?.(this.status);

    try {
      const info = await this.graphRequest<{
        verified_name?: string;
        display_phone_number?: string;
        id?: string;
      }>('GET', `/${this.phoneNumberId}?fields=verified_name,display_phone_number`);

      this.phoneNumber = info.display_phone_number ?? null;
      this.displayName = info.verified_name ?? null;

      this.status = EngineStatus.READY;
      callbacks.onStateChanged?.(this.status);
      callbacks.onReady?.(this.phoneNumber ?? this.phoneNumberId, this.displayName ?? 'Cloud API');

      this.logger.log('Cloud API engine ready', {
        action: 'cloud_api_ready',
        phoneNumber: this.phoneNumber,
        displayName: this.displayName,
      });
    } catch (error) {
      this.status = EngineStatus.FAILED;
      callbacks.onStateChanged?.(this.status);
      const reason = error instanceof Error ? error.message : String(error);

      if (error instanceof TokenExpiredError) {
        callbacks.onError?.(
          `Token expired. ${this.appId && this.appSecret ? 'Auto-refresh was attempted but the original token is no longer valid for exchange.' : 'To fix: generate a new long-lived token at https://developers.facebook.com → your app → WhatsApp → API Setup, then update CLOUD_API_ACCESS_TOKEN and restart the session.'}`,
        );
        this.logger.error('Cloud API token expired', reason);
      } else {
        callbacks.onError?.(reason);
        this.logger.error('Cloud API initialization failed', reason);
      }
    }
  }

  async disconnect(): Promise<void> {
    this.status = EngineStatus.DISCONNECTED;
    this.callbacks.onStateChanged?.(this.status);
    this.callbacks.onDisconnected?.('manual disconnect');
  }

  async logout(): Promise<void> {
    await this.disconnect();
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.removeAllListeners();
  }

  async forceDestroy(): Promise<void> {
    await this.destroy();
  }

  // ============================================================================
  // Status
  // ============================================================================

  getStatus(): EngineStatus {
    return this.status;
  }

  async probeLiveness(): Promise<boolean> {
    if (this.status !== EngineStatus.READY) return false;
    try {
      await this.graphRequest('GET', `/${this.phoneNumberId}?fields=id`);
      return true;
    } catch {
      return false;
    }
  }

  getQRCode(): string | null {
    return null;
  }

  async requestPairingCode(_phoneNumber: string): Promise<string> {
    throw new EngineNotSupportedError('requestPairingCode');
  }

  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }

  getPushName(): string | null {
    return this.displayName;
  }

  // ============================================================================
  // Webhook payload dispatch (called by CloudApiWebhookController)
  // ============================================================================

  dispatchWebhookPayload(body: Record<string, unknown>): void {
    try {
      const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
      if (!entry) return;

      const changes = entry.changes as Array<Record<string, unknown>>;
      if (!changes) return;

      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value as Record<string, unknown>;
        if (!value) continue;

        const messages = value.messages as Array<Record<string, unknown>>;
        const contacts = value.contacts as Array<Record<string, unknown>>;
        const statuses = value.statuses as Array<Record<string, unknown>>;
        const metadata = value.metadata as Record<string, unknown>;

        if (messages) {
          for (const msg of messages) {
            const contactInfo = contacts?.find((c: Record<string, unknown>) => c.wa_id === msg.from);
            const incoming = this.mapIncomingMessage(msg, contactInfo, metadata);
            if (incoming) {
              this.lastMessageIdByChat.set(incoming.chatId, incoming.id);
              this.callbacks.onMessage?.(incoming);
            }
          }
        }

        if (statuses) {
          for (const st of statuses) {
            this.mapStatusUpdate(st);
          }
        }
      }
    } catch (error) {
      this.logger.error(
        'Failed to process Cloud API webhook payload',
        error instanceof Error ? error.message : String(error),
        { action: 'cloud_api_webhook_error' },
      );
    }
  }

  private mapIncomingMessage(
    msg: Record<string, unknown>,
    contactInfo: Record<string, unknown> | undefined,
    metadata: Record<string, unknown> | undefined,
  ): IncomingMessage | null {
    const id = msg.id as string;
    const fromPhone = msg.from as string;
    const timestamp = parseInt(msg.timestamp as string, 10);
    const msgType = msg.type as string;

    const from = this.toNeutralJid(fromPhone);
    const toPhone = (metadata?.display_phone_number as string) ?? this.phoneNumber ?? '';
    const to = this.toNeutralJid(toPhone);

    const base: IncomingMessage = {
      id,
      from,
      to,
      chatId: from,
      body: '',
      type: this.mapMessageType(msgType),
      timestamp,
      fromMe: false,
      isGroup: false,
      kind: 'user' as ChatKind,
      contact: contactInfo
        ? {
            id: from,
            number: fromPhone,
            pushName: (contactInfo.profile as Record<string, unknown>)?.name as string,
            name: (contactInfo.profile as Record<string, unknown>)?.name as string,
          }
        : undefined,
    };

    switch (msgType) {
      case 'text': {
        const textObj = msg.text as Record<string, unknown>;
        base.body = (textObj?.body as string) ?? '';
        break;
      }
      case 'image':
      case 'video':
      case 'audio':
      case 'document':
      case 'sticker': {
        const mediaObj = msg[msgType] as Record<string, unknown>;
        if (mediaObj) {
          base.body = (mediaObj.caption as string) ?? '';
          base.media = {
            mimetype: (mediaObj.mime_type as string) ?? 'application/octet-stream',
            filename: mediaObj.filename as string | undefined,
          };
        }
        break;
      }
      case 'location': {
        const loc = msg.location as Record<string, unknown>;
        if (loc) {
          base.location = {
            latitude: loc.latitude as number,
            longitude: loc.longitude as number,
            description: loc.name as string | undefined,
            address: loc.address as string | undefined,
            url: loc.url as string | undefined,
          };
          base.body = (loc.name as string) ?? '';
        }
        break;
      }
      case 'contacts': {
        base.type = 'contact';
        const contactsArr = msg.contacts as Array<Record<string, unknown>>;
        if (contactsArr?.[0]) {
          const c = contactsArr[0];
          const name = c.name as Record<string, unknown>;
          base.body = (name?.formatted_name as string) ?? '';
        }
        break;
      }
      case 'reaction': {
        const reaction = msg.reaction as Record<string, unknown>;
        if (reaction) {
          const event: ReactionEvent = {
            messageId: reaction.message_id as string,
            chatId: from,
            reaction: (reaction.emoji as string) ?? '',
            senderId: from,
          };
          this.callbacks.onMessageReaction?.(event);
        }
        return null;
      }
      case 'button': {
        const button = msg.button as Record<string, unknown>;
        base.body = (button?.text as string) ?? '';
        break;
      }
      case 'interactive': {
        const interactive = msg.interactive as Record<string, unknown>;
        const interactiveType = interactive?.type as string;
        if (interactiveType === 'button_reply') {
          const buttonReply = interactive?.button_reply as Record<string, unknown>;
          const btnId = (buttonReply?.id as string) ?? '';
          base.body = (btnId || (buttonReply?.title as string)) ?? '';
        } else if (interactiveType === 'list_reply') {
          const listReply = interactive?.list_reply as Record<string, unknown>;
          const listId = (listReply?.id as string) ?? '';
          base.body = (listId || (listReply?.title as string)) ?? '';
        } else if (interactiveType === 'nfm_reply') {
          const parsed = parseFlowResponse(interactive?.nfm_reply as Record<string, unknown> | undefined);
          base.body = parsed.body;
          if (parsed.flowReply) base.flowReply = parsed.flowReply;
        }
        break;
      }
      default:
        base.body = `[${msgType}]`;
        break;
    }

    if (msg.context) {
      const ctx = msg.context as Record<string, unknown>;
      base.quotedMessage = {
        id: ctx.id as string,
        body: '',
      };
    }

    return base;
  }

  private mapMessageType(type: string): MessageType {
    const mapping: Record<string, MessageType> = {
      text: 'text',
      image: 'image',
      video: 'video',
      audio: 'audio',
      voice: 'voice',
      document: 'document',
      sticker: 'sticker',
      location: 'location',
      contacts: 'contact',
      reaction: 'unknown',
      button: 'text',
      interactive: 'text',
    };
    return mapping[type] ?? 'unknown';
  }

  private mapStatusUpdate(st: Record<string, unknown>): void {
    const statusMap: Record<string, DeliveryStatus> = {
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
    };
    const status = statusMap[st.status as string];
    if (status && st.id) {
      this.callbacks.onMessageAck?.(st.id as string, status);
    }
  }

  // ============================================================================
  // Media helpers
  // ============================================================================

  private async uploadMedia(media: MediaInput): Promise<string> {
    const url = `${this.graphBase}/${this.phoneNumberId}/media`;
    const boundary = `----CloudApiBoundary${Date.now()}`;

    let dataBuffer: Buffer;
    if (Buffer.isBuffer(media.data)) {
      dataBuffer = media.data;
    } else if (typeof media.data === 'string') {
      if (media.data.startsWith('http://') || media.data.startsWith('https://')) {
        dataBuffer = await this.downloadUrl(media.data);
      } else {
        dataBuffer = Buffer.from(media.data, 'base64');
      }
    } else {
      throw new Error('Invalid media data type');
    }

    const filename = media.filename ?? 'file';
    const parts: Buffer[] = [];

    parts.push(
      Buffer.from(
        `--${boundary}\r\n` + `Content-Disposition: form-data; name="messaging_product"\r\n\r\n` + `whatsapp\r\n`,
      ),
    );

    parts.push(
      Buffer.from(
        `--${boundary}\r\n` + `Content-Disposition: form-data; name="type"\r\n\r\n` + `${media.mimetype}\r\n`,
      ),
    );

    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: ${media.mimetype}\r\n\r\n`,
      ),
    );
    parts.push(dataBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    return new Promise<string>((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = https.request(
        {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        },
        res => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString()) as { id?: string; error?: { message: string } };
              if (data.id) {
                resolve(data.id);
              } else {
                reject(new Error(data.error?.message ?? 'Media upload failed'));
              }
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private downloadUrl(fileUrl: string, redirectsLeft = 5): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const mod = fileUrl.startsWith('https') ? https : http;
      mod
        .get(fileUrl, { timeout: 30_000 }, res => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }
            this.downloadUrl(res.headers.location, redirectsLeft - 1).then(resolve, reject);
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    });
  }

  private async sendMediaMessage(
    chatId: string,
    media: MediaInput,
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
  ): Promise<MessageResult> {
    const to = this.toE164(chatId);

    let mediaPayload: Record<string, unknown>;

    if (typeof media.data === 'string' && (media.data.startsWith('http://') || media.data.startsWith('https://'))) {
      mediaPayload = { link: media.data };
    } else {
      const mediaId = await this.uploadMedia(media);
      mediaPayload = { id: mediaId };
    }

    if (media.caption) {
      mediaPayload.caption = media.caption;
    }
    if (media.filename && type === 'document') {
      mediaPayload.filename = media.filename;
    }

    return this.sendMessage(to, { type, [type]: mediaPayload });
  }

  // ============================================================================
  // Messaging - Basic
  // ============================================================================

  async sendTextMessage(chatId: string, text: string, _mentions?: string[]): Promise<MessageResult> {
    const to = this.toE164(chatId);
    return this.sendMessage(to, {
      type: 'text',
      text: { preview_url: true, body: text },
    });
  }

  async sendImageMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media, 'image');
  }

  async sendVideoMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media, 'video');
  }

  async sendAudioMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media, 'audio');
  }

  async sendDocumentMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media, 'document');
  }

  // ============================================================================
  // Messaging - Extended
  // ============================================================================

  async sendLocationMessage(chatId: string, location: LocationInput): Promise<MessageResult> {
    const to = this.toE164(chatId);
    return this.sendMessage(to, {
      type: 'location',
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.description,
        address: location.address,
      },
    });
  }

  async sendContactMessage(chatId: string, contact: ContactCard): Promise<MessageResult> {
    const to = this.toE164(chatId);
    const nameParts = contact.name.split(' ');
    return this.sendMessage(to, {
      type: 'contacts',
      contacts: [
        {
          name: {
            formatted_name: contact.name,
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' ') || undefined,
          },
          phones: [{ phone: contact.number, type: 'CELL' }],
        },
      ],
    });
  }

  async sendStickerMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return this.sendMediaMessage(chatId, media, 'sticker');
  }

  async sendPollMessage(_chatId: string, _poll: PollInput): Promise<MessageResult> {
    throw new EngineNotSupportedError('sendPollMessage');
  }

  async sendInteractiveButtons(
    chatId: string,
    body: string,
    buttons: Array<{ id?: string; text: string }>,
    title?: string,
    footer?: string,
  ): Promise<MessageResult> {
    const to = this.toE164(chatId);
    if (buttons.length <= 3) {
      const payload = {
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(title ? { header: { type: 'text', text: title } } : {}),
          body: { text: body },
          ...(footer ? { footer: { text: footer } } : {}),
          action: {
            buttons: buttons.map((b, idx) => ({
              type: 'reply',
              reply: {
                id: b.id || `btn_${idx + 1}`,
                title: b.text.slice(0, 20),
              },
            })),
          },
        },
      };
      return this.sendMessage(to, payload);
    } else {
      const payload = {
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(title ? { header: { type: 'text', text: title } } : {}),
          body: { text: body },
          ...(footer ? { footer: { text: footer } } : {}),
          action: {
            button: 'Select Option',
            sections: [
              {
                title: title || 'Options',
                rows: buttons.slice(0, 10).map((b, idx) => ({
                  id: b.id || `btn_${idx + 1}`,
                  title: b.text.slice(0, 24),
                })),
              },
            ],
          },
        },
      };
      return this.sendMessage(to, payload);
    }
  }

  // ============================================================================
  // Reply & Forward
  // ============================================================================

  async replyToMessage(chatId: string, quotedMsgId: string, text: string): Promise<MessageResult> {
    const to = this.toE164(chatId);
    return this.sendMessage(to, {
      type: 'text',
      text: { preview_url: true, body: text },
      context: { message_id: quotedMsgId },
    });
  }

  async forwardMessage(_fromChatId: string, _toChatId: string, _messageId: string): Promise<MessageResult> {
    throw new EngineNotSupportedError('forwardMessage');
  }

  // ============================================================================
  // Reactions
  // ============================================================================

  async reactToMessage(chatId: string, messageId: string, emoji: string): Promise<void> {
    const to = this.toE164(chatId);
    await this.sendMessage(to, {
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    });
  }

  async getMessageReactions(_chatId: string, _messageId: string): Promise<MessageReaction[]> {
    throw new EngineNotSupportedError('getMessageReactions');
  }

  // ============================================================================
  // Contacts
  // ============================================================================

  async getContacts(): Promise<Contact[]> {
    throw new EngineNotSupportedError('getContacts');
  }

  async getContactById(_contactId: string): Promise<Contact | null> {
    throw new EngineNotSupportedError('getContactById');
  }

  async checkNumberExists(_number: string): Promise<boolean> {
    throw new EngineNotSupportedError('checkNumberExists');
  }

  async getNumberId(_number: string): Promise<string | null> {
    throw new EngineNotSupportedError('getNumberId');
  }

  async resolveContactPhone(contactId: string): Promise<string | null> {
    const phone = contactId.replace(/@c\.us$/, '');
    return /^\d+$/.test(phone) ? phone : null;
  }

  // ============================================================================
  // Groups
  // ============================================================================

  async getGroups(): Promise<Group[]> {
    throw new EngineNotSupportedError('getGroups');
  }

  async getGroupInfo(_groupId: string): Promise<GroupInfo | null> {
    throw new EngineNotSupportedError('getGroupInfo');
  }

  async createGroup(_name: string, _participants: string[]): Promise<Group> {
    throw new EngineNotSupportedError('createGroup');
  }

  async addParticipants(_groupId: string, _participants: string[]): Promise<ParticipantOperationResult[]> {
    throw new EngineNotSupportedError('addParticipants');
  }

  async removeParticipants(_groupId: string, _participants: string[]): Promise<ParticipantOperationResult[]> {
    throw new EngineNotSupportedError('removeParticipants');
  }

  async promoteParticipants(_groupId: string, _participants: string[]): Promise<ParticipantOperationResult[]> {
    throw new EngineNotSupportedError('promoteParticipants');
  }

  async demoteParticipants(_groupId: string, _participants: string[]): Promise<ParticipantOperationResult[]> {
    throw new EngineNotSupportedError('demoteParticipants');
  }

  async leaveGroup(_groupId: string): Promise<void> {
    throw new EngineNotSupportedError('leaveGroup');
  }

  async setGroupSubject(_groupId: string, _subject: string): Promise<void> {
    throw new EngineNotSupportedError('setGroupSubject');
  }

  async setGroupDescription(_groupId: string, _description: string): Promise<void> {
    throw new EngineNotSupportedError('setGroupDescription');
  }

  async getGroupInviteCode(_groupId: string): Promise<string> {
    throw new EngineNotSupportedError('getGroupInviteCode');
  }

  async revokeGroupInviteCode(_groupId: string): Promise<string> {
    throw new EngineNotSupportedError('revokeGroupInviteCode');
  }

  async joinGroupViaInviteCode(_inviteCode: string): Promise<string> {
    throw new EngineNotSupportedError('joinGroupViaInviteCode');
  }

  async setGroupMessagesAdminsOnly(_groupId: string, _adminsOnly: boolean): Promise<void> {
    throw new EngineNotSupportedError('setGroupMessagesAdminsOnly');
  }

  async setGroupInfoAdminsOnly(_groupId: string, _adminsOnly: boolean): Promise<void> {
    throw new EngineNotSupportedError('setGroupInfoAdminsOnly');
  }

  async setGroupEphemeral(_groupId: string, _durationSec: number): Promise<void> {
    throw new EngineNotSupportedError('setGroupEphemeral');
  }

  // ============================================================================
  // Message Operations
  // ============================================================================

  async deleteMessage(_chatId: string, _messageId: string, _forEveryone?: boolean): Promise<void> {
    throw new EngineNotSupportedError('deleteMessage');
  }

  async editMessage(_chatId: string, _messageId: string, _body: string): Promise<MessageResult> {
    throw new EngineNotSupportedError('editMessage');
  }

  async getChatHistory(
    _chatId: string,
    _limit?: number,
    _includeMedia?: boolean,
    _mediaMaxBytes?: number,
    _signal?: AbortSignal,
  ): Promise<IncomingMessage[]> {
    throw new EngineNotSupportedError('getChatHistory');
  }

  // ============================================================================
  // Calls
  // ============================================================================

  async rejectCall(_callId: string): Promise<void> {
    throw new EngineNotSupportedError('rejectCall');
  }

  // ============================================================================
  // Contact Extended
  // ============================================================================

  async getProfilePicture(_contactId: string): Promise<string | null> {
    throw new EngineNotSupportedError('getProfilePicture');
  }

  async blockContact(_contactId: string): Promise<void> {
    throw new EngineNotSupportedError('blockContact');
  }

  async unblockContact(_contactId: string): Promise<void> {
    throw new EngineNotSupportedError('unblockContact');
  }

  // ============================================================================
  // Profile (own account)
  // ============================================================================

  async setProfileName(_name: string): Promise<void> {
    throw new EngineNotSupportedError('setProfileName');
  }

  async setProfileStatus(_status: string): Promise<void> {
    throw new EngineNotSupportedError('setProfileStatus');
  }

  async setProfilePicture(_media: MediaInput): Promise<void> {
    throw new EngineNotSupportedError('setProfilePicture');
  }

  // ============================================================================
  // Labels
  // ============================================================================

  async getLabels(): Promise<Label[]> {
    throw new EngineNotSupportedError('getLabels');
  }

  async getLabelById(_labelId: string): Promise<Label | null> {
    throw new EngineNotSupportedError('getLabelById');
  }

  async getChatLabels(_chatId: string): Promise<Label[]> {
    throw new EngineNotSupportedError('getChatLabels');
  }

  async addLabelToChat(_chatId: string, _labelId: string): Promise<void> {
    throw new EngineNotSupportedError('addLabelToChat');
  }

  async removeLabelFromChat(_chatId: string, _labelId: string): Promise<void> {
    throw new EngineNotSupportedError('removeLabelFromChat');
  }

  // ============================================================================
  // Channels / Newsletter
  // ============================================================================

  async getSubscribedChannels(): Promise<Channel[]> {
    throw new EngineNotSupportedError('getSubscribedChannels');
  }

  async getChannelById(_channelId: string): Promise<Channel | null> {
    throw new EngineNotSupportedError('getChannelById');
  }

  async subscribeToChannel(_inviteCode: string): Promise<Channel> {
    throw new EngineNotSupportedError('subscribeToChannel');
  }

  async unsubscribeFromChannel(_channelId: string): Promise<void> {
    throw new EngineNotSupportedError('unsubscribeFromChannel');
  }

  async getChannelMessages(_channelId: string, _limit?: number): Promise<ChannelMessage[]> {
    throw new EngineNotSupportedError('getChannelMessages');
  }

  // ============================================================================
  // Status / Stories
  // ============================================================================

  async getContactStatuses(): Promise<Status[]> {
    throw new EngineNotSupportedError('getContactStatuses');
  }

  async getContactStatus(_contactId: string): Promise<Status[]> {
    throw new EngineNotSupportedError('getContactStatus');
  }

  async postTextStatus(_text: string, _options: StatusPostOptions): Promise<StatusResult> {
    throw new EngineNotSupportedError('postTextStatus');
  }

  async postImageStatus(_media: MediaInput, _options: StatusPostOptions): Promise<StatusResult> {
    throw new EngineNotSupportedError('postImageStatus');
  }

  async postVideoStatus(_media: MediaInput, _options: StatusPostOptions): Promise<StatusResult> {
    throw new EngineNotSupportedError('postVideoStatus');
  }

  async deleteStatus(_statusId: string): Promise<void> {
    throw new EngineNotSupportedError('deleteStatus');
  }

  // ============================================================================
  // Catalog
  // ============================================================================

  /**
   * The Commerce Manager catalog connected to this WhatsApp Business account. Needs the WABA id and a
   * token with catalog_management; null when the account has no catalog.
   */
  async getCatalog(): Promise<Catalog | null> {
    const catalog = await this.commerceCatalog();
    if (!catalog) return null;
    return {
      id: catalog.id,
      name: catalog.name ?? 'Catalog',
      productCount: catalog.product_count ?? (await this.loadCatalogProducts(catalog.id)).length,
      url: `https://wa.me/c/${(this.phoneNumber ?? '').replace(/\D/g, '')}`,
    };
  }

  async getProducts(options?: ProductQueryOptions): Promise<PaginatedProducts> {
    const catalog = await this.commerceCatalog();
    const all = catalog ? await this.loadCatalogProducts(catalog.id) : [];
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const page = Math.max(1, options?.page ?? 1);
    return {
      products: all.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) },
    };
  }

  async getProduct(productId: string): Promise<Product | null> {
    const catalog = await this.commerceCatalog();
    if (!catalog) return null;
    return (
      (await this.loadCatalogProducts(catalog.id)).find(p => p.id === productId || p.retailerId === productId) ?? null
    );
  }

  /** Single-product message; Meta identifies the product by its retailer id (content id) in the catalog. */
  async sendProduct(chatId: string, productId: string, body?: string): Promise<MessageResult> {
    const catalog = await this.commerceCatalog();
    if (!catalog) throw new Error('This WhatsApp Business account has no catalog connected');
    const product = await this.getProduct(productId);
    if (!product?.retailerId) throw new Error(`Product ${productId} is not in the connected catalog`);
    return this.sendInteractiveMessage(chatId, {
      type: 'product',
      ...(body ? { body: { text: body } } : {}),
      action: { catalog_id: catalog.id, product_retailer_id: product.retailerId },
    });
  }

  /** Catalog message: a "View catalog" button that opens the business's catalog in WhatsApp. */
  async sendCatalog(chatId: string, body?: string): Promise<MessageResult> {
    return this.sendInteractiveMessage(chatId, {
      type: 'catalog_message',
      body: { text: body?.trim() || 'Browse our catalog' },
      action: { name: 'catalog_message' },
    });
  }

  private catalogInfo?: { id: string; name?: string; product_count?: number } | null;

  private async commerceCatalog(): Promise<{ id: string; name?: string; product_count?: number } | null> {
    this.ensureReady();
    if (this.catalogInfo !== undefined) return this.catalogInfo;
    if (!this.wabaId) throw new Error('The WhatsApp Business account id (WABA id) is needed to read the catalog');
    const res = await this.graphRequest<{ data?: Array<{ id: string; name?: string; product_count?: number }> }>(
      'GET',
      `/${this.wabaId}/product_catalogs?fields=id,name,product_count`,
    );
    this.catalogInfo = res.data?.[0] ?? null;
    return this.catalogInfo;
  }

  // shortcut: reads the whole catalog (up to CATALOG_MAX) on every call; cache it if catalogs get large.
  private async loadCatalogProducts(catalogId: string): Promise<Product[]> {
    type GraphProduct = {
      id: string;
      name?: string;
      description?: string;
      price?: string;
      currency?: string;
      image_url?: string;
      url?: string;
      availability?: string;
      retailer_id?: string;
    };
    const fields = 'id,name,description,price,currency,image_url,url,availability,retailer_id';
    const out: Product[] = [];
    let after: string | undefined;
    do {
      const page = await this.graphRequest<{
        data?: GraphProduct[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>(
        'GET',
        `/${catalogId}/products?fields=${fields}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      );
      for (const p of page.data ?? []) {
        // Graph returns the price already formatted ("₹1,499.00"); the number is read back out of it.
        const price = Number((p.price ?? '').replace(/[^\d.]/g, '')) || 0;
        const currency = p.currency ?? '';
        out.push({
          id: p.id,
          name: p.name ?? p.retailer_id ?? p.id,
          ...(p.description ? { description: p.description } : {}),
          price,
          currency,
          priceFormatted: p.price ?? formatPrice(price, currency),
          ...(p.image_url ? { imageUrl: p.image_url } : {}),
          url: p.url ?? '',
          isAvailable: (p.availability ?? 'in stock') === 'in stock',
          ...(p.retailer_id ? { retailerId: p.retailer_id } : {}),
        });
      }
      after = page.paging?.next ? page.paging.cursors?.after : undefined;
    } while (after && out.length < CATALOG_MAX);
    return out;
  }

  // ============================================================================
  // Chats
  // ============================================================================

  async getChats(): Promise<ChatSummary[]> {
    throw new EngineNotSupportedError('getChats');
  }

  async sendSeen(chatId: string): Promise<boolean> {
    this.ensureReady();
    const messageId = this.lastMessageIdByChat.get(chatId);
    if (!messageId) {
      this.logger.warn('sendSeen: no tracked message ID for chat', { chatId });
      return false;
    }
    await this.graphRequest('POST', `/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    return true;
  }

  async markUnread(_chatId: string): Promise<boolean> {
    throw new EngineNotSupportedError('markUnread');
  }

  async deleteChat(_chatId: string): Promise<boolean> {
    throw new EngineNotSupportedError('deleteChat');
  }

  async sendChatState(_chatId: string, _state: ChatState): Promise<void> {
    // Cloud API does not support typing indicators — no-op
  }

  // ============================================================================
  // Template Messages (Cloud API specific)
  // ============================================================================

  async sendTemplateMessage(
    chatId: string,
    templateName: string,
    languageCode = 'en_US',
    components?: Array<Record<string, unknown>>,
  ): Promise<MessageResult> {
    const to = this.toE164(chatId);
    const template: Record<string, unknown> = {
      name: templateName,
      language: { code: languageCode },
    };
    if (components) {
      template.components = components;
    }
    return this.sendMessage(to, { type: 'template', template });
  }

  /** Puts an emoji reaction on a customer's message (the message id is the one the webhook gave us). */
  async sendReaction(chatId: string, messageId: string, emoji: string): Promise<MessageResult> {
    const to = this.toE164(chatId);
    return this.sendMessage(to, { type: 'reaction', reaction: { message_id: messageId, emoji } });
  }

  // ============================================================================
  // Interactive Messages (Cloud API specific)
  // ============================================================================

  async sendInteractiveMessage(chatId: string, interactive: Record<string, unknown>): Promise<MessageResult> {
    const to = this.toE164(chatId);
    return this.sendMessage(to, { type: 'interactive', interactive });
  }

  /**
   * The message templates of this WhatsApp Business account, with Meta's approval status. Needs the
   * WABA id (CLOUD_API_WABA_ID); without it Meta has no account to list. First 200 templates.
   */
  async listMessageTemplates(): Promise<
    Array<{
      name: string;
      language: string;
      status: string;
      category: string;
      components: Array<Record<string, unknown>>;
    }>
  > {
    if (!this.wabaId) throw new Error('The WhatsApp Business account id (WABA id) is not configured');
    const res = await this.graphRequest<{ data?: Array<Record<string, unknown>> }>(
      'GET',
      `/${this.wabaId}/message_templates?fields=name,language,status,category,components&limit=200`,
    );
    return (res.data ?? []).map(t => ({
      name: String(t.name ?? ''),
      language: String(t.language ?? ''),
      status: String(t.status ?? ''),
      category: String(t.category ?? ''),
      components: Array.isArray(t.components) ? (t.components as Array<Record<string, unknown>>) : [],
    }));
  }

  // ============================================================================
  // WhatsApp Flows (WhatsApp Forms)
  // ============================================================================

  /** Creates an empty draft flow on this WhatsApp Business account. Returns its id. */
  async createFlow(name: string, categories: string[]): Promise<string> {
    if (!this.wabaId) throw new Error('The WhatsApp Business account id (WABA id) is not configured');
    const res = await this.graphRequest<{ id: string }>('POST', `/${this.wabaId}/flows`, { name, categories });
    return res.id;
  }

  /** Uploads a flow's JSON. Returns Meta's validation errors; an empty list means the JSON was accepted. */
  async uploadFlowJson(
    flowId: string,
    flowJson: Record<string, unknown>,
  ): Promise<Array<{ error?: string; message?: string }>> {
    const res = await this.graphMultipart<{ validation_errors?: Array<{ error?: string; message?: string }> }>(
      `/${flowId}/assets`,
      { name: 'flow.json', asset_type: 'FLOW_JSON' },
      { filename: 'flow.json', contentType: 'application/json', data: Buffer.from(JSON.stringify(flowJson)) },
    );
    return res.validation_errors ?? [];
  }

  async publishFlow(flowId: string): Promise<void> {
    await this.graphRequest('POST', `/${flowId}/publish`);
  }

  // ============================================================================
  // Media download (for downloading media from incoming messages)
  // ============================================================================

  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimetype: string; filename?: string }> {
    const info = await this.graphRequest<{ url: string; mime_type: string; file_size: string }>('GET', `/${mediaId}`);

    const data = await new Promise<Buffer>((resolve, reject) => {
      https
        .get(info.url, { headers: { Authorization: `Bearer ${this.accessToken}` } }, res => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    });

    return { data, mimetype: info.mime_type };
  }
}
