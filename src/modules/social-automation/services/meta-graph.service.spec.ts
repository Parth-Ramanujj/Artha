import { MetaGraphService } from './meta-graph.service';

type Call = { url: string; method: string };

function mockFetch(responses: Record<string, object>): Call[] {
  const calls: Call[] = [];
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const url = input;
    calls.push({ url, method: init?.method ?? 'GET' });
    const key = Object.keys(responses).find(k => url.includes(k));
    const body = key ? responses[key] : { error: { message: 'unexpected call' } };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 'error' in body ? 400 : 200 }));
  }) as typeof fetch;
  return calls;
}

describe('MetaGraphService.connectAccount', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('Instagram with a User token: swaps in the Page token and subscribes the Page', async () => {
    const calls = mockFetch({
      '/178?': { id: '178', username: 'shop' },
      '/99?': { access_token: 'PAGE_TOKEN' },
      '/99/subscribed_apps': { success: true },
    });
    const res = await new MetaGraphService().connectAccount('instagram', '178', 'USER_TOKEN', '99');

    expect(res).toMatchObject({ valid: true, name: 'shop', pageAccessToken: 'PAGE_TOKEN' });
    expect(res.webhookError).toBeUndefined();
    const sub = calls.find(c => c.url.includes('/99/subscribed_apps'));
    expect(sub?.method).toBe('POST');
    expect(sub?.url).toContain('subscribed_fields=feed');
    expect(sub?.url).toContain('access_token=PAGE_TOKEN');
  });

  it('reports a failed Page subscription without failing the connection', async () => {
    mockFetch({
      '/99?': { id: '99', name: 'My Page', access_token: 'PAGE_TOKEN' },
      '/99/subscribed_apps': { error: { message: 'Missing pages_manage_metadata', code: 200 } },
    });
    const res = await new MetaGraphService().connectAccount('facebook', '99', 'USER_TOKEN', '99');
    expect(res.valid).toBe(true);
    expect(res.webhookError).toContain('pages_manage_metadata');
  });

  it('an invalid token is not connected and nothing is subscribed', async () => {
    const calls = mockFetch({ '/178?': { error: { message: 'Invalid OAuth access token' } } });
    const res = await new MetaGraphService().connectAccount('instagram', '178', 'BAD', '99');
    expect(res).toMatchObject({ valid: false, error: 'Invalid OAuth access token' });
    expect(calls.some(c => c.url.includes('subscribed_apps'))).toBe(false);
  });
});
