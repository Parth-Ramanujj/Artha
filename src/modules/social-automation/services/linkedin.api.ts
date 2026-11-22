const TIMEOUT_MS = 20_000;
/** openid + profile give the member id (sub) and name; w_member_social lets us post as the member. */
export const LINKEDIN_SCOPES = 'openid profile w_member_social';

export interface LinkedinApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function linkedinAuthorizeUrl(app: LinkedinApp, state: string): string {
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', app.clientId);
  url.searchParams.set('redirect_uri', app.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', LINKEDIN_SCOPES);
  return url.toString();
}

async function json(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = body.error_description ?? body.message ?? body.error;
    throw new Error(typeof msg === 'string' && msg ? msg : `LinkedIn returned ${res.status}`);
  }
  return body;
}

/** Swaps the sign-in code (valid 30 minutes) for an access token (LinkedIn issues them for 60 days). */
export async function linkedinExchangeCode(
  app: LinkedinApp,
  code: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: app.redirectUri,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await json(res);
  const token = typeof body.access_token === 'string' ? body.access_token : '';
  if (!token) throw new Error('LinkedIn did not return an access token');
  const seconds = Number(body.expires_in) || 60 * 24 * 60 * 60;
  return { accessToken: token, expiresAt: new Date(Date.now() + seconds * 1000) };
}

/** The signed-in member: `sub` is the id used in urn:li:person:{sub}. */
export async function linkedinMe(token: string): Promise<{ sub: string; name: string }> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await json(res);
  const sub = typeof body.sub === 'string' ? body.sub : '';
  if (!sub) throw new Error('LinkedIn did not return the member id');
  return { sub, name: typeof body.name === 'string' ? body.name : '' };
}

/** Publishes a public text post on the member's profile (Share on LinkedIn); returns the post URN. */
export async function linkedinPost(token: string, personId: string, text: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${personId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'NONE' },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) await json(res);
  const id = res.headers.get('x-restli-id');
  if (!id) throw new Error('LinkedIn did not return the post id');
  return id;
}
