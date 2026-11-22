import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProvisioningController } from './provisioning.controller';
import { CreateTenantKeyDto } from './dto/provisioning.dto';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

function build(createApiKey: jest.Mock) {
  const businessService = {
    create: jest.fn().mockResolvedValue({ id: 'biz-1', name: 'Acme', slug: 'acme', plan: 'free' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const ctrl = new ProvisioningController(businessService as never, { createApiKey } as never);
  return { ctrl, businessService };
}

describe('ProvisioningController', () => {
  it('creates the tenant with a non-admin key (business keys cannot be ADMIN)', async () => {
    const createApiKey = jest.fn().mockResolvedValue({
      apiKey: { id: 'k1', name: 'Acme Owner', role: ApiKeyRole.OPERATOR, keyPrefix: 'owa_k1_abcd' },
      rawKey: 'owa_k1_raw',
    });
    const { ctrl } = build(createApiKey);
    const res = await ctrl.createTenant({ businessName: 'Acme' });
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ role: ApiKeyRole.OPERATOR, businessId: 'biz-1' }),
    );
    expect(res.apiKey.key).toBe('owa_k1_raw');
  });

  it('removes the business again if the key cannot be created, so a retry does not 409', async () => {
    const { ctrl, businessService } = build(jest.fn().mockRejectedValue(new BadRequestException('nope')));
    await expect(ctrl.createTenant({ businessName: 'Acme' })).rejects.toBeInstanceOf(BadRequestException);
    expect(businessService.remove).toHaveBeenCalledWith('biz-1');
  });

  it('rejects role=admin for a tenant key at validation', async () => {
    const errors = await validate(plainToInstance(CreateTenantKeyDto, { name: 'Team key', role: 'admin' }));
    expect(errors.map(e => e.property)).toContain('role');
  });
});
