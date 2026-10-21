import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { decryptSecret, encryptSecret } from './google-token-crypto';
import { GoogleWorkspaceService } from './google-workspace.service';
import { Integration, IntegrationType } from '../entities/integration.entity';

const env = { ...process.env };

describe('Google Workspace sign-in', () => {
  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-key-for-unit-tests';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.test/api/google/oauth/callback';
  });

  afterEach(() => {
    process.env = { ...env };
  });

  const service = () => new GoogleWorkspaceService({} as never);

  it('encrypts a refresh token and reads it back, and never stores it in plain text', () => {
    const secret = '1//refresh-token-value';
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
  });

  it('refuses to store a token when no encryption key is set', () => {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow('GOOGLE_TOKEN_ENCRYPTION_KEY is not set');
  });

  it('builds a consent URL with the chosen services, offline access and the state value', () => {
    const { url } = service().startAuth('biz-1', { services: ['sheets'] });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('redirect_uri')).toBe('https://example.test/api/google/oauth/callback');
    const scopes = (u.searchParams.get('scope') ?? '').split(' ');
    expect(scopes).toEqual(expect.arrayContaining(['openid', 'email', 'https://www.googleapis.com/auth/spreadsheets']));
    expect(scopes).not.toContain('https://www.googleapis.com/auth/gmail.send');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar.events');
    expect(u.searchParams.get('state')).toMatch(/^[\w-]{20,}$/);
  });

  it('connects exactly one known service per integration', () => {
    expect(() => service().startAuth('biz-1', { services: [] })).toThrow(BadRequestException);
    expect(() => service().startAuth('biz-1', { services: ['gmail', 'sheets'] })).toThrow('Connect one Google service at a time');
    expect(() => service().startAuth('biz-1', { services: ['nonsense'] })).toThrow('Connect one Google service at a time');
  });

  it('says what to set when the OAuth client is not configured', () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(() => service().startAuth('biz-1', { services: ['gmail'] })).toThrow('GOOGLE_OAUTH_CLIENT_ID');
  });

  it('rejects a callback whose state was never issued or has expired', async () => {
    await expect(service().completeAuth('code', 'made-up-state')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('checks the stored connection before any Google call', () => {
    const notConnected = { id: 'i1', type: IntegrationType.GOOGLE_WORKSPACE, config: {} } as unknown as Integration;
    expect(() => service().readConfig(notConnected)).toThrow('not connected yet');
    const onlyGmail = {
      id: 'i2',
      type: IntegrationType.GOOGLE_WORKSPACE,
      config: { services: ['gmail'], refreshToken: encryptSecret('r'), accountEmail: 'a@b.c', grantedScopes: [] },
    } as unknown as Integration;
    expect(service().readConfig(onlyGmail).services).toEqual(['gmail']);
  });
});

describe('where Google sends the user back', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { returnOriginFor } = require('./google.controller') as typeof import('./google.controller');
  const withOrigin = (origin?: string) => ({ headers: origin ? { origin } : {} }) as never;

  beforeEach(() => {
    process.env.DASHBOARD_URL = 'https://app.example.com';
  });

  it('returns to the localhost dashboard the sign-in started from', () => {
    expect(returnOriginFor(withOrigin('http://localhost:2886'))).toBe('http://localhost:2886');
    expect(returnOriginFor(withOrigin('http://127.0.0.1:2785'))).toBe('http://127.0.0.1:2785');
  });

  it('returns to the configured production dashboard', () => {
    expect(returnOriginFor(withOrigin('https://app.example.com'))).toBe('https://app.example.com');
  });

  it('never sends the user to a foreign origin', () => {
    expect(returnOriginFor(withOrigin('https://evil.example.net'))).toBe('https://app.example.com');
    expect(returnOriginFor(withOrigin('not a url'))).toBe('https://app.example.com');
  });

  it('falls back to DASHBOARD_URL when no origin header is sent', () => {
    expect(returnOriginFor(withOrigin())).toBe('https://app.example.com');
  });
});
