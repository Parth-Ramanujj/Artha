import { createHmac } from 'node:crypto';
import { normalizeShopDomain, parseCheckout, renderRecovery, shopifyHmacValid } from './shopify.api';
import { ShopifyService } from './shopify.service';
import type { ShopifyCheckout, ShopifyStore } from './entities/shopify.entity';

describe('Shopify helpers', () => {
  it('normalises the store address', () => {
    expect(normalizeShopDomain('My-Shop')).toBe('my-shop.myshopify.com');
    expect(normalizeShopDomain('https://my-shop.myshopify.com/admin/products')).toBe('my-shop.myshopify.com');
    expect(normalizeShopDomain('evil.com/x')).toBeNull();
    expect(normalizeShopDomain('')).toBeNull();
  });

  it('checks the webhook signature against the raw body', () => {
    const body = Buffer.from('{"token":"t1"}');
    const sig = createHmac('sha256', 'secret').update(body).digest('base64');
    expect(shopifyHmacValid(body, sig, 'secret')).toBe(true);
    expect(shopifyHmacValid(body, sig, 'other')).toBe(false);
    expect(shopifyHmacValid(Buffer.from('{"token":"t2"}'), sig, 'secret')).toBe(false);
    expect(shopifyHmacValid(body, undefined, 'secret')).toBe(false);
  });

  it('finds the phone on the checkout, shipping or billing address and adds the country code', () => {
    const base = { token: 't', total_price: '421.88', currency: 'INR', abandoned_checkout_url: 'https://x/r' };
    expect(parseCheckout({ ...base, phone: '+1 (613) 555-0101' }, '91')?.phone).toBe('16135550101');
    expect(parseCheckout({ ...base, shipping_address: { phone: '98765 43210' } }, '91')?.phone).toBe('919876543210');
    expect(parseCheckout({ ...base, billing_address: { phone: '09876543210' } }, '91')?.phone).toBe('919876543210');
    expect(parseCheckout({ ...base }, '91')?.phone).toBeNull();
    expect(parseCheckout({ ...base, completed_at: '2026-11-23T10:00:00Z' }, '91')?.completed).toBe(true);
    expect(parseCheckout({ total_price: '1' }, '91')).toBeNull();
  });

  it('fills the template and drops the discount line when there is no code', () => {
    const t = 'Hi {{first_name}}, {{total}}: {{checkout_url}}\nUse code {{discount_code}}!';
    const v = { firstName: 'Asha', checkoutUrl: 'https://x/r', total: 'INR 10.00' };
    expect(renderRecovery(t, { ...v, discountCode: 'SAVE5' })).toBe('Hi Asha, INR 10.00: https://x/r\nUse code SAVE5!');
    expect(renderRecovery(t, { ...v, discountCode: '' })).toBe('Hi Asha, INR 10.00: https://x/r');
    expect(renderRecovery('Hi {{first_name}}', { ...v, firstName: null, discountCode: '' })).toBe('Hi there');
  });
});

describe('Cart recovery', () => {
  const secret = 'shh';
  const store = {
    id: 's1',
    businessId: 'b1',
    shopDomain: 'my-shop.myshopify.com',
    clientSecret: secret,
    recoveryEnabled: true,
    recoveryDelayMinutes: 30,
    discountCode: 'BACK10',
    messageTemplate: 'Hi {{first_name}} {{checkout_url}} {{discount_code}}',
    sessionId: 'sess-1',
    defaultCountryCode: '91',
  } as unknown as ShopifyStore;

  function setup() {
    const rows: ShopifyCheckout[] = [];
    const match = (where: Record<string, unknown>) => (r: ShopifyCheckout) =>
      Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v);
    const checkouts = {
      findOne: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.find(match(where)) ?? null),
      ),
      find: jest.fn(() =>
        Promise.resolve(rows.filter(r => r.status === 'waiting' && r.sendAt && r.sendAt <= new Date())),
      ),
      create: (v: Partial<ShopifyCheckout>) => ({ ...v }) as ShopifyCheckout,
      save: jest.fn((v: ShopifyCheckout) => {
        if (!v.id) {
          v.id = `c${rows.length + 1}`;
          rows.push(v);
        } else
          Object.assign(
            rows.find(r => r.id === v.id)!,
            v,
          );
        return Promise.resolve(v);
      }),
      update: jest.fn((where: string | Record<string, unknown>, patch: Partial<ShopifyCheckout>) => {
        const hits = rows.filter(typeof where === 'string' ? r => r.id === where : match(where));
        hits.forEach(r => Object.assign(r, patch));
        return Promise.resolve({ affected: hits.length });
      }),
    };
    const qb = { addSelect: () => qb, where: () => qb, getOne: () => Promise.resolve(store) };
    const stores = { createQueryBuilder: () => qb, findOne: jest.fn(() => Promise.resolve(store)) };
    const messages = { sendText: jest.fn().mockResolvedValue({}) };
    const service = new ShopifyService(
      stores as never,
      checkouts as never,
      {} as never,
      {} as never,
      messages as never,
    );
    const deliver = (topic: string, payload: unknown) => {
      const raw = Buffer.from(JSON.stringify(payload));
      return service.handleWebhook(
        store.shopDomain,
        topic,
        raw,
        createHmac('sha256', secret).update(raw).digest('base64'),
      );
    };
    return { service, rows, messages, deliver };
  }

  const checkout = (over: Record<string, unknown> = {}) => ({
    token: 'tok1',
    phone: '+919876543210',
    customer: { first_name: 'Asha' },
    abandoned_checkout_url: 'https://my-shop.myshopify.com/recover/1',
    total_price: '499.00',
    currency: 'INR',
    completed_at: null,
    updated_at: new Date(Date.now() - 40 * 60_000).toISOString(),
    ...over,
  });

  it('refuses a webhook with a bad signature', async () => {
    const { service, rows } = setup();
    expect(await service.handleWebhook(store.shopDomain, 'checkouts/create', Buffer.from('{}'), 'bad')).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it('sends one reminder after the delay, and counts the order as recovered', async () => {
    const { service, rows, messages, deliver } = setup();
    await deliver('checkouts/create', checkout());
    expect(rows[0]).toMatchObject({ status: 'waiting', phone: '919876543210', firstName: 'Asha' });

    await service.tick();
    await service.tick();
    expect(messages.sendText).toHaveBeenCalledTimes(1);
    expect(messages.sendText).toHaveBeenCalledWith('sess-1', {
      chatId: '919876543210@c.us',
      text: 'Hi Asha https://my-shop.myshopify.com/recover/1 BACK10',
    });
    expect(rows[0].status).toBe('sent');

    await deliver('orders/create', { checkout_token: 'tok1', total_price: '499.00' });
    expect(rows[0]).toMatchObject({ status: 'recovered', orderTotal: 499 });
  });

  it('does not message customers who bought before the delay', async () => {
    const { service, rows, messages, deliver } = setup();
    await deliver('checkouts/create', checkout({ updated_at: new Date().toISOString() }));
    await deliver('orders/create', { checkout_token: 'tok1', total_price: '499.00' });
    expect(rows[0].status).toBe('purchased');
    await service.tick();
    expect(messages.sendText).not.toHaveBeenCalled();
  });

  it('skips checkouts without a phone or link, and marks a failed send', async () => {
    const { service, rows, messages, deliver } = setup();
    await deliver('checkouts/create', checkout({ token: 'a', phone: null }));
    await deliver('checkouts/create', checkout({ token: 'b', abandoned_checkout_url: null }));
    expect(rows.map(r => r.status)).toEqual(['skipped', 'skipped']);

    messages.sendText.mockRejectedValueOnce(new Error('Session not connected'));
    await deliver('checkouts/create', checkout({ token: 'c' }));
    await service.tick();
    expect(rows[2]).toMatchObject({ status: 'failed', error: 'Session not connected' });
  });
});
