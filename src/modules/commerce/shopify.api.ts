import { createHmac } from 'node:crypto';
import { constantTimeEqual } from '../../common/security/constantTimeEqual';
import { normalizePhone } from '../sales-agent/sales-rules';

/** Latest stable Admin API version (supported until October 2027). */
export const SHOPIFY_API_VERSION = '2026-10';
const TIMEOUT_MS = 20_000;

export const WEBHOOK_TOPICS = ['CHECKOUTS_CREATE', 'CHECKOUTS_UPDATE', 'ORDERS_CREATE'] as const;

export const DEFAULT_TEMPLATE =
  'Hi {{first_name}}! You left some items in your cart ({{total}}). Complete your order here: {{checkout_url}}' +
  '\nUse code {{discount_code}} for a little extra off.';

/** "my-shop", "my-shop.myshopify.com" or "https://my-shop.myshopify.com/admin" -> "my-shop.myshopify.com". */
export function normalizeShopDomain(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  const domain = host.endsWith('.myshopify.com') ? host : `${host}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : null;
}

/** Shopify signs every webhook: base64 HMAC-SHA256 of the raw body with the app's client secret. */
export function shopifyHmacValid(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  return constantTimeEqual(header, expected);
}

/** Client credentials grant (Dev Dashboard app installed on the merchant's own store); tokens last 24 hours. */
export async function shopifyClientToken(
  shop: string,
  clientId: string,
  clientSecret: string,
): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
    errors?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(
      body.error_description || body.errors || body.error || `Shopify refused the app credentials (${res.status})`,
    );
  }
  return { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 86_399) * 1000 };
}

export async function shopifyGraphql<T>(
  shop: string,
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: unknown };
  if (!res.ok || !body.data) {
    const errs = body.errors;
    const msg =
      typeof errs === 'string'
        ? errs
        : Array.isArray(errs)
          ? errs.map(e => (e as { message?: string }).message).join('; ')
          : `Shopify returned ${res.status}`;
    throw new Error(msg || `Shopify returned ${res.status}`);
  }
  return body.data;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

export interface CheckoutEvent {
  token: string;
  phone: string | null;
  firstName: string | null;
  checkoutUrl: string | null;
  totalPrice: number;
  currency: string;
  completed: boolean;
  /** When the customer last touched the checkout. */
  updatedAt: Date;
}

/** The fields we use from a checkouts/create or checkouts/update payload. */
export function parseCheckout(payload: Obj, countryCode: string): CheckoutEvent | null {
  const token = str(payload.token);
  if (!token) return null;
  const customer = obj(payload.customer);
  const rawPhone =
    str(payload.phone) ||
    str(obj(payload.shipping_address).phone) ||
    str(obj(payload.billing_address).phone) ||
    str(customer.phone) ||
    str(payload.sms_marketing_phone);
  const phone = rawPhone ? normalizePhone(rawPhone, countryCode) : '';
  const updated = new Date(str(payload.updated_at) || str(payload.created_at));
  return {
    token,
    phone: phone.length >= 8 && phone.length <= 15 ? phone : null,
    firstName: str(customer.first_name) || str(obj(payload.shipping_address).first_name) || null,
    checkoutUrl: str(payload.abandoned_checkout_url) || null,
    totalPrice: Number(str(payload.total_price)) || 0,
    currency: str(payload.currency || payload.presentment_currency).slice(0, 3) || 'INR',
    completed: Boolean(payload.completed_at),
    updatedAt: Number.isNaN(updated.getTime()) ? new Date() : updated,
  };
}

/** The recovery message with the customer's details filled in. */
export function renderRecovery(
  template: string,
  v: { firstName: string | null; checkoutUrl: string | null; total: string; discountCode: string },
): string {
  // No code set: drop the lines that mention it rather than send "Use code  for...".
  const base = v.discountCode ? template : template.replace(/^.*{{\s*discount_code\s*}}.*$\n?/gm, '');
  return base
    .replace(/{{\s*first_name\s*}}/g, v.firstName || 'there')
    .replace(/{{\s*checkout_url\s*}}/g, v.checkoutUrl || '')
    .replace(/{{\s*total\s*}}/g, v.total)
    .replace(/{{\s*discount_code\s*}}/g, v.discountCode)
    .trim();
}
