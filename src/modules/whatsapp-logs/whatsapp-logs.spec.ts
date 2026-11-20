import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import { describeWebhook, WhatsAppLogsService } from './whatsapp-logs.service';
import { AddWhatsAppEvents1789100000000 } from '../../database/migrations/1789100000000-AddWhatsAppEvents';
import { WhatsAppEvent } from './entities/whatsapp-event.entity';
import { CloudApiWebhookService } from '../cloud-api-webhook/cloud-api-webhook.service';

const payload = (value: Record<string, unknown>, field = 'messages') => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field, value: { metadata: { phone_number_id: 'PN1' }, ...value } }] }],
});

describe('describeWebhook', () => {
  it('turns status webhooks into delivered / failed lines with price and reason', () => {
    const events = describeWebhook(
      payload({
        statuses: [
          {
            id: 'wamid.1',
            status: 'delivered',
            recipient_id: '919999',
            pricing: { billable: true, category: 'marketing' },
          },
          {
            id: 'wamid.2',
            status: 'failed',
            recipient_id: '918888',
            errors: [{ code: 131049, title: 'Message failed to send', error_data: { details: 'healthy ecosystem' } }],
          },
        ],
      }),
    );
    expect(events).toMatchObject([
      { kind: 'status.delivered', level: 'success', waMessageId: 'wamid.1', phone: '919999', phoneNumberId: 'PN1' },
      { kind: 'status.failed', level: 'error', waMessageId: 'wamid.2' },
    ]);
    expect(events[0].summary).toContain('marketing · billable');
    expect(events[1].summary).toBe('Failed for 918888: (131049) Message failed to send — healthy ecosystem');
    expect((events[1].details?.explanation as { why: string }).why).toContain('marketing');
  });

  it('logs incoming messages and other webhook fields', () => {
    const [incoming] = describeWebhook(
      payload({ messages: [{ id: 'w3', from: '917777', type: 'button', button: { text: 'Know More' } }] }),
    );
    expect(incoming).toMatchObject({ kind: 'message.incoming', phone: '917777' });
    expect(incoming.summary).toContain('“Know More”');

    const [tpl] = describeWebhook(
      payload({ event: 'REJECTED', message_template_name: 'promo' }, 'message_template_status_update'),
    );
    expect(tpl).toMatchObject({ kind: 'webhook.message_template_status_update', level: 'warning' });
    expect(tpl.summary).toBe('Meta: message_template_status_update → REJECTED (promo)');
  });
});

describe('webhook signature reasons', () => {
  const make = (secret: string) =>
    new CloudApiWebhookService({ get: () => secret } as never, { entries: () => [] } as never);

  it('says exactly why a webhook was rejected', () => {
    const body = Buffer.from('{"a":1}');
    const good = `sha256=${createHmac('sha256', 'right').update(body).digest('hex')}`;
    expect(make('right').signatureProblem(body, good)).toBeNull();
    expect(make('wrong').signatureProblem(body, good)).toContain('different Meta app');
    expect(make('right').signatureProblem(body, undefined)).toContain('no X-Hub-Signature-256');
  });
});

describe('whatsapp events storage', () => {
  it('stores events and filters them by number and search', async () => {
    const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [WhatsAppEvent] });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddWhatsAppEvents1789100000000().up(qr);
    await new AddWhatsAppEvents1789100000000().up(qr); // idempotent
    const logs = new WhatsAppLogsService(ds.getRepository(WhatsAppEvent));

    logs.record({ sessionId: 's1', kind: 'send.accepted', waMessageId: 'wamid.ABC', phone: '919999', summary: 'Sent' });
    logs.record({ sessionId: 's2', kind: 'send.accepted', summary: 'Other business' });
    logs.record({ kind: 'webhook.unmatched', level: 'error', summary: 'Unmatched' });
    await new Promise(r => setTimeout(r, 50)); // record() is fire-and-forget

    expect((await logs.list({ sessionIds: ['s1'], includeGlobal: false })).map(e => e.summary)).toEqual(['Sent']);
    expect(await logs.list({ sessionIds: ['s1'], includeGlobal: false, search: 'ABC' })).toHaveLength(1);
    expect(await logs.list({ sessionIds: ['s1'], includeGlobal: false, search: '919999' })).toHaveLength(1);
    expect(await logs.list({ sessionIds: ['s1'], includeGlobal: true })).toHaveLength(2);
    expect(await logs.list({ sessionIds: [], includeGlobal: false })).toEqual([]);
    expect((await logs.lastSeen(['s1'])).unmatched24h).toBe(1);
    await ds.destroy();
  });
});
