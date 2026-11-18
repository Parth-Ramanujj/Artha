import compression from 'compression';
import { Request, Response } from 'express';

// Never compress streaming responses: compression buffers output, which would stall SSE frames
// (the MCP Streamable-HTTP transport streams text/event-stream on /mcp).
export function shouldCompress(req: Request, res: Response): boolean {
  if (req.path === '/mcp' || req.path.startsWith('/mcp/')) return false;
  const type = String(res.getHeader('Content-Type') ?? '');
  if (type.includes('text/event-stream')) return false;
  return compression.filter(req, res);
}

// gzip/deflate for JSON, HTML, JS, CSS above 1 KB. Already-compressed media types are skipped by
// the default filter, and socket.io traffic never reaches Express middleware.
export const responseCompression = () => compression({ filter: shouldCompress });
