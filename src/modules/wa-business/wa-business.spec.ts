import { readWebhookInsights } from './wa-webhook-insights';
import { buildInvoicePdf, invoiceTotals } from './invoice-pdf';

const change = (field: string, value: Record<string, unknown>) => ({ entry: [{ changes: [{ field, value }] }] });

describe('readWebhookInsights', () => {
  it('reads a Click-to-WhatsApp ad referral from the first message', () => {
    const r = readWebhookInsights(
      change('messages', {
        metadata: { phone_number_id: 'PN1' },
        contacts: [{ wa_id: '916352701839', profile: { name: 'Kunal' } }],
        messages: [
          {
            from: '916352701839',
            type: 'text',
            text: { body: 'Price?' },
            referral: { source_type: 'ad', source_id: '120', headline: 'Diwali offer', ctwa_clid: 'abc' },
          },
          { from: '919000000000', type: 'text', text: { body: 'hi' } },
        ],
      }),
    );
    expect(r.referrals).toEqual([
      expect.objectContaining({
        phone: '916352701839',
        customerName: 'Kunal',
        sourceId: '120',
        headline: 'Diwali offer',
        ctwaClid: 'abc',
        firstMessage: 'Price?',
      }),
    ]);
  });

  it('marks an unanswered customer call as missed and an answered one as completed', () => {
    const r = readWebhookInsights(
      change('calls', {
        calls: [
          { id: 'c1', from: '9111', event: 'terminate', direction: 'USER_INITIATED', status: 'FAILED' },
          {
            id: 'c2',
            from: '9222',
            event: 'terminate',
            direction: 'USER_INITIATED',
            status: 'COMPLETED',
            duration: 42,
          },
          { id: 'c3', from: '9333', event: 'connect', direction: 'USER_INITIATED' },
        ],
      }),
    );
    expect(r.calls.map(c => [c.callId, c.status, c.durationSec])).toEqual([
      ['c1', 'missed', 0],
      ['c2', 'completed', 42],
      ['c3', 'ringing', 0],
    ]);
  });

  it('turns template pause, red quality and number downgrade into alerts, and ignores good news', () => {
    const alerts = [
      change('message_template_status_update', { event: 'PAUSED', message_template_name: 'offer' }),
      change('message_template_status_update', { event: 'APPROVED', message_template_name: 'offer' }),
      change('message_template_quality_update', { new_quality_score: 'RED', message_template_name: 'offer' }),
      change('message_template_quality_update', { new_quality_score: 'GREEN', message_template_name: 'offer' }),
      change('phone_number_quality_update', { event: 'DOWNGRADE', current_limit: 'TIER_250' }),
    ].flatMap(b => readWebhookInsights(b).alerts);
    expect(alerts.map(a => a.title)).toEqual([
      'Template “offer” was paused by Meta',
      'Template “offer” quality dropped to LOW (red)',
      'your number: daily messaging limit lowered to TIER_250',
    ]);
    expect(alerts.every(a => a.severe)).toBe(true);
  });
});

describe('invoice', () => {
  const items = [
    { name: 'Plan (1 month)', qty: 2, price: 499.5 },
    { name: 'Setup', qty: 1, price: 100 },
  ];

  it('adds GST in paise without rounding drift', () => {
    expect(invoiceTotals(items, 18)).toEqual({ subtotalPaise: 109900, gstPaise: 19782, totalPaise: 129682 });
    expect(invoiceTotals(items, 0).totalPaise).toBe(109900);
  });

  it('writes a valid one-page PDF whose xref points at each object', () => {
    const pdf = buildInvoicePdf({
      number: 'INV-0001',
      date: new Date('2026-11-20'),
      sellerName: 'Artha (Demo)',
      sellerGstin: '24ABCDE1234F1Z5',
      customerName: 'Kunal ₹ શાહ',
      phone: '916352701839',
      items,
      gstPercent: 18,
      status: 'paid',
    }).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain(String.raw`(Artha \(Demo\)) Tj`);
    expect(pdf).toContain('Kunal Rs. ???');
    const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...pdf.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map(m => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.startsWith(`${i + 1} 0 obj`, o)).toBe(true));
  });
});
