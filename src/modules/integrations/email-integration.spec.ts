import { BadRequestException } from '@nestjs/common';
import { IntegrationService, readSmtpConfig } from './integration.service';
import { IntegrationType } from './entities/integration.entity';

const service = new IntegrationService({} as never);

describe('email (SMTP) integration', () => {
  const good = {
    host: 'smtp.example.com',
    port: 587,
    username: 'sales@example.com',
    password: 'app-password',
    fromAddress: 'sales@example.com',
    fromName: 'Sales',
  };

  it('is offered as an integration type', () => {
    const types = service.getAvailableTypes();
    expect(types).toContainEqual(expect.objectContaining({ type: IntegrationType.EMAIL_SMTP, category: 'email' }));
  });

  it('reads the SMTP settings and turns port 465 into an implicit-TLS connection', () => {
    expect(readSmtpConfig(good)).toMatchObject({ host: 'smtp.example.com', port: 587, secure: false });
    expect(readSmtpConfig({ ...good, port: 465 }).secure).toBe(true);
    expect(readSmtpConfig({ ...good, port: '465', secure: 'false' }).secure).toBe(true);
  });

  it('lists every missing required setting', () => {
    expect(() => readSmtpConfig({ host: '', port: 0 })).toThrow(BadRequestException);
    expect(() => readSmtpConfig({ host: '', port: 0 })).toThrow('host, username, password, fromAddress, port');
    expect(() => readSmtpConfig(null)).toThrow(BadRequestException);
  });

  it('reports a failed login instead of throwing (no mail is sent)', async () => {
    const result = await service.verifySmtp({ ...good, host: '127.0.0.1', port: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/SMTP login failed/);
  });
});
