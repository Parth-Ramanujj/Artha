import { Message } from './entities/message.entity';
import { inlineMediaBase64, withMediaUrls } from './message-media-url.util';

const row = (id: string, metadata: Record<string, unknown> | null) => ({ id, metadata }) as unknown as Message;
const PNG_B64 = Buffer.from('fake-png-bytes').toString('base64');

describe('inlineMediaBase64', () => {
  it('returns plain base64 and unwraps a data: URI', () => {
    expect(inlineMediaBase64(row('a', { media: { data: PNG_B64 } }))).toBe(PNG_B64);
    expect(inlineMediaBase64(row('a', { media: { data: `data:image/png;base64,${PNG_B64}` } }))).toBe(PNG_B64);
  });

  it('ignores remote URLs, empty/omitted payloads and rows without media', () => {
    expect(inlineMediaBase64(row('a', { media: { data: 'https://cdn.example/x.jpg' } }))).toBeUndefined();
    expect(inlineMediaBase64(row('a', { media: { omitted: true } }))).toBeUndefined();
    expect(inlineMediaBase64(row('a', { media: { data: '' } }))).toBeUndefined();
    expect(inlineMediaBase64(row('a', null))).toBeUndefined();
  });
});

describe('withMediaUrls', () => {
  it('swaps inline base64 for a url + sizeBytes and keeps every other field', () => {
    const [m] = withMediaUrls('sess 1', [
      row('11111111-1111-1111-1111-111111111111', {
        media: { mimetype: 'image/png', filename: 'a.png', data: PNG_B64 },
        quotedMessage: { id: 'q', body: 'hi' },
      }),
    ]);
    expect(m.metadata).toEqual({
      media: {
        mimetype: 'image/png',
        filename: 'a.png',
        sizeBytes: Buffer.from('fake-png-bytes').length,
        url: '/api/sessions/sess%201/messages/11111111-1111-1111-1111-111111111111/media',
      },
      quotedMessage: { id: 'q', body: 'hi' },
    });
  });

  it('leaves remote-URL media, omitted media and text rows unchanged', () => {
    const remote = { media: { mimetype: 'image/jpeg', data: 'https://cdn.example/x.jpg' } };
    const omitted = { media: { mimetype: 'image/jpeg', omitted: true } };
    const out = withMediaUrls('s', [row('a', remote), row('b', omitted), row('c', null)]);
    expect(out.map(m => m.metadata)).toEqual([remote, omitted, null]);
  });
});
