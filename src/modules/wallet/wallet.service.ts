import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { createLogger } from '../../common/services/logger.service';
import { isUniqueConstraintError } from '../../common/utils/unique-constraint.util';
import { Session } from '../session/entities/session.entity';
import { Business } from '../business/entities/business.entity';
import { Notification } from '../conversation/entities/notification.entity';
import { Wallet, WalletRates } from './entities/wallet.entity';
import { WalletTransaction, WalletTxType } from './entities/wallet-transaction.entity';
import { WalletSettings } from './entities/wallet-settings.entity';
import { createRazorpayOrder, razorpayConfig, verifyPaymentSignature, verifyWebhookSignature } from './razorpay';

/** Default price per message the platform charges customers, in paise (super admin can change it). */
export const DEFAULT_RATES_PAISE: WalletRates = { marketing: 80, utility: 15, authentication: 15, service: 0 };
export const MIN_RECHARGE_INR = 100;
export const MAX_RECHARGE_INR = 100_000;

/** Price of one message for a customer, by Meta's pricing category. */
export function rateFor(rates: WalletRates, category: string | null | undefined): number {
  const c = (category ?? '').toLowerCase();
  if (c.startsWith('marketing')) return rates.marketing;
  if (c.startsWith('authentication')) return rates.authentication;
  if (c === 'utility') return rates.utility;
  return c === 'service' ? rates.service : 0;
}

const SETTINGS_ID = 'global';
const inr = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

/**
 * Customer wallets: Razorpay recharges in, WhatsApp message charges out. Every balance change runs in
 * a DB transaction together with its ledger row, and the ledger's unique (type, reference) makes a
 * repeated webhook or verify call a no-op instead of a double credit or charge.
 */
@Injectable()
export class WalletService {
  private readonly logger = createLogger('WalletService');

  constructor(
    @InjectRepository(Wallet, 'data') private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletTransaction, 'data') private readonly txs: Repository<WalletTransaction>,
    @InjectRepository(WalletSettings, 'data') private readonly settings: Repository<WalletSettings>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(Business, 'data') private readonly businesses: Repository<Business>,
    @InjectRepository(Notification, 'data') private readonly notifications: Repository<Notification>,
    @InjectDataSource('data') private readonly dataSource: DataSource,
  ) {}

  // ── read ──

  async getWallet(businessId: string): Promise<Wallet> {
    const existing = await this.wallets.findOne({ where: { businessId } });
    if (existing) return existing;
    try {
      return await this.wallets.save(this.wallets.create({ businessId }));
    } catch (err) {
      if (isUniqueConstraintError(err)) return this.wallets.findOneOrFail({ where: { businessId } });
      throw err;
    }
  }

  async defaultRates(): Promise<WalletRates> {
    const row = await this.settings.findOne({ where: { id: SETTINGS_ID } });
    return { ...DEFAULT_RATES_PAISE, ...(row?.ratesPaise ?? {}) };
  }

  async ratesFor(wallet: Wallet): Promise<WalletRates> {
    return { ...(await this.defaultRates()), ...(wallet.ratesPaise ?? {}) };
  }

  async overview(businessId: string, isPlatformAdmin: boolean) {
    const wallet = await this.getWallet(businessId);
    const cfg = razorpayConfig();
    return {
      enabled: wallet.enabled,
      balancePaise: wallet.balancePaise,
      blockWhenEmpty: wallet.blockWhenEmpty,
      lowBalanceAlertPaise: wallet.lowBalanceAlertPaise,
      ratesPaise: await this.ratesFor(wallet),
      razorpay: { configured: Boolean(cfg), keyId: cfg?.keyId ?? null },
      limits: { minRechargeInr: MIN_RECHARGE_INR, maxRechargeInr: MAX_RECHARGE_INR },
      isPlatformAdmin,
    };
  }

  async transactions(businessId: string, opts: { limit?: number; offset?: number; type?: WalletTxType }) {
    const [items, total] = await this.txs.findAndCount({
      where: { businessId, ...(opts.type ? { type: opts.type } : {}) },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(opts.limit ?? 50, 1), 500),
      skip: Math.max(opts.offset ?? 0, 0),
    });
    return { items, total };
  }

  // ── recharge (Razorpay) ──

  async createRechargeOrder(businessId: string, amountInr: number) {
    const cfg = razorpayConfig();
    if (!cfg) throw new ServiceUnavailableException('Online payment is not set up on this server yet.');
    if (!Number.isFinite(amountInr) || amountInr < MIN_RECHARGE_INR || amountInr > MAX_RECHARGE_INR) {
      throw new BadRequestException(`Recharge between ₹${MIN_RECHARGE_INR} and ₹${MAX_RECHARGE_INR}.`);
    }
    const amountPaise = Math.round(amountInr * 100);
    const order = await createRazorpayOrder(cfg, {
      amountPaise,
      receipt: `w_${randomUUID().slice(0, 30)}`,
      notes: { businessId, purpose: 'whatsapp_wallet' },
    }).catch(err => {
      throw new BadRequestException(
        `Razorpay could not create the payment: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    await this.txs.insert({
      businessId,
      type: 'recharge',
      status: 'pending',
      amountPaise,
      balanceAfterPaise: null,
      description: `Recharge ${inr(amountPaise)} (waiting for payment)`,
      reference: order.id,
      razorpayPaymentId: null,
    });
    return { orderId: order.id, amountPaise, currency: order.currency, keyId: cfg.keyId };
  }

  /** Checkout handler result: checks Razorpay's signature, then credits the wallet once. */
  async verifyRecharge(businessId: string, orderId: string, paymentId: string, signature: string) {
    const cfg = razorpayConfig();
    if (!cfg) throw new ServiceUnavailableException('Online payment is not set up on this server yet.');
    if (!verifyPaymentSignature(cfg, orderId, paymentId, signature)) {
      throw new BadRequestException(
        'The payment could not be verified. If money was taken, it will be added automatically or refunded by Razorpay.',
      );
    }
    const pending = await this.txs.findOne({ where: { type: 'recharge', reference: orderId, businessId } });
    if (!pending) throw new NotFoundException('This payment does not belong to your account.');
    return this.creditRecharge(orderId, paymentId);
  }

  /** Razorpay webhook (payment.captured / order.paid): the fallback if the browser closed before verify. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const cfg = razorpayConfig();
    if (!cfg || !rawBody || !signature || !verifyWebhookSignature(cfg, rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
    };
    const payment = event.payload?.payment?.entity;
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment?.order_id && payment.id) {
      await this.creditRecharge(payment.order_id, payment.id).catch(err =>
        this.logger.warn(`Webhook credit for ${payment.order_id} failed: ${String(err)}`),
      );
    }
    return { ok: true };
  }

  private async creditRecharge(orderId: string, paymentId: string) {
    return this.dataSource.transaction(async m => {
      const tx = await m.findOne(WalletTransaction, { where: { type: 'recharge', reference: orderId } });
      if (!tx) throw new NotFoundException('Unknown payment order');
      if (tx.status === 'success') return { credited: false, balancePaise: tx.balanceAfterPaise };
      const balance = await this.applyDelta(m, tx.businessId, tx.amountPaise);
      await m.update(WalletTransaction, tx.id, {
        status: 'success',
        balanceAfterPaise: balance,
        razorpayPaymentId: paymentId,
        description: `Recharge ${inr(tx.amountPaise)} via Razorpay`,
      });
      await m.update(Wallet, { businessId: tx.businessId }, { lowBalanceAlerted: false });
      return { credited: true, balancePaise: balance };
    });
  }

  /** Adds `delta` paise to the business's wallet inside the transaction and returns the new balance. */
  private async applyDelta(m: EntityManager, businessId: string, delta: number): Promise<number> {
    if (!(await m.findOne(Wallet, { where: { businessId } }))) await m.save(m.create(Wallet, { businessId }));
    // Atomic in SQL, then read back, so two concurrent changes both land and report the true balance.
    await m.increment(Wallet, { businessId }, 'balancePaise', delta);
    return (await m.findOneOrFail(Wallet, { where: { businessId } })).balancePaise;
  }

  // ── charges (WhatsApp messages) ──

  /**
   * Charges one paid WhatsApp message to the business that owns the session. Called once Meta has
   * priced the message; a repeat for the same message is ignored. Never throws.
   */
  async chargeMessage(sessionId: string, waMessageId: string, category: string | null): Promise<void> {
    try {
      const session = await this.sessions.findOne({ where: { id: sessionId }, select: { id: true, businessId: true } });
      if (!session?.businessId) return;
      const wallet = await this.wallets.findOne({ where: { businessId: session.businessId } });
      if (!wallet?.enabled) return;
      const price = rateFor(await this.ratesFor(wallet), category);
      if (price <= 0) return;
      const balance = await this.dataSource.transaction(async m => {
        await m.insert(WalletTransaction, {
          businessId: session.businessId!,
          type: 'charge',
          status: 'success',
          amountPaise: -price,
          balanceAfterPaise: null,
          description: `WhatsApp ${(category ?? 'message').toLowerCase()} message`,
          reference: `msg:${sessionId}:${waMessageId}`,
          razorpayPaymentId: null,
        });
        const after = await this.applyDelta(m, session.businessId!, -price);
        await m.update(
          WalletTransaction,
          { type: 'charge', reference: `msg:${sessionId}:${waMessageId}` },
          { balanceAfterPaise: after },
        );
        return after;
      });
      await this.maybeAlertLow(session.businessId, balance);
    } catch (err) {
      if (isUniqueConstraintError(err)) return; // already charged
      this.logger.warn(`Could not charge ${waMessageId}: ${String(err)}`);
    }
  }

  /**
   * Whether `count` messages of `category` can be paid for. Only says no for a billed wallet that is
   * set to stop when empty; everything else is allowed.
   */
  async canAfford(sessionId: string, category: string, count = 1): Promise<{ ok: boolean; reason?: string }> {
    const session = await this.sessions.findOne({ where: { id: sessionId }, select: { id: true, businessId: true } });
    if (!session?.businessId) return { ok: true };
    const wallet = await this.wallets.findOne({ where: { businessId: session.businessId } });
    if (!wallet?.enabled || !wallet.blockWhenEmpty) return { ok: true };
    const need = rateFor(await this.ratesFor(wallet), category) * count;
    if (need <= 0 || wallet.balancePaise >= need) return { ok: true };
    return {
      ok: false,
      reason: `Wallet balance ${inr(wallet.balancePaise)} is not enough (needs ${inr(need)}). Recharge your wallet to send.`,
    };
  }

  /** An in-app notification that opens the wallet page. Never throws. */
  async notify(businessId: string, title: string, message: string): Promise<void> {
    await this.notifications
      .insert({
        businessId,
        recipientId: null,
        type: 'wallet_low',
        title,
        message,
        data: { route: '/wallet' },
        read: false,
        readAt: null,
      })
      .catch(err => this.logger.warn(`Could not notify ${businessId}: ${String(err)}`));
  }

  private async maybeAlertLow(businessId: string, balancePaise: number) {
    const wallet = await this.wallets.findOne({ where: { businessId } });
    if (!wallet || wallet.lowBalanceAlerted || balancePaise >= wallet.lowBalanceAlertPaise) return;
    await this.wallets.update({ businessId }, { lowBalanceAlerted: true });
    await this.notifications.insert({
      businessId,
      recipientId: null,
      type: 'wallet_low',
      title: `Wallet balance is low: ${inr(balancePaise)}`,
      message: 'Recharge to keep sending WhatsApp messages without interruption.',
      data: { route: '/wallet' },
      read: false,
      readAt: null,
    });
  }

  // ── customer settings ──

  async setLowBalanceAlert(businessId: string, alertInr: number) {
    const wallet = await this.getWallet(businessId);
    wallet.lowBalanceAlertPaise = Math.max(0, Math.round(alertInr * 100));
    wallet.lowBalanceAlerted = false;
    return this.wallets.save(wallet);
  }

  // ── platform admin ──

  async listWallets() {
    const businesses = await this.businesses.find({ select: { id: true, name: true, isActive: true } });
    const wallets = businesses.length
      ? await this.wallets.find({ where: { businessId: In(businesses.map(b => b.id)) } })
      : [];
    const byId = new Map(wallets.map(w => [w.businessId, w]));
    return businesses.map(b => {
      const w = byId.get(b.id);
      return {
        businessId: b.id,
        name: b.name,
        active: b.isActive,
        enabled: w?.enabled ?? false,
        balancePaise: w?.balancePaise ?? 0,
        blockWhenEmpty: w?.blockWhenEmpty ?? true,
        ratesPaise: w?.ratesPaise ?? null,
      };
    });
  }

  async updateWallet(
    businessId: string,
    patch: { enabled?: boolean; blockWhenEmpty?: boolean; ratesPaise?: WalletRates | null },
  ) {
    if (!(await this.businesses.findOne({ where: { id: businessId } })))
      throw new NotFoundException('Business not found');
    const wallet = await this.getWallet(businessId);
    if (patch.enabled !== undefined) wallet.enabled = patch.enabled;
    if (patch.blockWhenEmpty !== undefined) wallet.blockWhenEmpty = patch.blockWhenEmpty;
    if (patch.ratesPaise !== undefined) wallet.ratesPaise = patch.ratesPaise;
    return this.wallets.save(wallet);
  }

  /** Manual credit (+) or debit (−) by the platform admin, with a note the customer sees. */
  async adjust(businessId: string, amountInr: number, note: string) {
    if (!(await this.businesses.findOne({ where: { id: businessId } })))
      throw new NotFoundException('Business not found');
    const amountPaise = Math.round(amountInr * 100);
    if (!amountPaise) throw new BadRequestException('Enter an amount other than 0.');
    return this.dataSource.transaction(async m => {
      const after = await this.applyDelta(m, businessId, amountPaise);
      await m.insert(WalletTransaction, {
        businessId,
        type: 'adjustment',
        status: 'success',
        amountPaise,
        balanceAfterPaise: after,
        description: note.trim() || (amountPaise > 0 ? 'Credit by admin' : 'Debit by admin'),
        reference: `adj:${randomUUID()}`,
        razorpayPaymentId: null,
      });
      if (amountPaise > 0) await m.update(Wallet, { businessId }, { lowBalanceAlerted: false });
      return { balancePaise: after };
    });
  }

  async setDefaultRates(rates: WalletRates) {
    await this.settings.save({ id: SETTINGS_ID, ratesPaise: rates });
    return this.defaultRates();
  }
}
