import { BadRequestException } from '@nestjs/common';
import { ProviderSettingsService } from './provider-settings.service';

function fakeRepo() {
  const rows = new Map<string, string>();
  return {
    rows,
    findOne: ({ where }: { where: { key: string } }) =>
      Promise.resolve(rows.has(where.key) ? { key: where.key, value: rows.get(where.key)! } : null),
    save: ({ key, value }: { key: string; value: string }) => {
      rows.set(key, value);
      return Promise.resolve({ key, value });
    },
    delete: ({ key }: { key: string }) => {
      rows.delete(key);
      return Promise.resolve({ affected: 1 });
    },
  };
}

describe('Twilio credentials in the database', () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it('returns null until all three values are set', async () => {
    const repo = fakeRepo();
    const svc = new ProviderSettingsService(repo as never);
    expect(await svc.twilio()).toBeNull();
    await svc.saveSecret('TWILIO_ACCOUNT_SID', 'AC' + 'a'.repeat(32));
    await svc.saveSecret('TWILIO_AUTH_TOKEN', 'token-value');
    expect(await svc.twilio()).toBeNull();
    await svc.saveSecret('TWILIO_PHONE_NUMBER', '+15551234567');
    expect(await svc.twilio()).toEqual({
      accountSid: 'AC' + 'a'.repeat(32),
      authToken: 'token-value',
      fromNumber: '+15551234567',
    });
  });

  it('stores the token encrypted, never in plain text', async () => {
    const repo = fakeRepo();
    const svc = new ProviderSettingsService(repo as never);
    await svc.saveSecret('TWILIO_AUTH_TOKEN', 'plain-token-123');
    expect([...repo.rows.values()].join(' ')).not.toContain('plain-token-123');
  });

  it('rejects a malformed Account SID and a number without country code', async () => {
    const svc = new ProviderSettingsService(fakeRepo() as never);
    await expect(svc.saveSecret('TWILIO_ACCOUNT_SID', 'XX123')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.saveSecret('TWILIO_PHONE_NUMBER', '5551234567')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.saveSecret('ELEVENLABS_API_KEY', 'wS22teQFfZZKTTTGs9e5')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falls back to the environment when nothing is saved', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC' + 'b'.repeat(32);
    process.env.TWILIO_AUTH_TOKEN = 'env-token';
    process.env.TWILIO_PHONE_NUMBER = '+15550001111';
    const svc = new ProviderSettingsService(fakeRepo() as never);
    expect((await svc.twilio())?.authToken).toBe('env-token');
    expect((await svc.secretStatus()).TWILIO_AUTH_TOKEN).toBe('environment');
  });
});
