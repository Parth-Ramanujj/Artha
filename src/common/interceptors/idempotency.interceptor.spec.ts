import { IdempotencyInterceptor } from './idempotency.interceptor';
import { of, throwError } from 'rxjs';
import { HttpStatus } from '@nestjs/common';

function createMockContext(headers: Record<string, string> = {}, apiKey?: { id: string }) {
  const req: any = {
    headers,
    apiKey,
  };
  const res: any = {
    statusCode: 201,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    req,
    res,
  };
}

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    interceptor = new IdempotencyInterceptor();
  });

  it('passes through when no Idempotency-Key header', (done) => {
    const ctx = createMockContext();
    const handler = { handle: () => of({ messageId: '123' }) };

    interceptor.intercept(ctx as any, handler).subscribe((result) => {
      expect(result).toEqual({ messageId: '123' });
      done();
    });
  });

  it('caches and replays response for duplicate idempotency key', (done) => {
    const ctx1 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-1' });
    const handler1 = { handle: () => of({ messageId: 'msg-1' }) };
    ctx1.res.statusCode = 201;

    interceptor.intercept(ctx1 as any, handler1).subscribe(() => {
      const ctx2 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-1' });
      const handler2 = { handle: jest.fn() };

      interceptor.intercept(ctx2 as any, handler2).subscribe((result) => {
        expect(result).toEqual({ messageId: 'msg-1' });
        expect(handler2.handle).not.toHaveBeenCalled();
        expect(ctx2.res.setHeader).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
        done();
      });
    });
  });

  it('scopes cache by API key id', (done) => {
    const ctx1 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-1' });
    const handler1 = { handle: () => of({ messageId: 'from-api-1' }) };
    ctx1.res.statusCode = 201;

    interceptor.intercept(ctx1 as any, handler1).subscribe(() => {
      const ctx2 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-2' });
      const handler2 = { handle: () => of({ messageId: 'from-api-2' }) };
      ctx2.res.statusCode = 201;

      interceptor.intercept(ctx2 as any, handler2).subscribe((result) => {
        expect(result).toEqual({ messageId: 'from-api-2' });
        done();
      });
    });
  });

  it('does not cache error responses', (done) => {
    const ctx1 = createMockContext({ 'idempotency-key': 'key-err' }, { id: 'api-1' });
    const error = new Error('engine failure');
    const handler1 = { handle: () => throwError(() => error) };

    interceptor.intercept(ctx1 as any, handler1).subscribe({
      error: () => {
        const ctx2 = createMockContext({ 'idempotency-key': 'key-err' }, { id: 'api-1' });
        const handler2 = { handle: () => of({ messageId: 'retry-success' }) };
        ctx2.res.statusCode = 201;

        interceptor.intercept(ctx2 as any, handler2).subscribe((result) => {
          expect(result).toEqual({ messageId: 'retry-success' });
          done();
        });
      },
    });
  });

  it('returns 409 for concurrent duplicate requests', (done) => {
    const ctx1 = createMockContext({ 'idempotency-key': 'concurrent' }, { id: 'api-1' });
    let resolveFirst: (v: any) => void;
    const pending = new Promise((r) => {
      resolveFirst = r;
    });
    const handler1 = {
      handle: () =>
        new (require('rxjs').Observable)((subscriber: any) => {
          pending.then(() => {
            subscriber.next({ messageId: 'first' });
            subscriber.complete();
          });
        }),
    };

    interceptor.intercept(ctx1 as any, handler1).subscribe(() => {});

    const ctx2 = createMockContext({ 'idempotency-key': 'concurrent' }, { id: 'api-1' });
    const handler2 = { handle: jest.fn() };

    interceptor.intercept(ctx2 as any, handler2).subscribe((result: any) => {
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
      expect(handler2.handle).not.toHaveBeenCalled();
      resolveFirst!({});
      done();
    });
  });
});
