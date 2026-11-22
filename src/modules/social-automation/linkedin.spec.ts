import { linkedinAuthorizeUrl, linkedinExchangeCode, linkedinPost } from './services/linkedin.api';
import { SocialAutomationService } from './social-automation.service';

const app = { clientId: 'cid', clientSecret: 'secret', redirectUri: 'https://api.example.com/cb' };

describe('LinkedIn API', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds the consent link with space-separated scopes', () => {
    const url = new URL(linkedinAuthorizeUrl(app, 'st'));
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'https://api.example.com/cb',
      state: 'st',
      scope: 'openid profile w_member_social',
    });
  });

  it('exchanges the code as a form post and computes the expiry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ access_token: 'tok', expires_in: 5184000 }),
    } as Response);
    const before = Date.now();
    const res = await linkedinExchangeCode(app, 'code1');
    expect(res.accessToken).toBe('tok');
    expect(res.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 5184000 * 1000);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    const form = init?.body as URLSearchParams;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('code1');
  });

  it('posts a public text share and returns the X-RestLi-Id header', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'x-restli-id': 'urn:li:share:1' }),
    } as Response);
    await expect(linkedinPost('tok', 'abc', 'Hello')).resolves.toBe('urn:li:share:1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.linkedin.com/v2/ugcPosts');
    expect((init?.headers as Record<string, string>)['X-Restli-Protocol-Version']).toBe('2.0.0');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      author: 'urn:li:person:abc',
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: 'Hello' } } },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    });
  });

  it('surfaces the LinkedIn error message', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid access token' }),
    } as Response);
    await expect(linkedinPost('tok', 'abc', 'Hello')).rejects.toThrow('Invalid access token');
  });
});

describe('LinkedIn sign-in', () => {
  afterEach(() => jest.restoreAllMocks());

  function make() {
    const accountRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: (v: Record<string, unknown>) => v,
      save: jest.fn((v: unknown) => Promise.resolve(v)),
    };
    const none = {} as never;
    return { service: new SocialAutomationService(accountRepo as never, none, none, none, none, none), accountRepo };
  }

  it('connects the member once per sign-in link and refuses a reused or unknown state', async () => {
    process.env.LINKEDIN_CLIENT_ID = 'cid';
    process.env.LINKEDIN_CLIENT_SECRET = 'secret';
    const { service, accountRepo } = make();
    const { url } = service.linkedinConnectUrl('biz', 'https://api.example.com', 'https://app.example.com');
    const state = new URL(url).searchParams.get('state') ?? '';
    expect(new URL(url).searchParams.get('redirect_uri')).toBe(
      'https://api.example.com/api/social-automation/webhook/linkedin/callback',
    );

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok', expires_in: 100 }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sub: 'm1', name: 'Asha P' }) } as Response);
    await expect(service.completeLinkedin('code', state)).resolves.toEqual({ returnTo: 'https://app.example.com' });
    expect(accountRepo.save.mock.calls[0][0]).toMatchObject({
      businessId: 'biz',
      platform: 'linkedin',
      accountId: 'm1',
      accountName: 'Asha P',
      accessToken: 'tok',
      status: 'connected',
    });

    await expect(service.completeLinkedin('code', state)).rejects.toThrow('expired');
    await expect(service.completeLinkedin('code', 'made-up')).rejects.toThrow('expired');
  });
});
