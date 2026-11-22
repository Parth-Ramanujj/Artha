import type { CSSProperties } from 'react';

export const errText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
export const fmtMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(
    amount,
  );
export const inr = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
export const field: CSSProperties = { width: '100%' };
export const label: CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 };
