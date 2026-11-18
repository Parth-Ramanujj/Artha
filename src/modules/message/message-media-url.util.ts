import { Message } from './entities/message.entity';
import { stripBase64DataUri } from './media-cap.util';

type StoredMedia = { mimetype?: string; filename?: string; data?: unknown; sizeBytes?: number; url?: string };

const storedMedia = (message: Pick<Message, 'metadata'>): StoredMedia | undefined =>
  (message.metadata as { media?: StoredMedia } | null | undefined)?.media;

/** The row's inline base64 attachment, if it holds one (a remote http(s) URL is not inline). */
export function inlineMediaBase64(message: Pick<Message, 'metadata'>): string | undefined {
  const data = storedMedia(message)?.data;
  if (typeof data !== 'string' || data.length === 0 || /^https?:\/\//i.test(data)) return undefined;
  return stripBase64DataUri(data) || undefined;
}

export const messageMediaUrl = (sessionId: string, messageId: string): string =>
  `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/media`;

/**
 * Opt-in (`omitMedia=true`) list shape: each inline base64 attachment is replaced by a `url` to
 * GET …/messages/:id/media plus its `sizeBytes`, so a chat-list fetch no longer ships every
 * attachment. All other fields, and rows without inline media, are returned untouched.
 * Mutates the freshly loaded entities (they are never saved afterwards).
 */
export function withMediaUrls(sessionId: string, messages: Message[]): Message[] {
  for (const message of messages) {
    const base64 = inlineMediaBase64(message);
    if (!base64) continue;
    const media: StoredMedia = { ...storedMedia(message) };
    delete media.data;
    media.sizeBytes ??= Buffer.byteLength(base64, 'base64');
    media.url = messageMediaUrl(sessionId, message.id);
    message.metadata = { ...message.metadata, media };
  }
  return messages;
}
