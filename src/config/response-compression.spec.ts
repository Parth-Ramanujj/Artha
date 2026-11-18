import { Request, Response } from 'express';
import { shouldCompress } from './response-compression';

const req = (path: string, encoding = 'gzip') =>
  ({ path, headers: { 'accept-encoding': encoding } }) as unknown as Request;
const res = (type: string) => ({ getHeader: (h: string) => (h === 'Content-Type' ? type : undefined) }) as Response;

describe('shouldCompress', () => {
  it('compresses JSON API responses', () => {
    expect(shouldCompress(req('/api/sessions'), res('application/json; charset=utf-8'))).toBe(true);
  });

  it('compresses dashboard JS bundles', () => {
    expect(shouldCompress(req('/assets/index-abc.js'), res('text/javascript; charset=utf-8'))).toBe(true);
  });

  it('never compresses server-sent events (would buffer the stream)', () => {
    expect(shouldCompress(req('/api/anything'), res('text/event-stream'))).toBe(false);
  });

  it('never compresses the MCP transport', () => {
    expect(shouldCompress(req('/mcp'), res('application/json'))).toBe(false);
    expect(shouldCompress(req('/mcp/session'), res('application/json'))).toBe(false);
  });

  it('skips already-compressed media', () => {
    expect(shouldCompress(req('/api/media/x'), res('image/jpeg'))).toBe(false);
  });
});
