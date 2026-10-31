import { IdempotencyInterceptor } from './idempotency.interceptor';
import { Observable, of, throwError } from 'rxjs';
import { ExecutionContext, HttpStatus } from '@nestjs/common';

function createMockContext(headers: Record<string, string> = {}, apiKey?: { id: string }) {
  const req = {
    headers,
    apiKey,
  };
  const res = {
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

const asCtx = (ctx: ReturnType<typeof createMockContext>) => ctx as unknown as ExecutionContext;

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    interceptor = new IdempotencyInterceptor();
  });

  it('passes through when no Idempotency-Key header', done => {
    const ctx = createMockContext();
    const handler = { handle: () => of({ messageId: '123' }) };

    interceptor.intercept(asCtx(ctx), handler).subscribe(result => {
      expect(result).toEqual({ messageId: '123' });
      done();
    });
  });

  it('caches and replays response for duplicate idempotency key', done => {
    const ctx1 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-1' });
    const handler1 = { handle: () => of({ messageId: 'msg-1' }) };
    ctx1.res.statusCode = 201;

    interceptor.intercept(asCtx(ctx1), handler1).subscribe(() => {
      const ctx2 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-1' });
      const handler2 = { handle: jest.fn() };

      interceptor.intercept(asCtx(ctx2), handler2).subscribe(result => {
        expect(result).toEqual({ messageId: 'msg-1' });
        expect(handler2.handle).not.toHaveBeenCalled();
        expect(ctx2.res.setHeader).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
        done();
      });
    });
  });

  it('scopes cache by API key id', done => {
    const ctx1 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-1' });
    const handler1 = { handle: () => of({ messageId: 'from-api-1' }) };
    ctx1.res.statusCode = 201;

    interceptor.intercept(asCtx(ctx1), handler1).subscribe(() => {
      const ctx2 = createMockContext({ 'idempotency-key': 'key-1' }, { id: 'api-2' });
      const handler2 = { handle: () => of({ messageId: 'from-api-2' }) };
      ctx2.res.statusCode = 201;

      interceptor.intercept(asCtx(ctx2), handler2).subscribe(result => {
        expect(result).toEqual({ messageId: 'from-api-2' });
        done();
      });
    });
  });

  it('does not cache error responses', done => {
    const ctx1 = createMockContext({ 'idempotency-key': 'key-err' }, { id: 'api-1' });
    const error = new Error('engine failure');
    const handler1 = { handle: () => throwError(() => error) };

    interceptor.intercept(asCtx(ctx1), handler1).subscribe({
      error: () => {
        const ctx2 = createMockContext({ 'idempotency-key': 'key-err' }, { id: 'api-1' });
        const handler2 = { handle: () => of({ messageId: 'retry-success' }) };
        ctx2.res.statusCode = 201;

        interceptor.intercept(asCtx(ctx2), handler2).subscribe(result => {
          expect(result).toEqual({ messageId: 'retry-success' });
          done();
        });
      },
    });
  });

  it('returns 409 for concurrent duplicate requests', done => {
    const ctx1 = createMockContext({ 'idempotency-key': 'concurrent' }, { id: 'api-1' });
    let resolveFirst: (v: unknown) => void;
    const pending = new Promise<unknown>(r => {
      resolveFirst = r;
    });
    const handler1 = {
      handle: () =>
        new Observable<unknown>(subscriber => {
          void pending.then(() => {
            subscriber.next({ messageId: 'first' });
            subscriber.complete();
          });
        }),
    };

    interceptor.intercept(asCtx(ctx1), handler1).subscribe(() => {});

    const ctx2 = createMockContext({ 'idempotency-key': 'concurrent' }, { id: 'api-1' });
    const handler2 = { handle: jest.fn() };

    interceptor.intercept(asCtx(ctx2), handler2).subscribe(result => {
      expect((result as { statusCode: number }).statusCode).toBe(HttpStatus.CONFLICT);
      expect(handler2.handle).not.toHaveBeenCalled();
      resolveFirst!({});
      done();
    });
  });
});
