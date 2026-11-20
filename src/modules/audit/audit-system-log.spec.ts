import { AuditService } from './audit.service';
import { AuditAction, AuditSeverity } from './entities/audit-log.entity';
import { createLogger, LoggerService } from '../../common/services/logger.service';

describe('AuditService system log capture', () => {
  const saved: Array<Record<string, unknown>> = [];
  const repo = {
    create: (row: Record<string, unknown>) => row,
    save: jest.fn((row: Record<string, unknown>) => {
      saved.push(row);
      return Promise.resolve(row);
    }),
  };
  let service: AuditService;

  beforeAll(() => {
    process.env.AUDIT_RETENTION_DAYS = '0';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new AuditService(repo as never);
    service.onModuleInit();
  });
  afterAll(() => {
    service.onModuleDestroy();
    delete process.env.AUDIT_RETENTION_DAYS;
    jest.restoreAllMocks();
  });
  beforeEach(() => (saved.length = 0));

  it('stores errors, warnings and info lines with their source', () => {
    const log = createLogger('CampaignService');
    log.error('Campaign crashed', 'stack here');
    log.warn('Low wallet balance', { sessionId: 's1' });
    log.log('Campaign finished');
    expect(saved.map(r => [r.action, r.severity, r.path])).toEqual([
      [AuditAction.SYSTEM_LOG, AuditSeverity.ERROR, 'CampaignService'],
      [AuditAction.SYSTEM_LOG, AuditSeverity.WARN, 'CampaignService'],
      [AuditAction.SYSTEM_LOG, AuditSeverity.INFO, 'CampaignService'],
    ]);
    expect(saved[0].errorMessage).toBe('Campaign crashed\nstack here');
    expect(saved[1].metadata).toEqual({ sessionId: 's1' });
  });

  it('skips the same line repeated within a minute, debug lines, and its own failures', () => {
    const log = createLogger('Engine');
    log.warn('Reconnecting');
    log.warn('Reconnecting');
    log.debug('noise');
    createLogger('AuditService').error('Failed to write audit log');
    expect(saved).toHaveLength(1);
  });

  it('stops when the module shuts down', () => {
    service.onModuleDestroy();
    createLogger('Late').error('after shutdown');
    expect(saved).toHaveLength(0);
    LoggerService.setSink(null);
  });
});
