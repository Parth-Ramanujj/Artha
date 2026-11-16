/**
 * Receivers built before the OpenWA → Artha rename read and verify the X-OpenWA-* headers
 * (signature, event, idempotency key…). Every X-Artha-* header is also sent under its old name so
 * those integrations keep working after the upgrade.
 */
export function withLegacyHeaders(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  for (const [key, value] of Object.entries(headers)) {
    if (key.startsWith('X-Artha-')) out[`X-OpenWA-${key.slice('X-Artha-'.length)}`] = value;
  }
  return out;
}

/** Header names only the server may set (custom webhook headers must never forge them). */
export const RESERVED_WEBHOOK_HEADER = /^(content-type|x-artha-|x-openwa-)/i;
