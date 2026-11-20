import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AuditService } from './audit.service';
import { AuditAction, AuditSeverity } from './entities/audit-log.entity';
import { getRequestActor } from '../../common/services/request-context';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
// High-volume machine traffic, already kept in Message Logs / metrics; reading the audit log itself.
const SKIPPED_PREFIXES = [
  '/api/health',
  '/api/metrics',
  '/api/cloud-api/webhook',
  '/api/social-automation/webhook',
  '/api/audit',
];

/** What to store for one finished API call, or null when it is not worth an audit row. */
export function auditRowFor(method: string, path: string, status: number): AuditSeverity | null {
  if (SKIPPED_PREFIXES.some(p => path.startsWith(p))) return null;
  if (status >= 500) return AuditSeverity.ERROR;
  if (status >= 400) return AuditSeverity.WARN;
  return READS.has(method) ? null : AuditSeverity.INFO;
}

/**
 * Writes one Audit Log row for every API change (POST/PUT/PATCH/DELETE) and every failed call: who,
 * what, the status and how long it took. Requests refused by the API-key guard never reach here; the
 * guard audits those itself.
 */
@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const method = (req.method ?? 'GET').toUpperCase();
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    // The request's async context is gone by the time the response finishes, so take the actor now.
    const actor = getRequestActor();
    const params = (req.params ?? {}) as Record<string, string | undefined>;
    const start = Date.now();
    let error: string | undefined;
    let done = false;

    const write = () => {
      if (done) return;
      done = true;
      const status = res.statusCode;
      const severity = auditRowFor(method, path, status);
      if (!severity) return;
      void this.audit.log(
        AuditAction.API_REQUEST,
        {
          apiKeyId: actor?.apiKeyId,
          apiKeyName: actor?.apiKeyName,
          businessId: actor?.businessId,
          ipAddress: actor?.ipAddress ?? req.ip,
          userAgent: req.headers['user-agent']?.slice(0, 500),
          sessionId: (params.sessionId ?? (path.startsWith('/api/sessions/') ? params.id : undefined))?.slice(0, 36),
          method,
          path: path.slice(0, 500),
          statusCode: status,
          metadata: { durationMs: Date.now() - start },
          ...(error ? { errorMessage: error.slice(0, 2000) } : {}),
        },
        severity,
      );
    };
    res.on('finish', write);
    res.on('close', write);

    return next.handle().pipe(
      catchError((err: unknown) => {
        error =
          err instanceof HttpException
            ? JSON.stringify(err.getResponse())
            : err instanceof Error
              ? err.message
              : String(err);
        return throwError(() => err);
      }),
    );
  }
}
