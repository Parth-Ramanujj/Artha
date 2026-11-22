import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { REQUIRED_ROLE_KEY } from '../auth/decorators/auth.decorators';

const key = (businessId: string | null) => ({ businessId, role: ApiKeyRole.OPERATOR }) as unknown as ApiKey;

function build(session = { id: 's1', businessId: 'biz-B', status: 'ready' }) {
  const sessionService = {
    findOne: jest.fn().mockResolvedValue(session),
    delete: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ id: 'new', name: 'n', status: 'created', createdAt: new Date() }),
  };
  const businessService = { getOrCreateDefaultBusiness: jest.fn().mockResolvedValue({ id: 'default-biz' }) };
  const googleService = { startAuth: jest.fn().mockReturnValue({ url: 'u' }) };
  const ctrl = new PlatformsController(
    sessionService as never,
    {} as never,
    {} as never,
    googleService as never,
    businessService as never,
  );
  return { ctrl, sessionService, googleService };
}

describe('PlatformsController', () => {
  it('hides another tenant’s WhatsApp session from test and disconnect', async () => {
    const { ctrl, sessionService } = build();
    await expect(ctrl.testConnection(key('biz-A'), 'whatsapp', 's1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.disconnect(key('biz-A'), 'whatsapp', 's1')).rejects.toBeInstanceOf(NotFoundException);
    expect(sessionService.delete).not.toHaveBeenCalled();
  });

  it('lets the owning tenant and the super admin reach the session', async () => {
    const { ctrl, sessionService } = build();
    await expect(ctrl.testConnection(key('biz-B'), 'whatsapp', 's1')).resolves.toMatchObject({ id: 's1' });
    await ctrl.disconnect(key(null), 'whatsapp', 's1');
    expect(sessionService.delete).toHaveBeenCalledWith('s1');
  });

  it('assigns a super admin connection to the default business so it shows up in /connected', async () => {
    const { ctrl, sessionService, googleService } = build();
    await ctrl.connectWhatsApp(key(null), { name: 'n', accessToken: 't', phoneNumberId: 'p' });
    expect(sessionService.create).toHaveBeenCalledWith(expect.anything(), 'default-biz');
    await ctrl.connectGoogle(key(null), { services: [] }, { headers: {} } as never);
    expect(googleService.startAuth).toHaveBeenCalledWith(
      'default-biz',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('never requires ADMIN, which business (team) keys cannot hold', () => {
    for (const name of ['connectWhatsApp', 'connectSocial', 'connectGoogle', 'disconnect']) {
      const handler = (PlatformsController.prototype as unknown as Record<string, object>)[name];
      expect(Reflect.getMetadata(REQUIRED_ROLE_KEY, handler)).toBe(ApiKeyRole.OPERATOR);
    }
  });
});
