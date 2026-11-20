import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { InvoiceItem, NewInvoice, SellerDetails } from '../../services/api';

const GST_RATES = [0, 5, 12, 18, 28];
const inr = (rupees: number) =>
  `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  sessionId: string;
  seller: SellerDetails | null;
  busy: boolean;
  onSubmit: (body: NewInvoice) => void;
}

/** New GST invoice / receipt: seller (remembered), customer, items, GST rate. */
export function InvoiceForm({ sessionId, seller, busy, onSubmit }: Props) {
  const [sellerName, setSellerName] = useState(seller?.sellerName ?? '');
  const [sellerGstin, setSellerGstin] = useState(seller?.sellerGstin ?? '');
  const [sellerAddress, setSellerAddress] = useState(seller?.sellerAddress ?? '');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([{ name: '', qty: 1, price: 0 }]);
  const [gstPercent, setGstPercent] = useState(18);
  const [status, setStatus] = useState<'paid' | 'unpaid'>('paid');

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const total = subtotal + (subtotal * gstPercent) / 100;
  const setItem = (n: number, patch: Partial<InvoiceItem>) =>
    setItems(list => list.map((it, i) => (i === n ? { ...it, ...patch } : it)));

  return (
    <form
      className="wt-card"
      onSubmit={e => {
        e.preventDefault();
        const send = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'send';
        onSubmit({
          sessionId,
          sellerName,
          sellerGstin,
          sellerAddress,
          customerName,
          phone,
          items,
          gstPercent,
          status,
          send,
        });
      }}
    >
      <strong>New invoice</strong>
      <div className="wt-grid">
        <input
          className="wt-input"
          placeholder="Your business name"
          value={sellerName}
          onChange={e => setSellerName(e.target.value)}
          aria-label="Your business name"
          required
        />
        <input
          className="wt-input"
          placeholder="GSTIN (optional)"
          value={sellerGstin}
          onChange={e => setSellerGstin(e.target.value)}
          aria-label="GSTIN"
          maxLength={20}
        />
        <input
          className="wt-input"
          placeholder="Address (optional)"
          value={sellerAddress}
          onChange={e => setSellerAddress(e.target.value)}
          aria-label="Address"
        />
        <input
          className="wt-input"
          placeholder="Customer name"
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          aria-label="Customer name"
          required
        />
        <input
          className="wt-input"
          placeholder="Customer WhatsApp, e.g. 919876543210"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          aria-label="Customer WhatsApp number"
          required
        />
      </div>

      {items.map((it, n) => (
        <div className="wt-row" key={n}>
          <input
            className="wt-input wt-grow"
            placeholder="Item / service"
            value={it.name}
            onChange={e => setItem(n, { name: e.target.value })}
            aria-label={`Item ${n + 1}`}
            required
          />
          <input
            className="wt-input wt-num"
            type="number"
            min={0.01}
            step="any"
            value={it.qty}
            onChange={e => setItem(n, { qty: Number(e.target.value) })}
            aria-label={`Quantity ${n + 1}`}
          />
          <input
            className="wt-input wt-num"
            type="number"
            min={0}
            step="any"
            value={it.price}
            onChange={e => setItem(n, { price: Number(e.target.value) })}
            aria-label={`Price ${n + 1} (₹, before GST)`}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setItems(l => l.filter((_, i) => i !== n))}
            disabled={items.length === 1}
            aria-label={`Remove item ${n + 1}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="wt-row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setItems(l => [...l, { name: '', qty: 1, price: 0 }])}
          disabled={items.length >= 25}
        >
          <Plus size={14} /> Add item
        </button>
        <select
          className="wt-input"
          value={gstPercent}
          onChange={e => setGstPercent(Number(e.target.value))}
          aria-label="GST rate"
        >
          {GST_RATES.map(r => (
            <option key={r} value={r}>
              {r ? `GST ${r}%` : 'No GST (receipt)'}
            </option>
          ))}
        </select>
        <select
          className="wt-input"
          value={status}
          onChange={e => setStatus(e.target.value as 'paid' | 'unpaid')}
          aria-label="Payment status"
        >
          <option value="paid">Paid</option>
          <option value="unpaid">Payment due</option>
        </select>
        <strong className="wt-grow wt-right">Total {inr(total)}</strong>
      </div>
      <div className="wt-row">
        <button className="btn btn-primary" value="send" disabled={busy}>
          {busy ? 'Working…' : 'Create & send on WhatsApp'}
        </button>
        <button className="btn btn-secondary" value="save" disabled={busy}>
          Create only
        </button>
        <span className="wt-muted">
          Sending is free inside the 24-hour window (first 1,000 replies a month), otherwise the customer must message
          you first.
        </span>
      </div>
    </form>
  );
}
