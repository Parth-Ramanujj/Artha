import { createHmac, randomBytes } from 'node:crypto';

const API = 'https://api.x.com';
const TIMEOUT_MS = 20_000;

/** The four values of an X app's "Keys and tokens" page (OAuth 1.0a user context). */
export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/** RFC 3986 percent-encoding as X requires it: only A-Z a-z 0-9 - . _ ~ stay as they are. */
export const percentEncode = (v: string): string =>
  encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * OAuth 1.0a Authorization header. `params` are the query and form-body values being sent. shortcut: a JSON
 * body is not signed (RFC 5849 signs form bodies only); X's own pages do not say so for /2/tweets, so verify
 * against a real account.
 */
export function oauthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  creds: XCredentials,
  nonce = randomBytes(16).toString('hex'),
  timestamp = String(Math.floor(Date.now() / 1000)),
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const pairs = Object.entries({ ...params, ...oauth })
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1));
  const parameterString = pairs.map(([k, v]) => `${k}=${v}`).join('&');
  const base = [method.toUpperCase(), percentEncode(url), percentEncode(parameterString)].join('&');
  const key = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = createHmac('sha1', key).update(base).digest('base64');
  return (
    'OAuth ' +
    Object.entries({ ...oauth, oauth_signature: signature })
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(', ')
  );
}

interface XReply<T> {
  data?: T;
  detail?: string;
  title?: string;
  errors?: Array<{ message?: string }>;
}

async function call<T>(creds: XCredentials, method: 'GET' | 'POST', path: string, json?: unknown): Promise<T> {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: oauthHeader(method, url, {}, creds),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as XReply<T>;
  if (!res.ok || !body.data) {
    throw new Error(body.detail || body.errors?.[0]?.message || body.title || `X returned ${res.status}`);
  }
  return body.data;
}

/** The account the keys belong to (costs one user read, $0.010 on pay-per-use). */
export const xGetMe = (creds: XCredentials) => call<{ id: string; username: string }>(creds, 'GET', '/2/users/me');

/** Posts text (a standard post costs $0.015, one with a URL $0.200); returns the post id. */
export async function xCreatePost(creds: XCredentials, text: string): Promise<string> {
  return (await call<{ id: string }>(creds, 'POST', '/2/tweets', { text })).id;
}
