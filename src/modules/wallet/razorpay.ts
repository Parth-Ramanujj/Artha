import { createHmac, timingSafeEqual } from 'crypto';

/**
 * The few Razorpay calls the wallet needs, over HTTPS without the SDK. Keys come from
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET; RAZORPAY_WEBHOOK_SECRET signs webhooks.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

export function razorpayConfig(env: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined };
}

const sameHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checkout success handler: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(cfg: RazorpayConfig, orderId: string, paymentId: string, signature: string) {
  const expected = createHmac('sha256', cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return sameHex(expected, signature);
}

/** Webhook: X-Razorpay-Signature = HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(cfg: RazorpayConfig, rawBody: Buffer | string, signature: string) {
  if (!cfg.webhookSecret) return false;
  const expected = createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex');
  return sameHex(expected, signature);
}

/** Creates an order the checkout pays into. Amount in paise. */
export async function createRazorpayOrder(
  cfg: RazorpayConfig,
  input: { amountPaise: number; receipt: string; notes: Record<string, string> },
): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: input.amountPaise, currency: 'INR', receipt: input.receipt, notes: input.notes }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    amount?: number;
    currency?: string;
    error?: { description?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.description || `Razorpay returned HTTP ${res.status}`);
  }
  return { id: data.id, amount: data.amount ?? input.amountPaise, currency: data.currency ?? 'INR' };
}
