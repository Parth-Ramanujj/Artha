/**
 * Artha JavaScript/TypeScript SDK.
 *
 * Official client library for the Artha WhatsApp API Gateway.
 *
 * @example
 * ```typescript
 * import { ArthaClient, ArthaApiError } from '@rmyndharis/artha';
 *
 * const client = new ArthaClient({
 *   baseUrl: 'http://localhost:2785',
 *   apiKey: 'owa_k1_…',
 * });
 *
 * await client.sessions.start('my-session');
 * const result = await client.messages.sendText('my-session', {
 *   chatId: '628123456789@c.us',
 *   text: 'Hello from the Artha SDK!',
 * });
 * console.log(result.messageId);
 * ```
 *
 * @packageDocumentation
 */

export { ArthaClient } from './client.js';
export { default } from './client.js';
export type { ArthaClientOptions } from './client.js';
export * from './errors.js';
export type * from './types.js';
export type { BinaryResponse, ClientConfig, FetchLike, HttpMethod, RequestOptions } from './http.js';
export { buildUrl, warnIfInsecureHttpUrl } from './http.js';
