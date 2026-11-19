import { CloudApiAdapter } from './cloud-api.adapter';

describe('CloudApiAdapter getNumberId', () => {
  const adapter = new CloudApiAdapter({ sessionId: 's1', accessToken: 't', phoneNumberId: 'PN1' });

  it('resolves a phone number to the neutral @c.us chat id without a lookup', async () => {
    await expect(adapter.getNumberId('919876543210')).resolves.toBe('919876543210@c.us');
    await expect(adapter.getNumberId('919876543210@c.us')).resolves.toBe('919876543210@c.us');
  });

  it('returns null for input that cannot be a phone number', async () => {
    await expect(adapter.getNumberId('12')).resolves.toBeNull();
    await expect(adapter.getNumberId('')).resolves.toBeNull();
  });
});
