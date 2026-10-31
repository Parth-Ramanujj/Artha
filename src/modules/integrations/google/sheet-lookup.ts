/**
 * Pure rules for finding a customer's row in a Google Sheet: how phone numbers are compared, how a
 * phone number is read out of a message, and how a column header becomes a safe token name.
 */

import { scalarToString } from '../../../common/utils/scalar-string';

/** Digits only: "+91 98765-43210" → "919876543210". */
export function digitsOf(value: unknown): string {
  return scalarToString(value).replace(/\D/g, '');
}

/**
 * The part of a phone number that identifies it across formats: the last 10 digits. "+91 98765 43210",
 * "98765 43210" and "09876543210" all become "9876543210". Shorter values keep every digit.
 */
export function phoneKey(value: unknown): string {
  const digits = digitsOf(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** A phone-like value is 7–15 digits once separators are removed. */
export function looksLikePhone(value: unknown): boolean {
  const digits = digitsOf(value);
  return digits.length >= 7 && digits.length <= 15 && /^[\s+\-()\d]+$/.test(scalarToString(value).trim());
}

/** The first phone number written in a message, or null. */
export function extractPhoneFromText(text: string): string | null {
  const match = text.match(/\+?\d[\d\s\-()]{6,}\d/g);
  if (!match) return null;
  const found = match.find(m => looksLikePhone(m.trim()));
  return found ? found.trim() : null;
}

/** Does a cell in the sheet match the value we are looking for? */
export function cellMatches(cell: unknown, wanted: string): boolean {
  const w = String(wanted ?? '').trim();
  if (!w) return false;
  if (looksLikePhone(w)) {
    const k = phoneKey(w);
    return k.length > 0 && phoneKey(cell) === k;
  }
  return scalarToString(cell).trim().toLowerCase() === w.toLowerCase();
}

/** "Order No." → "order_no". Used for the fields that workflow tokens can reference. */
export function fieldKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The column most likely to hold the customer's number: Phone, Mobile, WhatsApp, Contact… */
export function suggestKeyColumn(headers: string[]): string {
  const names = headers.map(h => h.trim()).filter(Boolean);
  const preference = [/^phone$/i, /whatsapp/i, /mobile/i, /phone/i, /contact/i, /number/i, /^no\.?$/i];
  for (const rx of preference) {
    const hit = names.find(n => rx.test(n));
    if (hit) return hit;
  }
  return names[0] ?? 'Phone';
}
