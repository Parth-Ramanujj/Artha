/** Razorpay's hosted checkout: loads checkout.js once and resolves with the payment proof. */

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (e: { error?: { description?: string } }) => void): void;
}

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<RazorpayCtor> | null = null;

function loadCheckout(): Promise<RazorpayCtor> {
  const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new Error('Razorpay did not load'));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load Razorpay. Check your internet connection.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Opens the checkout for an order. Resolves with the ids and signature to verify on the server,
 * or null if the customer closed it without paying.
 */
export async function payWithRazorpay(order: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
}): Promise<{ orderId: string; paymentId: string; signature: string } | null> {
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'Artha Wallet',
      description: order.description,
      theme: { color: '#16a34a' },
      handler: (r: RazorpayResponse) =>
        resolve({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on('payment.failed', e => reject(new Error(e.error?.description || 'The payment failed.')));
    rzp.open();
  });
}
