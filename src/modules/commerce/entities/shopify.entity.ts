import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { dateColumnType, jsonColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

export type CheckoutStatus = 'waiting' | 'sent' | 'recovered' | 'purchased' | 'skipped' | 'failed';

/** One Shopify store per business, connected through a Dev Dashboard app (client credentials). */
@Entity('shopify_stores')
@Index(['businessId'], { unique: true })
@Index(['shopDomain'], { unique: true })
export class ShopifyStore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  /** e.g. my-shop.myshopify.com */
  @Column({ type: 'varchar', length: 255 })
  shopDomain: string;

  @Column({ type: 'varchar', length: 255 })
  clientId: string;

  /** Also signs webhooks (HMAC). Never returned by the API. */
  @Column({ type: 'text', select: false })
  clientSecret: string;

  /** Older admin-created custom apps give a fixed Admin API token instead of client credentials. */
  @Column({ type: 'text', nullable: true, select: false })
  legacyToken: string | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  shopName: string;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'connected' })
  status: 'connected' | 'error';

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'integer', default: 0 })
  productsSynced: number;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  lastSyncAt: Date | null;

  /** Webhook topic -> 'ok' or the error Shopify gave. */
  @Column({ type: jsonColumnType(), nullable: true })
  webhooks: Record<string, string> | null;

  @Column({ type: 'boolean', default: false })
  recoveryEnabled: boolean;

  @Column({ type: 'integer', default: 30 })
  recoveryDelayMinutes: number;

  @Column({ type: 'varchar', length: 60, default: '' })
  discountCode: string;

  @Column({ type: 'text' })
  messageTemplate: string;

  /** The WhatsApp number that sends recovery messages. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  sessionId: string | null;

  /** Country code added to local phone numbers (no + or 00), e.g. 91. */
  @Column({ type: 'varchar', length: 4, default: '91' })
  defaultCountryCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** A Shopify checkout we may send one WhatsApp reminder for. */
@Entity('shopify_checkouts')
@Index(['businessId', 'token'], { unique: true })
@Index(['status', 'sendAt'])
export class ShopifyCheckout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 100 })
  token: string;

  /** International digits, no + */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'text', nullable: true })
  checkoutUrl: string | null;

  @Column({ type: 'float', default: 0 })
  totalPrice: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'waiting' })
  status: CheckoutStatus;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  sendAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  sentAt: Date | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  recoveredAt: Date | null;

  @Column({ type: 'float', default: 0 })
  orderTotal: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
