import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Like, Not, Repository } from 'typeorm';
import { MessageService } from '../message/message.service';
import { StudioProduct } from '../message-studio/entities/studio-product.entity';
import { Session } from '../session/entities/session.entity';
import { phoneToChatId } from '../sales-agent/sales-rules';
import { ShopifyCheckout, ShopifyStore } from './entities/shopify.entity';
import { ConnectShopifyDto, ShopifyRecoveryDto } from './dto/shopify.dto';
import {
  DEFAULT_TEMPLATE,
  normalizeShopDomain,
  parseCheckout,
  renderRecovery,
  shopifyClientToken,
  shopifyGraphql,
  shopifyHmacValid,
  WEBHOOK_TOPICS,
} from './shopify.api';

const TICK_MS = 60_000;
const DUE_BATCH = 50;
/** A reminder that could not go out within a day (recovery off, number disconnected) is dropped, not sent late. */
const MAX_LATE_MS = 24 * 60 * 60_000;
// shortcut: catalog sync reads at most 40 pages of 50 (2,000 products); page further if stores get bigger.
const MAX_PRODUCT_PAGES = 40;
const SKU_PREFIX = 'shopify-';

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const money = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  onlineStoreUrl: string | null;
  featuredMedia: { preview?: { image?: { url?: string } | null } | null } | null;
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
}

@Injectable()
export class ShopifyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShopifyService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;
  // shortcut: client-credential tokens are cached in memory (one API instance); a restart just fetches new ones.
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    @InjectRepository(ShopifyStore, 'data') private readonly stores: Repository<ShopifyStore>,
    @InjectRepository(ShopifyCheckout, 'data') private readonly checkouts: Repository<ShopifyCheckout>,
    @InjectRepository(StudioProduct, 'data') private readonly products: Repository<StudioProduct>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    private readonly messages: MessageService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── connection ──

  private withSecrets() {
    return this.stores.createQueryBuilder('s').addSelect('s.clientSecret').addSelect('s.legacyToken');
  }

  private async storeFor(businessId: string, secrets = false): Promise<ShopifyStore> {
    const store = secrets
      ? await this.withSecrets().where('s.businessId = :businessId', { businessId }).getOne()
      : await this.stores.findOne({ where: { businessId } });
    if (!store) throw new NotFoundException('Connect your Shopify store first');
    return store;
  }

  private async token(store: ShopifyStore): Promise<string> {
    if (store.legacyToken) return store.legacyToken;
    const cached = this.tokens.get(store.shopDomain);
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
    const fresh = await shopifyClientToken(store.shopDomain, store.clientId, store.clientSecret);
    this.tokens.set(store.shopDomain, fresh);
    return fresh.token;
  }

  private async gql<T>(store: ShopifyStore, query: string, variables?: Record<string, unknown>): Promise<T> {
    return shopifyGraphql<T>(store.shopDomain, await this.token(store), query, variables);
  }

  /** Checks the app keys against the store, saves them, and subscribes the store's webhooks. */
  async connect(businessId: string, dto: ConnectShopifyDto, publicOrigin: string) {
    const shopDomain = normalizeShopDomain(dto.shopDomain);
    if (!shopDomain) throw new BadRequestException('Enter the store address, e.g. my-shop.myshopify.com');
    const other = await this.stores.findOne({ where: { shopDomain } });
    if (other && other.businessId !== businessId) {
      throw new ConflictException('This Shopify store is already connected to another business');
    }
    const existing = await this.withSecrets().where('s.businessId = :businessId', { businessId }).getOne();
    const store = this.stores.create({
      ...(existing ?? {}),
      businessId,
      shopDomain,
      clientId: dto.clientId.trim(),
      // Editing the connection without retyping the secret keeps the saved one.
      clientSecret: dto.clientSecret?.trim() || existing?.clientSecret || '',
      legacyToken: dto.accessToken?.trim() || null,
      messageTemplate: existing?.messageTemplate || DEFAULT_TEMPLATE,
    });
    if (!store.clientSecret) throw new BadRequestException('Enter the app’s client secret');
    this.tokens.delete(shopDomain);

    let shop: { name: string; currencyCode: string };
    try {
      shop = (await this.gql<{ shop: { name: string; currencyCode: string } }>(store, '{ shop { name currencyCode } }'))
        .shop;
    } catch (err) {
      throw new BadRequestException(`Shopify did not accept these details: ${errMsg(err)}`);
    }
    store.shopName = shop.name;
    store.currency = shop.currencyCode;
    store.status = 'connected';
    store.lastError = null;
    store.webhooks = await this.subscribeWebhooks(store, publicOrigin);
    await this.stores.save(store);
    return this.overview(businessId, publicOrigin);
  }

  /** The URL Shopify delivers to; needs a public https address. */
  webhookUrl(publicOrigin: string): string | null {
    const base = (process.env.BASE_URL || publicOrigin || '').trim().replace(/\/+$/, '');
    return /^https:\/\//i.test(base) ? `${base}/api/commerce/shopify/webhook` : null;
  }

  private async subscribeWebhooks(store: ShopifyStore, publicOrigin: string): Promise<Record<string, string>> {
    const uri = this.webhookUrl(publicOrigin);
    const result: Record<string, string> = {};
    for (const topic of WEBHOOK_TOPICS) {
      if (!uri) {
        result[topic] = 'Needs a public https address (set BASE_URL on the server)';
        continue;
      }
      try {
        const res = await this.gql<{
          webhookSubscriptionCreate: { userErrors: Array<{ message: string }> };
        }>(
          store,
          `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { userErrors { field message } }
          }`,
          { topic, sub: { uri, format: 'JSON' } },
        );
        const errors = res.webhookSubscriptionCreate.userErrors.map(e => e.message);
        // Connecting again finds the subscription already there.
        result[topic] = errors.length === 0 || errors.every(e => /taken|exists/i.test(e)) ? 'ok' : errors.join('; ');
      } catch (err) {
        result[topic] = errMsg(err);
      }
    }
    return result;
  }

  async disconnect(businessId: string): Promise<void> {
    const store = await this.storeFor(businessId);
    this.tokens.delete(store.shopDomain);
    await this.stores.delete(store.id);
  }

  // ── overview ──

  async overview(businessId: string, publicOrigin = '') {
    const store = await this.stores.findOne({ where: { businessId } });
    const webhookUrl = this.webhookUrl(publicOrigin);
    if (!store) return { connected: false as const, webhookUrl, defaultTemplate: DEFAULT_TEMPLATE };
    const count = (status: ShopifyCheckout['status'][]) =>
      this.checkouts.count({ where: { businessId, status: In(status) } });
    const recovered = await this.checkouts.find({
      where: { businessId, status: 'recovered' },
      select: { id: true, orderTotal: true },
    });
    return {
      connected: true as const,
      webhookUrl,
      defaultTemplate: DEFAULT_TEMPLATE,
      store,
      stats: {
        abandoned: await this.checkouts.count({ where: { businessId, status: Not('purchased') } }),
        waiting: await count(['waiting']),
        sent: await count(['sent', 'recovered']),
        recovered: recovered.length,
        recoveredRevenue: recovered.reduce((sum, c) => sum + (c.orderTotal || 0), 0),
        failed: await count(['failed']),
      },
      recent: await this.checkouts.find({ where: { businessId }, order: { updatedAt: 'DESC' }, take: 25 }),
    };
  }

  // ── catalog ──

  /** Copies the store's products into the product catalog used in WhatsApp messages. */
  async syncCatalog(businessId: string) {
    const store = await this.storeFor(businessId, true);
    const seen = new Set<string>();
    let cursor: string | null = null;
    let complete = false;
    try {
      for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
        const res: {
          products: { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
        } = await this.gql(
          store,
          `query($cursor: String) {
            products(first: 50, after: $cursor) {
              nodes {
                id title handle onlineStoreUrl
                featuredMedia { preview { image { url } } }
                priceRangeV2 { minVariantPrice { amount currencyCode } }
              }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          { cursor },
        );
        for (const p of res.products.nodes) seen.add(await this.upsertProduct(store, p));
        if (!res.products.pageInfo.hasNextPage) {
          complete = true;
          break;
        }
        cursor = res.products.pageInfo.endCursor;
      }
    } catch (err) {
      await this.stores.update(store.id, { status: 'error', lastError: `Catalog sync: ${errMsg(err)}` });
      throw new BadRequestException(`Shopify catalog sync failed: ${errMsg(err)}`);
    }
    // Products deleted in Shopify leave the catalog too (only after a full read, so a cut-off sync removes nothing).
    let archived = 0;
    if (complete) {
      const stale = await this.products.find({
        where: { businessId, sku: Like(`${SKU_PREFIX}%`), archived: false },
        select: { id: true, sku: true },
      });
      const gone = stale.filter(p => p.sku && !seen.has(p.sku)).map(p => p.id);
      if (gone.length) await this.products.update({ id: In(gone) }, { archived: true });
      archived = gone.length;
    }
    await this.stores.update(store.id, {
      productsSynced: seen.size,
      lastSyncAt: new Date(),
      status: 'connected',
      lastError: null,
    });
    return { synced: seen.size, archived, complete };
  }

  private async upsertProduct(store: ShopifyStore, p: ProductNode): Promise<string> {
    const sku = `${SKU_PREFIX}${p.id.split('/').pop()}`;
    const existing = await this.products.findOne({ where: { businessId: store.businessId, sku } });
    await this.products.save(
      this.products.create({
        ...(existing ?? {}),
        businessId: store.businessId,
        sku,
        name: p.title.slice(0, 150),
        price: Number(p.priceRangeV2.minVariantPrice.amount) || 0,
        currency: p.priceRangeV2.minVariantPrice.currencyCode.slice(0, 3),
        imageUrl: p.featuredMedia?.preview?.image?.url ?? existing?.imageUrl ?? null,
        productUrl: p.onlineStoreUrl || `https://${store.shopDomain}/products/${p.handle}`,
        category: existing?.category ?? 'Shopify',
        inStock: existing?.inStock ?? true,
        archived: false,
      }),
    );
    return sku;
  }

  // ── recovery settings ──

  async saveRecovery(businessId: string, dto: ShopifyRecoveryDto, publicOrigin = '') {
    const store = await this.storeFor(businessId);
    if (dto.sessionId !== undefined && dto.sessionId) {
      const session = await this.sessions.findOne({
        where: { id: dto.sessionId },
        select: { id: true, businessId: true },
      });
      if (!session || (session.businessId && session.businessId !== businessId)) {
        throw new BadRequestException('Pick one of your WhatsApp numbers');
      }
    }
    if (dto.enabled && !(dto.sessionId ?? store.sessionId)) {
      throw new BadRequestException('Pick the WhatsApp number that sends the reminders');
    }
    await this.stores.update(store.id, {
      ...(dto.enabled !== undefined ? { recoveryEnabled: dto.enabled } : {}),
      ...(dto.delayMinutes !== undefined ? { recoveryDelayMinutes: dto.delayMinutes } : {}),
      ...(dto.discountCode !== undefined ? { discountCode: dto.discountCode.trim() } : {}),
      ...(dto.messageTemplate !== undefined ? { messageTemplate: dto.messageTemplate.trim() || DEFAULT_TEMPLATE } : {}),
      ...(dto.sessionId !== undefined ? { sessionId: dto.sessionId || null } : {}),
      ...(dto.defaultCountryCode !== undefined ? { defaultCountryCode: dto.defaultCountryCode } : {}),
    });
    return this.overview(businessId, publicOrigin);
  }

  /** Sends the reminder, filled with sample cart details, to a number of the business's choosing. */
  async sendTest(businessId: string, phone: string) {
    const store = await this.storeFor(businessId);
    if (!store.sessionId) throw new BadRequestException('Pick the WhatsApp number that sends the reminders');
    const chatId = phoneToChatId(phone);
    if (!chatId) throw new BadRequestException('Enter the phone number with country code');
    const text = renderRecovery(store.messageTemplate, {
      firstName: 'Test',
      checkoutUrl: `https://${store.shopDomain}/cart`,
      total: money(999, store.currency),
      discountCode: store.discountCode,
    });
    await this.messages.sendText(store.sessionId, { chatId, text });
    return { sent: true, text };
  }

  // ── webhooks ──

  /** Verified by the store's own client secret; unknown stores and bad signatures are refused. */
  async handleWebhook(shopDomain: string, topic: string, rawBody: Buffer | undefined, hmac: string | undefined) {
    const shop = normalizeShopDomain(shopDomain || '');
    const store = shop ? await this.withSecrets().where('s.shopDomain = :shop', { shop }).getOne() : null;
    if (!store || !rawBody || !shopifyHmacValid(rawBody, hmac, store.clientSecret)) return false;
    const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    if (topic === 'checkouts/create' || topic === 'checkouts/update') await this.onCheckout(store, payload);
    else if (topic === 'orders/create') await this.onOrder(store, payload);
    return true;
  }

  private async onCheckout(store: ShopifyStore, payload: Record<string, unknown>) {
    const c = parseCheckout(payload, store.defaultCountryCode);
    if (!c) return;
    const existing = await this.checkouts.findOne({ where: { businessId: store.businessId, token: c.token } });
    // A message already went out (or the order came in): later updates change nothing.
    if (existing && existing.status !== 'waiting' && existing.status !== 'skipped') return;
    const row = this.checkouts.create({
      ...(existing ?? {}),
      businessId: store.businessId,
      token: c.token,
      phone: c.phone,
      firstName: c.firstName,
      checkoutUrl: c.checkoutUrl,
      totalPrice: c.totalPrice,
      currency: c.currency,
    });
    if (c.completed) {
      row.status = 'purchased';
      row.sendAt = null;
    } else if (!c.phone) {
      row.status = 'skipped';
      row.error = 'No phone number on the checkout';
    } else if (!c.checkoutUrl) {
      row.status = 'skipped';
      row.error = 'Shopify sent no checkout link (the app needs access to customer name, email, phone and address)';
    } else {
      // Counted from the customer's last activity, so someone still typing their address isn't nudged.
      row.status = 'waiting';
      row.error = null;
      row.sendAt = new Date(c.updatedAt.getTime() + store.recoveryDelayMinutes * 60_000);
    }
    await this.checkouts.save(row);
  }

  private async onOrder(store: ShopifyStore, payload: Record<string, unknown>) {
    const token = typeof payload.checkout_token === 'string' ? payload.checkout_token : '';
    const total = Number(payload.total_price) || 0;
    const row = token
      ? await this.checkouts.findOne({ where: { businessId: store.businessId, token } })
      : await this.recentSentByPhone(store, payload);
    if (!row) return;
    if (row.status === 'sent') {
      await this.checkouts.update(row.id, { status: 'recovered', recoveredAt: new Date(), orderTotal: total });
    } else if (row.status === 'waiting' || row.status === 'skipped' || row.status === 'failed') {
      await this.checkouts.update(row.id, { status: 'purchased', sendAt: null });
    }
  }

  /** Orders without a checkout token: the last reminder sent to the same phone in the past week. */
  private async recentSentByPhone(store: ShopifyStore, payload: Record<string, unknown>) {
    const c = parseCheckout({ ...payload, token: 'order' }, store.defaultCountryCode);
    if (!c?.phone) return null;
    const row = await this.checkouts.findOne({
      where: { businessId: store.businessId, phone: c.phone, status: 'sent' },
      order: { sentAt: 'DESC' },
    });
    return row?.sentAt && Date.now() - row.sentAt.getTime() < 7 * 24 * 60 * 60_000 ? row : null;
  }

  // ── sending ──

  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.checkouts.find({
        where: { status: 'waiting', sendAt: LessThanOrEqual(now) },
        order: { sendAt: 'ASC' },
        take: DUE_BATCH,
      });
      for (const row of due) await this.sendReminder(row, now);
    } catch (err) {
      this.logger.error(`Cart recovery run failed: ${errMsg(err)}`);
    } finally {
      this.ticking = false;
    }
  }

  private async sendReminder(row: ShopifyCheckout, now: Date) {
    const store = await this.stores.findOne({ where: { businessId: row.businessId } });
    const skip = (error: string) => this.checkouts.update(row.id, { status: 'skipped', error });
    if (!store) return skip('Store disconnected');
    if (!store.recoveryEnabled || !store.sessionId) return skip('Cart recovery was off');
    if (row.sendAt && now.getTime() - row.sendAt.getTime() > MAX_LATE_MS) return skip('Too late to send');
    const chatId = row.phone ? phoneToChatId(row.phone) : null;
    if (!chatId) return skip('No valid phone number');
    // Claim first so a slow send and the next tick never message the same customer twice.
    const claim = await this.checkouts.update({ id: row.id, status: 'waiting' }, { status: 'sent', sentAt: now });
    if (!claim.affected) return;
    const text = renderRecovery(store.messageTemplate, {
      firstName: row.firstName,
      checkoutUrl: row.checkoutUrl,
      total: money(row.totalPrice, row.currency),
      discountCode: store.discountCode,
    });
    try {
      await this.messages.sendText(store.sessionId, { chatId, text });
    } catch (err) {
      await this.checkouts.update(row.id, { status: 'failed', error: errMsg(err).slice(0, 1000) });
    }
  }
}
