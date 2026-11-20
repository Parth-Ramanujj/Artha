import { auditRowFor } from './audit-trail.interceptor';
import { AuditSeverity } from './entities/audit-log.entity';

describe('auditRowFor', () => {
  it('records every change and every failure, but not successful reads', () => {
    expect(auditRowFor('POST', '/api/workflows', 201)).toBe(AuditSeverity.INFO);
    expect(auditRowFor('DELETE', '/api/sessions/s1', 200)).toBe(AuditSeverity.INFO);
    expect(auditRowFor('GET', '/api/workflows', 200)).toBeNull();
    expect(auditRowFor('GET', '/api/workflows/x', 404)).toBe(AuditSeverity.WARN);
    expect(auditRowFor('POST', '/api/campaigns', 500)).toBe(AuditSeverity.ERROR);
  });

  it('skips machine traffic that has its own logs', () => {
    expect(auditRowFor('POST', '/api/cloud-api/webhook', 200)).toBeNull();
    expect(auditRowFor('GET', '/api/health', 503)).toBeNull();
    expect(auditRowFor('GET', '/api/audit', 500)).toBeNull();
  });
});
