import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Download, Plus, Bell } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useRole } from '../hooks/useRole';
import { walletApi, type WalletTx } from '../services/api';
import { payWithRazorpay } from '../utils/razorpayCheckout';
import { walletCsv, rupees } from '../utils/walletFormat';
import { WalletAdmin } from '../components/WalletAdmin';
import './Wallet.css';

const PRESETS = [500, 1000, 2000, 5000];
const TYPE_LABEL: Record<WalletTx['type'], string> = { recharge: 'Recharge', charge: 'Message', adjustment: 'Adjustment' };
const RATE_LABEL = { marketing: 'Marketing', utility: 'Utility', authentication: 'Authentication (OTP)', service: 'Replies (service)' };

/** Prepaid balance for WhatsApp messages: recharge with Razorpay, see every charge. */
export function Wallet() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canWrite } = useRole();
  const [amount, setAmount] = useState('1000');
  const [type, setType] = useState('');
  const [alertDraft, setAlertDraft] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['wallet'], queryFn: walletApi.overview });
  const txs = useQuery({
    queryKey: ['wallet', 'txs', type],
    queryFn: () => walletApi.transactions({ limit: 200, type: type || undefined }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['wallet'] });

  const recharge = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      const order = await walletApi.createOrder(value);
      const paid = await payWithRazorpay({ ...order, description: `Wallet recharge ${rupees(order.amountPaise)}` });
      if (!paid) return null;
      return walletApi.verify(paid);
    },
    onSuccess: res => {
      refresh();
      if (res) toast.success('Recharge successful', `Your balance is now ${rupees(res.balancePaise ?? 0)}.`);
    },
    onError: (e: Error) => {
      refresh();
      toast.error('Recharge did not go through', e.message);
    },
  });
  const saveAlert = useMutation({
    mutationFn: (v: number) => walletApi.setAlert(v),
    onSuccess: () => {
      setAlertDraft(null);
      refresh();
      toast.success('Saved', 'You will get a notification when the balance goes below this.');
    },
  });

  const w = overview.data;
  const value = Number(amount);
  const amountOk = w && Number.isFinite(value) && value >= w.limits.minRechargeInr && value <= w.limits.maxRechargeInr;
  const low = w && w.enabled && w.balancePaise < w.lowBalanceAlertPaise;

  const download = () => {
    const blob = new Blob([walletCsv(txs.data?.items ?? [])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wallet-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="wallet-page">
      <PageHeader
        title="Wallet"
        subtitle="Prepaid balance for your WhatsApp messages. Paid messages are deducted after they are delivered."
        icon={<CreditCard size={24} />}
      />

      {overview.isLoading || !w ? (
        <div className="wl-state">{overview.isError ? `Could not load the wallet. ${overview.error.message}` : 'Loading…'}</div>
      ) : (
        <>
          <div className="wl-top">
            <section className={`wl-card wl-balance ${low ? 'is-low' : ''}`} aria-label="Balance">
              <span className="wl-muted">Balance</span>
              <strong>{rupees(w.balancePaise)}</strong>
              {!w.enabled ? (
                <span className="wl-muted">Billing is not switched on for your account, so messages are not deducted here.</span>
              ) : low ? (
                <span className="wl-warn">Low balance — recharge to keep sending.</span>
              ) : (
                <span className="wl-muted">
                  {w.blockWhenEmpty ? 'Campaigns pause when the balance runs out.' : 'Sending continues even below zero.'}
                </span>
              )}
            </section>

            <section className="wl-card" aria-labelledby="wl-recharge">
              <h2 id="wl-recharge" className="wl-title">
                <Plus size={16} /> Add money
              </h2>
              {!w.razorpay.configured ? (
                <p className="wl-muted">
                  Online payment is not set up on this server yet. {w.isPlatformAdmin ? 'See “Razorpay setup” below.' : 'Ask your administrator.'}
                </p>
              ) : (
                <>
                  <div className="wl-presets">
                    {PRESETS.map(p => (
                      <button key={p} className={Number(amount) === p ? 'is-active' : ''} onClick={() => setAmount(String(p))}>
                        ₹{p.toLocaleString('en-IN')}
                      </button>
                    ))}
                  </div>
                  <label className="wl-amount">
                    <span>₹</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={w.limits.minRechargeInr}
                      max={w.limits.maxRechargeInr}
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      aria-label="Amount in rupees"
                    />
                  </label>
                  <button
                    className="btn btn-primary"
                    disabled={!canWrite || !amountOk || recharge.isPending}
                    onClick={() => recharge.mutate()}
                  >
                    {recharge.isPending ? 'Opening payment…' : `Pay ₹${amountOk ? value.toLocaleString('en-IN') : '—'} with Razorpay`}
                  </button>
                  <span className="wl-muted">
                    UPI, cards, net banking. Between ₹{w.limits.minRechargeInr} and ₹{w.limits.maxRechargeInr.toLocaleString('en-IN')}.
                  </span>
                </>
              )}
            </section>
          </div>

          <div className="wl-grid">
            <section className="wl-card" aria-labelledby="wl-rates">
              <h2 id="wl-rates" className="wl-title">Price per message</h2>
              <table className="wl-table">
                <tbody>
                  {(Object.keys(RATE_LABEL) as Array<keyof typeof RATE_LABEL>).map(k => (
                    <tr key={k}>
                      <td>{RATE_LABEL[k]}</td>
                      <td className="wl-num">{w.ratesPaise[k] ? rupees(w.ratesPaise[k]) : 'Free'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <span className="wl-muted">Charged only when WhatsApp delivers the message. Failed messages are free.</span>
            </section>

            <section className="wl-card" aria-labelledby="wl-alert">
              <h2 id="wl-alert" className="wl-title">
                <Bell size={16} /> Low balance alert
              </h2>
              <div className="wl-row">
                <span>Notify me below ₹</span>
                <input
                  type="number"
                  min={0}
                  aria-label="Alert below rupees"
                  value={alertDraft ?? String(w.lowBalanceAlertPaise / 100)}
                  onChange={e => setAlertDraft(e.target.value)}
                />
                <button
                  className="btn btn-secondary"
                  disabled={alertDraft === null || !canWrite || saveAlert.isPending}
                  onClick={() => saveAlert.mutate(Number(alertDraft))}
                >
                  Save
                </button>
              </div>
            </section>
          </div>

          <section className="wl-card" aria-labelledby="wl-history">
            <div className="wl-row wl-between">
              <h2 id="wl-history" className="wl-title">History</h2>
              <div className="wl-row">
                <select value={type} onChange={e => setType(e.target.value)} aria-label="Filter">
                  <option value="">All</option>
                  <option value="recharge">Recharges</option>
                  <option value="charge">Messages</option>
                  <option value="adjustment">Adjustments</option>
                </select>
                <button className="btn btn-secondary" onClick={download} disabled={!txs.data?.items.length}>
                  <Download size={14} /> CSV
                </button>
              </div>
            </div>
            {txs.isLoading ? (
              <p className="wl-muted">Loading…</p>
            ) : !txs.data?.items.length ? (
              <p className="wl-muted">No transactions yet.</p>
            ) : (
              <div className="wl-scroll">
                <table className="wl-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Details</th>
                      <th className="wl-num">Amount</th>
                      <th className="wl-num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.data.items.map(t => (
                      <tr key={t.id} className={t.status !== 'success' ? 'is-muted' : ''}>
                        <td>{new Date(t.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>
                          {TYPE_LABEL[t.type]}
                          {t.status !== 'success' && <span className="wl-muted"> · {t.status}</span>}
                        </td>
                        <td>{t.description}</td>
                        <td className={`wl-num ${t.amountPaise >= 0 ? 'is-in' : 'is-out'}`}>
                          {t.amountPaise >= 0 ? '+' : '−'}
                          {rupees(Math.abs(t.amountPaise))}
                        </td>
                        <td className="wl-num">{t.balanceAfterPaise === null ? '—' : rupees(t.balanceAfterPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {w.isPlatformAdmin && <WalletAdmin razorpayConfigured={w.razorpay.configured} />}
        </>
      )}
    </div>
  );
}
