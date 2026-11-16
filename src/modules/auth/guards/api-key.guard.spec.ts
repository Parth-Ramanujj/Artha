import { Controller, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { ApiKeyGuard } from './api-key.guard';
import type { Session } from '../../session/entities/session.entity';
import { AuthService } from '../auth.service';
import { ApiKey, ApiKeyRole } from '../entities/api-key.entity';
import { REQUIRED_ROLE_KEY } from '../decorators/auth.decorators';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

function createMockApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'uuid-1',
    name: 'Test Key',
    keyHash: 'hash',
    keyPrefix: 'owa_k1_xxxx',
    role: ApiKeyRole.OPERATOR,
    allowedIps: null,
    allowedSessions: null,
    businessId: null,
    allowedFeatures: null,
    isActive: true,
    expiresAt: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockContext(
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
  socketIp = '127.0.0.1',
): ExecutionContext {
  const request = {
    headers,
    params,
    ip: socketIp,
    socket: { remoteAddress: socketIp },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let authService: jest.Mocked<Partial<AuthService>>;
  let reflector: jest.Mocked<Reflector>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;

  let sessionRepository: { findOne: jest.Mock };

  function buildGuard(trustedProxies: string[] = []): ApiKeyGuard {
    configService = {
      get: jest.fn().mockReturnValue(trustedProxies),
    };
    sessionRepository = { findOne: jest.fn().mockResolvedValue(null) };
    return new ApiKeyGuard(
      authService as AuthService,
      reflector,
      configService as ConfigService,
      auditService as AuditService,
      sessionRepository as unknown as Repository<Session>,
    );
  }

  beforeEach(() => {
    authService = {
      validateApiKey: jest.fn(),
      hasPermission: jest.fn(),
      effectiveSessionScope: jest.fn().mockResolvedValue(['sess-1']),
    };

    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    auditService = {
      logWarn: jest.fn().mockResolvedValue(null),
    };

    guard = buildGuard();
  });

  it('should allow access to @Public() routes without API key', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true); // isPublic = true

    const context = createMockContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.validateApiKey).not.toHaveBeenCalled();
  });

  it('should reject requests without X-API-Key header', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false); // not public

    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('API key is required');
  });

  it('should accept X-API-Key header', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(undefined); // no required role

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    const context = createMockContext({ 'x-api-key': 'my-key' });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('my-key', '127.0.0.1', undefined);
  });

  it('should accept Authorization Bearer header', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    const context = createMockContext({ authorization: 'Bearer my-bearer-key' });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.validateApiKey).toHaveBeenCalledWith('my-bearer-key', '127.0.0.1', undefined);
  });

  it('should reject when API key validation fails', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);

    (authService.validateApiKey as jest.Mock).mockRejectedValue(new UnauthorizedException('Invalid API key'));

    const context = createMockContext({ 'x-api-key': 'bad-key' });

    await expect(guard.canActivate(context)).rejects.toThrow('Invalid API key');
  });

  it('records an API_KEY_AUTH_FAILED audit event when a key is rejected (with ip + reason)', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false); // not public
    (authService.validateApiKey as jest.Mock).mockRejectedValue(new UnauthorizedException('Invalid API key'));

    const context = createMockContext({ 'x-api-key': 'bad-key' }, {}, '203.0.113.9');
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid API key');
    await new Promise(resolve => setImmediate(resolve)); // let the fire-and-forget audit write settle

    expect(auditService.logWarn).toHaveBeenCalledWith(
      AuditAction.API_KEY_AUTH_FAILED,
      expect.objectContaining({ ipAddress: '203.0.113.9', errorMessage: 'Invalid API key' }),
    );
  });

  it('records an audit event when a missing key is rejected', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);

    const context = createMockContext({}); // no key
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await new Promise(resolve => setImmediate(resolve));

    expect(auditService.logWarn).toHaveBeenCalledWith(AuditAction.API_KEY_AUTH_FAILED, expect.any(Object));
  });

  it('does not record an audit event on a successful authorization', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);
    (authService.validateApiKey as jest.Mock).mockResolvedValue(createMockApiKey());

    const context = createMockContext({ 'x-api-key': 'good-key' });
    await guard.canActivate(context);
    await new Promise(resolve => setImmediate(resolve));

    expect(auditService.logWarn).not.toHaveBeenCalled();
  });

  it('should reject when role permission is insufficient', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(ApiKeyRole.ADMIN); // required role = ADMIN

    const apiKey = createMockApiKey({ role: ApiKeyRole.VIEWER });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);
    (authService.hasPermission as jest.Mock).mockReturnValue(false);

    const context = createMockContext({ 'x-api-key': 'viewer-key' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a session-scoped key on a @RequireUnscopedKey route, whatever its role', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(ApiKeyRole.ADMIN) // required role = ADMIN
      .mockReturnValueOnce(undefined) // not @SessionScoped
      .mockReturnValueOnce(true); // @RequireUnscopedKey

    const apiKey = createMockApiKey({ role: ApiKeyRole.ADMIN, allowedSessions: ['sess-A'] });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);
    (authService.hasPermission as jest.Mock).mockReturnValue(true);

    const context = createMockContext({ 'x-api-key': 'scoped-admin-key' }, {}, '203.0.113.44');

    await expect(guard.canActivate(context)).rejects.toThrow('Session-scoped API keys are not permitted on this route');
    await new Promise(resolve => setImmediate(resolve)); // let the fire-and-forget audit write settle
    expect(auditService.logWarn).toHaveBeenCalledWith(
      AuditAction.API_KEY_AUTH_FAILED,
      expect.objectContaining({ ipAddress: '203.0.113.44' }),
    );
  });

  it('admits an unrestricted key on a @RequireUnscopedKey route', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(ApiKeyRole.ADMIN) // required role = ADMIN
      .mockReturnValueOnce(undefined) // not @SessionScoped
      .mockReturnValueOnce(true); // @RequireUnscopedKey

    const apiKey = createMockApiKey({ role: ApiKeyRole.ADMIN, allowedSessions: null });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);
    (authService.hasPermission as jest.Mock).mockReturnValue(true);

    const context = createMockContext({ 'x-api-key': 'admin-key' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('admits a session-scoped key on routes WITHOUT the @RequireUnscopedKey marker', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(undefined) // no required role
      .mockReturnValueOnce(undefined) // not @SessionScoped
      .mockReturnValueOnce(undefined); // not @RequireUnscopedKey

    const apiKey = createMockApiKey({ allowedSessions: ['sess-A'] });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    const context = createMockContext({ 'x-api-key': 'scoped-key' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should pass session ID from route params to validateApiKey', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    const context = createMockContext({ 'x-api-key': 'key' }, { sessionId: 'sess-123' });
    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('key', '127.0.0.1', 'sess-123');
  });

  it('does not treat a non-session route :id as a session id (no @SessionScoped)', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(undefined) // no required role
      .mockReturnValueOnce(undefined); // controller is NOT @SessionScoped

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    // e.g. GET /plugins/:id or /auth/api-keys/:id — :id is a plugin/key id, not a session.
    const context = createMockContext({ 'x-api-key': 'key' }, { id: 'plugin-x' });
    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('key', '127.0.0.1', undefined);
  });

  it('treats :id as the session id on a @SessionScoped controller (session scoping preserved)', async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(undefined) // no required role
      .mockReturnValueOnce(true); // controller IS @SessionScoped (SessionController)

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    // GET /sessions/:id/... — :id IS the session, so allowedSessions must still be enforced.
    const context = createMockContext({ 'x-api-key': 'key' }, { id: 'sess-B' });
    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('key', '127.0.0.1', 'sess-B');
  });

  it('ignores X-Forwarded-For by default (no trusted proxies) to prevent IP spoofing', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    // Attacker forges X-Forwarded-For; the direct socket IP must win.
    const context = createMockContext({
      'x-api-key': 'key',
      'x-forwarded-for': '203.0.113.50, 70.41.3.18',
    });
    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('key', '127.0.0.1', undefined);
  });

  it('uses the rightmost untrusted hop when the request comes from a trusted proxy', async () => {
    guard = buildGuard(['10.0.0.0/8']);
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    // Direct peer 10.0.0.1 is a trusted proxy; XFF = [real client, inner proxy].
    const context = createMockContext(
      { 'x-api-key': 'key', 'x-forwarded-for': '203.0.113.50, 10.0.0.5' },
      {},
      '10.0.0.1',
    );
    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('key', '203.0.113.50', undefined);
  });

  it('ignores X-Forwarded-For when the direct peer is not a trusted proxy', async () => {
    guard = buildGuard(['10.0.0.0/8']);
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    // Attacker connects directly (203.0.113.99) and forges a trusted-looking XFF.
    const context = createMockContext({ 'x-api-key': 'key', 'x-forwarded-for': '10.0.0.5' }, {}, '203.0.113.99');
    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('key', '203.0.113.99', undefined);
  });

  it('normalizes an IPv4-mapped IPv6 proxy address (e.g. ::ffff:10.0.0.1)', async () => {
    guard = buildGuard(['10.0.0.0/8']);
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey();
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    const context = createMockContext({ 'x-api-key': 'key', 'x-forwarded-for': '203.0.113.50' }, {}, '::ffff:10.0.0.1');
    await guard.canActivate(context);

    expect(authService.validateApiKey).toHaveBeenCalledWith('key', '203.0.113.50', undefined);
  });

  it('rejects when API key businessId does not match session businessId', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey({ businessId: 'biz-A' });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    sessionRepository.findOne.mockResolvedValue({ id: 'sess-1', businessId: 'biz-B' });

    const context = createMockContext({ 'x-api-key': 'key' }, { sessionId: 'sess-1' });
    await expect(guard.canActivate(context)).rejects.toThrow('API key not authorized for this business session');
  });

  it('allows when API key businessId matches session businessId', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey({ businessId: 'biz-A' });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    sessionRepository.findOne.mockResolvedValue({ id: 'sess-1', businessId: 'biz-A' });

    const context = createMockContext({ 'x-api-key': 'key' }, { sessionId: 'sess-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    // An older business key (no approved-features list) keeps its stored scope — no new confinement.
    const request = context.switchToHttp().getRequest<{ apiKey: ApiKey }>();
    expect(request.apiKey.allowedSessions).toBeNull();
    expect(authService.effectiveSessionScope).not.toHaveBeenCalled();
  });

  it('skips business check when API key has no businessId (platform admin)', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey({ businessId: null });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    const context = createMockContext({ 'x-api-key': 'key' }, { sessionId: 'sess-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(sessionRepository.findOne).not.toHaveBeenCalled();
  });

  it('keeps legacy access to unassigned sessions for older business keys (backward compatible)', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);

    const apiKey = createMockApiKey({ businessId: 'biz-A' });
    (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);

    sessionRepository.findOne.mockResolvedValue({ id: 'sess-1', businessId: null });

    const context = createMockContext({ 'x-api-key': 'key' }, { sessionId: 'sess-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  describe('super admin and feature approval', () => {
    @Controller('campaigns')
    class CampaignsController {}
    @Controller('sessions/:sessionId/messages')
    class MessagesController {}

    // Role passes so these tests reach the super-admin / feature checks that follow it.
    const withRole = (role?: ApiKeyRole) => {
      (authService.hasPermission as jest.Mock).mockReturnValue(true);
      reflector.getAllAndOverride.mockImplementation((key: string) => (key === REQUIRED_ROLE_KEY ? role : undefined));
    };
    const contextFor = (controller: object) =>
      ({ ...createMockContext({ 'x-api-key': 'key' }), getClass: () => controller }) as unknown as ExecutionContext;

    const customerContext = (sessionId: string) =>
      ({
        ...createMockContext({ 'x-api-key': 'key' }, { sessionId }),
        getClass: () => MessagesController,
      }) as unknown as ExecutionContext;

    it('rejects a customer key with an ADMIN role on admin routes (super admin only)', async () => {
      withRole(ApiKeyRole.ADMIN);
      (authService.validateApiKey as jest.Mock).mockResolvedValue(
        createMockApiKey({ role: ApiKeyRole.ADMIN, businessId: 'biz-A', allowedFeatures: [] }),
      );
      await expect(guard.canActivate(createMockContext({ 'x-api-key': 'key' }))).rejects.toThrow(
        'Super admin API key required',
      );
    });

    it('leaves an older business ADMIN key on admin routes as before (backward compatible)', async () => {
      withRole(ApiKeyRole.ADMIN);
      (authService.validateApiKey as jest.Mock).mockResolvedValue(
        createMockApiKey({ role: ApiKeyRole.ADMIN, businessId: 'biz-A' }),
      );
      await expect(guard.canActivate(createMockContext({ 'x-api-key': 'key' }))).resolves.toBe(true);
    });

    it("rejects a customer key on the super admin's unassigned sessions", async () => {
      withRole(undefined);
      (authService.validateApiKey as jest.Mock).mockResolvedValue(
        createMockApiKey({ businessId: 'biz-A', allowedFeatures: [] }),
      );
      sessionRepository.findOne.mockResolvedValue({ id: 'sess-1', businessId: null });
      await expect(guard.canActivate(customerContext('sess-1'))).rejects.toThrow(ForbiddenException);
    });

    it("confines a customer key's reads to its own sessions without mutating the stored key", async () => {
      withRole(undefined);
      const apiKey = createMockApiKey({ businessId: 'biz-A', allowedFeatures: [] });
      (authService.validateApiKey as jest.Mock).mockResolvedValue(apiKey);
      sessionRepository.findOne.mockResolvedValue({ id: 'sess-1', businessId: 'biz-A' });

      const context = customerContext('sess-1');
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(context.switchToHttp().getRequest<{ apiKey: ApiKey }>().apiKey.allowedSessions).toEqual(['sess-1']);
      expect(apiKey.allowedSessions).toBeNull();
    });

    it('allows the super admin (admin key without business) on admin routes', async () => {
      withRole(ApiKeyRole.ADMIN);
      (authService.validateApiKey as jest.Mock).mockResolvedValue(createMockApiKey({ role: ApiKeyRole.ADMIN }));
      await expect(guard.canActivate(createMockContext({ 'x-api-key': 'key' }))).resolves.toBe(true);
    });

    it('blocks a feature the key is not approved for, allows an approved one', async () => {
      withRole(undefined);
      (authService.validateApiKey as jest.Mock).mockResolvedValue(createMockApiKey({ allowedFeatures: ['ai'] }));
      await expect(guard.canActivate(contextFor(CampaignsController))).rejects.toThrow(
        'Feature not enabled for this API key: campaigns',
      );

      (authService.validateApiKey as jest.Mock).mockResolvedValue(createMockApiKey({ allowedFeatures: ['campaigns'] }));
      await expect(guard.canActivate(contextFor(CampaignsController))).resolves.toBe(true);
    });

    it('always allows core routes, and denies unclassified controllers to restricted keys', async () => {
      withRole(undefined);
      (authService.validateApiKey as jest.Mock).mockResolvedValue(createMockApiKey({ allowedFeatures: [] }));
      await expect(guard.canActivate(contextFor(MessagesController))).resolves.toBe(true);
      await expect(guard.canActivate(createMockContext({ 'x-api-key': 'key' }))).rejects.toThrow(
        'Feature not enabled for this API key: unclassified',
      );
    });
  });
});
