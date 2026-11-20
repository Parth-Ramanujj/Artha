import type { WalletTx } from '../services/api';

/** ₹ amount from paise, Indian grouping, two decimals. */
export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The wallet history as CSV (amounts in rupees), for accounting. */
export function walletCsv(rows: WalletTx[]): string {
  const header = ['Date', 'Type', 'Status', 'Details', 'Amount (INR)', 'Balance after (INR)', 'Reference', 'Razorpay payment'];
  const lines = rows.map(t =>
    [
      t.createdAt,
      t.type,
      t.status,
      t.description,
      (t.amountPaise / 100).toFixed(2),
      t.balanceAfterPaise === null ? null : (t.balanceAfterPaise / 100).toFixed(2),
      t.reference,
      t.razorpayPaymentId,
    ]
      .map(cell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}
