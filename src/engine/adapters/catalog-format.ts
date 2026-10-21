/** Most products a catalog read loads; WhatsApp business catalogs are usually far smaller. */
export const CATALOG_MAX = 1000;

/** "₹1,499.00" style price; an unknown currency code still yields "1499 XYZ" instead of throwing. */
export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(price);
  } catch {
    return `${price} ${currency}`.trim();
  }
}
