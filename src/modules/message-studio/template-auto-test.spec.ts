import { DataSource } from 'typeorm';
import { decideAutoTest, normalizeTestPhone, templatePreviewText } from './template-auto-test.service';
import { AddStudioTemplateAutoTest1788700000000 } from '../../database/migrations/1788700000000-AddStudioTemplateAutoTest';

const base = { status: 'APPROVED', category: 'UTILITY', hasMediaHeader: false, windowOpen: true, ageMs: 0 };

describe('template auto-test', () => {
  it('normalizes an Indian 10-digit number and rejects junk', () => {
    expect(normalizeTestPhone('6352701839')).toBe('916352701839');
    expect(normalizeTestPhone('+91 63527 01839')).toBe('916352701839');
    expect(normalizeTestPhone('12345')).toBeNull();
  });

  it('waits while Meta reviews, and gives up after a week', () => {
    expect(decideAutoTest({ ...base, status: 'PENDING' })).toEqual({ action: 'wait' });
    expect(decideAutoTest({ ...base, status: 'PENDING', ageMs: 8 * 86_400_000 })).toMatchObject({ state: 'expired' });
    expect(decideAutoTest({ ...base, status: 'REJECTED' })).toMatchObject({ state: 'rejected' });
  });

  it('never sends when the 24h window is closed (it would cost money)', () => {
    expect(decideAutoTest({ ...base, windowOpen: false })).toMatchObject({ action: 'done', state: 'not_sent' });
  });

  it('sends a free plain copy, never the paid template (all templates are charged since 1 Oct 2026)', () => {
    expect(decideAutoTest(base).action).toBe('send_preview');
    expect(decideAutoTest({ ...base, category: 'MARKETING' }).action).toBe('send_preview');
    expect(decideAutoTest({ ...base, hasMediaHeader: true }).action).toBe('send_preview');
  });

  it('builds a plain copy filled with the approved examples', () => {
    const text = templatePreviewText({
      name: 'invite',
      language: 'en',
      status: 'APPROVED',
      category: 'MARKETING',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Hello' },
        { type: 'BODY', text: 'Namaste {{1}}!', example: { body_text: [['Rahul']] } },
        { type: 'FOOTER', text: 'Reply STOP' },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Know More' }] },
      ],
    });
    expect(text).toBe('🧪 Approved template: invite (en)\n\n*Hello*\n\nNamaste Rahul!\n\n_Reply STOP_\n\n▫️ Know More');
  });

  it('migration adds the columns and is idempotent', async () => {
    const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:' });
    await ds.initialize();
    await ds.query('CREATE TABLE studio_settings (id varchar(36) PRIMARY KEY, businessId varchar(36))');
    const qr = ds.createQueryRunner();
    await new AddStudioTemplateAutoTest1788700000000().up(qr);
    await new AddStudioTemplateAutoTest1788700000000().up(qr);
    expect(await qr.hasColumn('studio_settings', 'testPhone')).toBe(true);
    expect(await qr.hasColumn('studio_settings', 'autoTests')).toBe(true);
    await new AddStudioTemplateAutoTest1788700000000().down(qr);
    expect(await qr.hasColumn('studio_settings', 'autoTests')).toBe(false);
    await ds.destroy();
  });
});
