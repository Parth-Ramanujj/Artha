import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useToast } from './Toast';
import { walletApi, type AdminWalletRow, type WalletRates } from '../services/api';
import { rupees } from '../utils/walletFormat';

const RATE_KEYS: Array<keyof WalletRates> = ['marketing', 'utility', 'authentication', 'service'];

/** Platform admin: default prices, which customers are billed, and manual credits. */
export function WalletAdmin({ razorpayConfigured }: { razorpayConfigured: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const wallets = useQuery({ queryKey: ['wallet', 'admin'], queryFn: walletApi.adminWallets });
  const overview = useQuery({ queryKey: ['wallet'], queryFn: walletApi.overview });
  const [rates, setRates] = useState<Record<string, string> | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['wallet'] });
  const fail = (e: Error) => toast.error('Not saved', e.message);

  const saveRates = useMutation({
    mutationFn: () =>
      walletApi.adminSetRates(
        Object.fromEntries(RATE_KEYS.map(k => [k, Math.round(Number(rates?.[k] ?? 0) * 100)])) as WalletRates,
      ),
    onSuccess: () => {
      setRates(null);
      refresh();
      toast.success('Prices saved', 'They apply to every customer without custom prices.');
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: (v: { row: AdminWalletRow; patch: { enabled?: boolean; blockWhenEmpty?: boolean } }) =>
      walletApi.adminUpdate(v.row.businessId, v.patch),
    onSuccess: refresh,
    onError: fail,
  });

  const current = overview.data?.ratesPaise;
  const shown = rates ?? (current ? Object.fromEntries(RATE_KEYS.map(k => [k, String(current[k] / 100)])) : {});

  return (
    <section className="wl-card wl-admin" aria-labelledby="wl-admin">
      <h2 id="wl-admin" className="wl-title">
        <ShieldCheck size={16} /> Platform admin
      </h2>

      {!razorpayConfigured && (
        <div className="wl-setup">
          <strong>Razorpay setup</strong>
          <ol>
            <li>In the Razorpay Dashboard → Account & Settings → API Keys, generate a key.</li>
            <li>
              Set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> on the server (Render → Environment)
              and redeploy.
            </li>
            <li>
              Optional but recommended: Razorpay → Webhooks → add <code>{window.location.origin}/api/wallet/razorpay/webhook</code>{' '}
              with events <code>payment.captured</code> and <code>order.paid</code>, and set the same secret as{' '}
              <code>RAZORPAY_WEBHOOK_SECRET</code>. It credits payments even if the customer closes the page too early.
            </li>
          </ol>
        </div>
      )}

      <div>
        <span className="wl-label">Default price per message (₹) — what customers pay</span>
        <div className="wl-rate-grid">
          {RATE_KEYS.map(k => (
            <label key={k}>
              <span className="wl-muted">{k}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={shown[k] ?? ''}
                onChange={e => setRates({ ...shown, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <span className="wl-muted">
          Meta charges you about ₹0.78 (marketing) and ₹0.12 (utility/authentication) for Indian numbers; set your price
          above that to cover costs.
        </span>
        <div>
          <button className="btn btn-primary" disabled={!rates || saveRates.isPending} onClick={() => saveRates.mutate()}>
            Save prices
          </button>
        </div>
      </div>

      <div className="wl-scroll">
        <table className="wl-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Billing</th>
              <th>Stop when empty</th>
              <th className="wl-num">Balance</th>
              <th>Credit / debit</th>
            </tr>
          </thead>
          <tbody>
            {(wallets.data ?? []).map(row => (
              <tr key={row.businessId}>
                <td>
                  {row.name}
                  {!row.active && <span className="wl-muted"> · inactive</span>}
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Bill ${row.name}`}
                    checked={row.enabled}
                    onChange={e => update.mutate({ row, patch: { enabled: e.target.checked } })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Stop ${row.name} when empty`}
                    checked={row.blockWhenEmpty}
                    onChange={e => update.mutate({ row, patch: { blockWhenEmpty: e.target.checked } })}
                  />
                </td>
                <td className="wl-num">{rupees(row.balancePaise)}</td>
                <td>
                  <AdjustForm row={row} onDone={refresh} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdjustForm({ row, onDone }: { row: AdminWalletRow; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const adjust = useMutation({
    mutationFn: () => walletApi.adminAdjust(row.businessId, Number(amount), note),
    onSuccess: r => {
      setAmount('');
      setNote('');
      onDone();
      toast.success('Balance updated', `${row.name}: ${rupees(r.balancePaise)}`);
    },
    onError: (e: Error) => toast.error('Not updated', e.message),
  });
  return (
    <div className="wl-row">
      <input
        type="number"
        placeholder="+500 or -100"
        aria-label={`Amount for ${row.name}`}
        value={amount}
        onChange={e => setAmount(e.target.value)}
        style={{ width: 110 }}
      />
      <input placeholder="Note" aria-label="Note" value={note} maxLength={200} onChange={e => setNote(e.target.value)} />
      <button
        className="btn btn-secondary"
        disabled={!Number(amount) || adjust.isPending}
        onClick={() => {
          if (window.confirm(`${Number(amount) > 0 ? 'Add' : 'Remove'} ₹${Math.abs(Number(amount))} for ${row.name}?`)) {
            adjust.mutate();
          }
        }}
      >
        Apply
      </button>
    </div>
  );
}
