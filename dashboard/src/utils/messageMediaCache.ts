/**
 * Object URLs for chat attachments fetched on demand (GET …/messages/:id/media). Shared across chat
 * opens, so re-opening a chat re-uses the blob instead of downloading it again (the response is also
 * browser-cached). Least-recently-used entries past `max` are dropped and their URL revoked so a long
 * session can't pin unbounded blobs; `max` sits above the 100-message chat slice, so the chat being
 * viewed never loses a URL it is still displaying.
 */
export function createMediaCache(
  fetchBlob: (sessionId: string, messageId: string) => Promise<Blob>,
  toUrl: (blob: Blob) => string = blob => URL.createObjectURL(blob),
  revoke: (url: string) => void = url => URL.revokeObjectURL(url),
  max = 150,
) {
  const entries = new Map<string, Promise<string>>();

  return function load(sessionId: string, messageId: string): Promise<string> {
    const key = `${sessionId}/${messageId}`;
    const hit = entries.get(key);
    if (hit) {
      entries.delete(key); // re-insert: Map order doubles as recency order
      entries.set(key, hit);
      return hit;
    }
    const pending = fetchBlob(sessionId, messageId).then(toUrl);
    entries.set(key, pending);
    pending.catch(() => entries.delete(key)); // a failed fetch may be retried later
    for (const [oldKey, oldUrl] of entries) {
      if (entries.size <= max) break;
      entries.delete(oldKey);
      oldUrl.then(revoke, () => undefined);
    }
    return pending;
  };
}
