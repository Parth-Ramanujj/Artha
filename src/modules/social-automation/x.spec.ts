import { oauthHeader, percentEncode, xCreatePost } from './services/x.api';

// The worked example from X's "Creating a signature" page (its keys were invalidated by X).
const docs = {
  creds: {
    apiKey: 'xvz1evFS4wEEPTGEFPHBog',
    apiSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
    accessTokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  },
  nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
  timestamp: '1318622958',
  signature: 'Ls93hJiZbQ3akF3HF3x1Bz8/zU4=',
};

describe('X', () => {
  it('percent-encodes like the docs say', () => {
    expect(percentEncode('Ladies + Gentlemen')).toBe('Ladies%20%2B%20Gentlemen');
    expect(percentEncode('An encoded string!')).toBe('An%20encoded%20string%21');
    expect(percentEncode('Dogs, Cats & Mice')).toBe('Dogs%2C%20Cats%20%26%20Mice');
    expect(percentEncode('☃')).toBe('%E2%98%83');
    expect(percentEncode("a-b.c_d~e'()*")).toBe('a-b.c_d~e%27%28%29%2A');
  });

  it('signs the documented example request with the documented signature', () => {
    const header = oauthHeader(
      'POST',
      'https://api.x.com/1.1/statuses/update.json',
      { status: 'Hello Ladies + Gentlemen, a signed OAuth request!', include_entities: 'true' },
      docs.creds,
      docs.nonce,
      docs.timestamp,
    );
    expect(header).toContain(`oauth_signature="${encodeURIComponent(docs.signature)}"`);
    expect(header.startsWith('OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog", oauth_nonce=')).toBe(true);
  });

  it('posts JSON to /2/tweets and returns the post id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ data: { id: '1346889436626259968', text: 'hi' } }),
    } as Response);
    await expect(xCreatePost(docs.creds, 'hi')).resolves.toBe('1346889436626259968');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.x.com/2/tweets');
    expect(init?.body).toBe('{"text":"hi"}');
    fetchMock.mockRestore();
  });

  it('surfaces X error details', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: () => Promise.resolve({ title: 'CreditsDepleted', detail: 'Your credits are used up.' }),
    } as Response);
    await expect(xCreatePost(docs.creds, 'hi')).rejects.toThrow('Your credits are used up.');
    fetchMock.mockRestore();
  });
});
