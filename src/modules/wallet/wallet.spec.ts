import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import { AddWallet1789000000000 } from '../../database/migrations/1789000000000-AddWallet';
import { AddShopifyCommerce1790000000000 } from '../../database/migrations/1790000000000-AddShopifyCommerce';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WalletSettings } from './entities/wallet-settings.entity';
import { WalletService, rateFor, DEFAULT_RATES_PAISE, volumeDiscountPercent, discounted } from './wallet.service';
import { razorpayConfig, verifyPaymentSignature, verifyWebhookSignature } from './razorpay';

const KEY_SECRET = 'test_secret';
const sign = (data: string, secret = KEY_SECRET) => createHmac('sha256', secret).update(data).digest('hex');

describe('razorpay signatures', () => {
  const cfg = { keyId: 'rzp_test_1', keySecret: KEY_SECRET, webhookSecret: 'wh_secret' };

  it('accepts only the signature Razorpay computes', () => {
    expect(verifyPaymentSignature(cfg, 'order_1', 'pay_1', sign('order_1|pay_1'))).toBe(true);
    expect(verifyPaymentSignature(cfg, 'order_1', 'pay_2', sign('order_1|pay_1'))).toBe(false);
    expect(verifyWebhookSignature(cfg, '{"a":1}', sign('{"a":1}', 'wh_secret'))).toBe(true);
    expect(verifyWebhookSignature({ ...cfg, webhookSecret: undefined }, '{"a":1}', 'x')).toBe(false);
  });

  it('is off until both keys are set', () => {
    expect(razorpayConfig({})).toBeNull();
    expect(razorpayConfig({ RAZORPAY_KEY_ID: 'a', RAZORPAY_KEY_SECRET: 'b' })).toEqual({
      keyId: 'a',
      keySecret: 'b',
      webhookSecret: undefined,
    });
  });

  it('picks the highest tier reached and rounds the price down', () => {
    const tiers = [
      { fromMessages: 10_001, discountPercent: 20 },
      { fromMessages: 50_001, discountPercent: 36 },
    ];
    expect(volumeDiscountPercent(tiers, 10_000)).toBe(0);
    expect(volumeDiscountPercent(tiers, 10_001)).toBe(20);
    expect(volumeDiscountPercent(tiers, 60_000)).toBe(36);
    expect(volumeDiscountPercent(null, 60_000)).toBe(0);
    expect(discounted(80, 36)).toBe(51);
    expect(discounted(15, 0)).toBe(15);
  });

  it('prices a message by Meta category', () => {
    expect(rateFor(DEFAULT_RATES_PAISE, 'MARKETING')).toBe(80);
    expect(rateFor(DEFAULT_RATES_PAISE, 'marketing_lite')).toBe(80);
    expect(rateFor(DEFAULT_RATES_PAISE, 'utility')).toBe(15);
    expect(rateFor(DEFAULT_RATES_PAISE, 'service')).toBe(0);
    expect(rateFor(DEFAULT_RATES_PAISE, null)).toBe(0);
  });
});

describe('wallet ledger', () => {
  let ds: DataSource;
  let service: WalletService;
  const notifications = { insert: jest.fn().mockResolvedValue(undefined) };
  const sessions = { findOne: jest.fn().mockResolvedValue({ id: 's1', businessId: 'b1' }) };
  const businesses = { findOne: jest.fn().mockResolvedValue({ id: 'b1' }), find: jest.fn() };

  beforeEach(async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_1';
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Wallet, WalletTransaction, WalletSettings],
    });
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await new AddWallet1789000000000().up(qr);
    await new AddWallet1789000000000().up(qr); // idempotent
    await new AddShopifyCommerce1790000000000().up(qr);
    service = new WalletService(
      ds.getRepository(Wallet),
      ds.getRepository(WalletTransaction),
      ds.getRepository(WalletSettings),
      sessions as never,
      businesses as never,
      notifications as never,
      ds,
    );
    notifications.insert.mockClear();
  });
  afterEach(async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    await ds.destroy();
  });

  const balance = async () => (await ds.getRepository(Wallet).findOneByOrFail({ businessId: 'b1' })).balancePaise;

  it('credits a verified recharge exactly once, even when verify and the webhook both arrive', async () => {
    await ds.getRepository(WalletTransaction).insert({
      businessId: 'b1',
      type: 'recharge',
      status: 'pending',
      amountPaise: 50_000,
      balanceAfterPaise: null,
      description: 'Recharge',
      reference: 'order_1',
      razorpayPaymentId: null,
    });
    await expect(service.verifyRecharge('b1', 'order_1', 'pay_1', 'bad')).rejects.toThrow('could not be verified');
    await expect(service.verifyRecharge('b2', 'order_1', 'pay_1', sign('order_1|pay_1'))).rejects.toThrow(
      'does not belong',
    );

    await expect(service.verifyRecharge('b1', 'order_1', 'pay_1', sign('order_1|pay_1'))).resolves.toEqual({
      credited: true,
      balancePaise: 50_000,
    });
    await expect(service.verifyRecharge('b1', 'order_1', 'pay_1', sign('order_1|pay_1'))).resolves.toMatchObject({
      credited: false,
    });
    expect(await balance()).toBe(50_000);
  });

  it('charges a delivered paid message once, only when billing is on', async () => {
    await service.chargeMessage('s1', 'wamid.1', 'marketing'); // billing off: nothing
    expect(await ds.getRepository(WalletTransaction).count()).toBe(0);

    await service.updateWallet('b1', { enabled: true });
    await service.adjust('b1', 10, 'Welcome credit');
    await service.chargeMessage('s1', 'wamid.1', 'marketing');
    await service.chargeMessage('s1', 'wamid.1', 'marketing'); // repeated webhook
    await service.chargeMessage('s1', 'wamid.2', 'service'); // free
    expect(await balance()).toBe(1_000 - 80);
    const charges = await ds.getRepository(WalletTransaction).findBy({ type: 'charge' });
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ amountPaise: -80, balanceAfterPaise: 920 });
  });

  it('blocks sending when a stop-when-empty wallet cannot pay, and warns once when low', async () => {
    await service.updateWallet('b1', { enabled: true });
    await expect(service.canAfford('s1', 'marketing')).resolves.toMatchObject({ ok: false });
    await expect(service.canAfford('s1', 'service')).resolves.toEqual({ ok: true });

    await service.adjust('b1', 2, 'top up');
    await expect(service.canAfford('s1', 'marketing', 2)).resolves.toEqual({ ok: true });
    await service.updateWallet('b1', { blockWhenEmpty: false });
    await expect(service.canAfford('s1', 'marketing', 100)).resolves.toEqual({ ok: true });

    await service.chargeMessage('s1', 'wamid.9', 'marketing'); // below the ₹100 default alert
    await service.chargeMessage('s1', 'wamid.10', 'marketing');
    expect(notifications.insert).toHaveBeenCalledTimes(1);
  });

  it('applies the volume tier reached by each paid message this month', async () => {
    await expect(
      service.setVolumeTiers([
        { fromMessages: 3, discountPercent: 50 },
        { fromMessages: 2, discountPercent: 25 },
      ]),
    ).resolves.toEqual([
      { fromMessages: 2, discountPercent: 25 },
      { fromMessages: 3, discountPercent: 50 },
    ]);
    await expect(
      service.setVolumeTiers([
        { fromMessages: 2, discountPercent: 10 },
        { fromMessages: 2, discountPercent: 20 },
      ]),
    ).rejects.toThrow('Two tiers');
    await service.updateWallet('b1', { enabled: true });
    await service.adjust('b1', 10, '');
    for (const id of ['m1', 'm2', 'm3', 'm4']) await service.chargeMessage('s1', id, 'marketing');
    const charges = await ds.getRepository(WalletTransaction).findBy({ type: 'charge' });
    expect(charges.map(c => c.amountPaise).sort((a, b) => a - b)).toEqual([-80, -60, -40, -40]);
    expect(await balance()).toBe(1_000 - 80 - 60 - 40 - 40);
    expect(await service.monthPaidMessages('b1')).toBe(4);
    expect((await service.overview('b1', false)).volumeTiers).toHaveLength(2);
  });

  it('uses customer rates over platform defaults', async () => {
    await service.setDefaultRates({ marketing: 100, utility: 20, authentication: 20, service: 0 });
    const wallet = await service.updateWallet('b1', {
      enabled: true,
      ratesPaise: { marketing: 90, utility: 10, authentication: 10, service: 0 },
    });
    expect(await service.ratesFor(wallet)).toEqual({ marketing: 90, utility: 10, authentication: 10, service: 0 });
    await service.adjust('b1', 5, '');
    await service.chargeMessage('s1', 'wamid.3', 'utility');
    expect(await balance()).toBe(490);
  });
});
