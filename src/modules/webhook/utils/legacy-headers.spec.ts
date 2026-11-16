import { RESERVED_WEBHOOK_HEADER, withLegacyHeaders } from './legacy-headers';

describe('withLegacyHeaders', () => {
  it('sends every X-Artha-* header under its old X-OpenWA-* name too, with the same value', () => {
    const out = withLegacyHeaders({
      'Content-Type': 'application/json',
      'X-Artha-Event': 'message.received',
      'X-Artha-Signature': 'sha256=abc',
      'X-Artha-Retry-Count': '2',
      'X-Custom': 'kept',
    });
    expect(out).toEqual({
      'Content-Type': 'application/json',
      'X-Artha-Event': 'message.received',
      'X-Artha-Signature': 'sha256=abc',
      'X-Artha-Retry-Count': '2',
      'X-Custom': 'kept',
      'X-OpenWA-Event': 'message.received',
      'X-OpenWA-Signature': 'sha256=abc',
      'X-OpenWA-Retry-Count': '2',
    });
  });

  it('does not mutate its input', () => {
    const input = { 'X-Artha-Event': 'test' };
    withLegacyHeaders(input);
    expect(input).toEqual({ 'X-Artha-Event': 'test' });
  });

  it('reserves both the new and the old system header names', () => {
    for (const name of ['Content-Type', 'x-artha-signature', 'X-OpenWA-Signature', 'x-openwa-event']) {
      expect(RESERVED_WEBHOOK_HEADER.test(name)).toBe(true);
    }
    expect(RESERVED_WEBHOOK_HEADER.test('X-Custom')).toBe(false);
  });
});
