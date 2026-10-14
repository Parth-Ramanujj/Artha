import { CallHandler, ExecutionContext, Injectable, NestInterceptor, HttpStatus } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

interface CachedResponse {
  statusCode: number;
  body: unknown;
  expiresAt: number;
}

const HEADER = 'idempotency-key';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 50_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly cache = new Map<string, CachedResponse>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const idempotencyKey = req.headers[HEADER] as string | undefined;

    if (!idempotencyKey) {
      return next.handle();
    }

    const apiKeyId = (req as Request & { apiKey?: { id: string } }).apiKey?.id ?? '';
    const scopedKey = `${apiKeyId}:${idempotencyKey}`;

    const cached = this.cache.get(scopedKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('X-Idempotent-Replayed', 'true');
      res.status(cached.statusCode);
      return of(cached.body);
    }

    if (this.pending.has(scopedKey)) {
      res.status(HttpStatus.CONFLICT);
      return of({
        statusCode: HttpStatus.CONFLICT,
        message: 'A request with this idempotency key is already in progress',
      });
    }

    let resolveInflight: (v: unknown) => void;
    const inflightPromise = new Promise<unknown>(r => {
      resolveInflight = r;
    });
    this.pending.set(scopedKey, inflightPromise);

    return next.handle().pipe(
      tap({
        next: (body: unknown) => {
          const statusCode = res.statusCode;
          if (statusCode >= 200 && statusCode < 300) {
            this.cache.set(scopedKey, { statusCode, body, expiresAt: Date.now() + TTL_MS });
            this.ensureSweep();
          }
          this.pending.delete(scopedKey);
          resolveInflight!(body);
        },
        error: () => {
          this.pending.delete(scopedKey);
          resolveInflight!(undefined);
        },
      }),
    );
  }

  private ensureSweep(): void {
    if (this.sweepTimer) return;
    if (this.cache.size <= MAX_ENTRIES) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(key);
      }
      if (this.cache.size === 0 && this.sweepTimer) {
        clearInterval(this.sweepTimer);
        this.sweepTimer = null;
      }
    }, SWEEP_INTERVAL_MS);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }
}
