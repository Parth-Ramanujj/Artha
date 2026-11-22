import { useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import type { Session, ShopifyCheckoutRow, ShopifyOverview } from '../../services/api';
import { field, fmtMoney, label } from '../../utils/commerceFormat';
import { Stat } from './shared';

type Connected = Extract<ShopifyOverview, { connected: true }>;

const DELAYS = [
  [15, '15 minutes'],
  [30, '30 minutes (recommended)'],
  [60, '1 hour'],
  [120, '2 hours'],
  [240, '4 hours'],
  [720, '12 hours'],
  [1440, '24 hours'],
] as const;

const STATUS_LABEL: Record<ShopifyCheckoutRow['status'], [string, string]> = {
  waiting: ['Waiting', '#f59e0b'],
  sent: ['Reminder sent', '#3b82f6'],
  recovered: ['Recovered', '#10b981'],
  purchased: ['Bought without reminder', '#64748b'],
  skipped: ['Skipped', '#94a3b8'],
  failed: ['Failed', '#ef4444'],
};

export function RecoveryTab({
  data,
  sessions,
  busy,
  onSave,
  onTest,
  onRefresh,
}: {
  data: Connected;
  sessions: Session[];
  busy: string | null;
  onSave: (input: {
    enabled: boolean;
    delayMinutes: number;
    discountCode: string;
    messageTemplate: string;
    sessionId: string;
    defaultCountryCode: string;
  }) => Promise<void>;
  onTest: (phone: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { store, stats, recent } = data;
  const [enabled, setEnabled] = useState(store.recoveryEnabled);
  const [delay, setDelay] = useState(store.recoveryDelayMinutes);
  const [code, setCode] = useState(store.discountCode);
  const [template, setTemplate] = useState(store.messageTemplate);
  const [sessionId, setSessionId] = useState(store.sessionId ?? '');
  const [country, setCountry] = useState(store.defaultCountryCode);
  const [testPhone, setTestPhone] = useState('');
  const recoveryRate = stats.sent ? Math.round((stats.recovered / stats.sent) * 100) : 0;
  const chosen = sessions.find(s => s.id === sessionId);

  return (
    <>
      <div className="recovery-grid">
        <form
          className="recovery-config-card"
          onSubmit={e => {
            e.preventDefault();
            void onSave({
              enabled,
              delayMinutes: delay,
              discountCode: code,
              messageTemplate: template,
              sessionId,
              defaultCountryCode: country,
            });
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>WhatsApp cart reminders</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600 }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              On
            </label>
          </div>

          <div>
            <label style={label} htmlFor="rec-session">
              Send from WhatsApp number
            </label>
            <select
              id="rec-session"
              className="input"
              style={field}
              value={sessionId}
              required={enabled}
              onChange={e => setSessionId(e.target.value)}
            >
              <option value="">Pick a number…</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.status === 'ready' ? '' : `(${s.status})`}
                </option>
              ))}
            </select>
            {chosen && chosen.status !== 'ready' && (
              <p className="sa-help">This number is not connected right now, so reminders will fail until it is.</p>
            )}
          </div>

          <div>
            <label style={label} htmlFor="rec-delay">
              Send the reminder after the customer stops
            </label>
            <select
              id="rec-delay"
              className="input"
              style={field}
              value={delay}
              onChange={e => setDelay(Number(e.target.value))}
            >
              {DELAYS.map(([m, text]) => (
                <option key={m} value={m}>
                  {text}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={label} htmlFor="rec-code">
                Discount code (optional)
              </label>
              <input
                id="rec-code"
                className="input"
                style={field}
                placeholder="COMEBACK10"
                value={code}
                maxLength={60}
                onChange={e => setCode(e.target.value)}
              />
            </div>
            <div>
              <label style={label} htmlFor="rec-country">
                Default country code
              </label>
              <input
                id="rec-country"
                className="input"
                style={field}
                inputMode="numeric"
                pattern="\d{1,4}"
                value={country}
                onChange={e => setCountry(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
          </div>
          <p className="sa-help" style={{ margin: 0 }}>
            Create the discount code in Shopify (Discounts) first; we only put it in the message. Lines with{' '}
            <code>{'{{discount_code}}'}</code> are left out when no code is set.
          </p>

          <div>
            <label style={label} htmlFor="rec-template">
              Message
            </label>
            <textarea
              id="rec-template"
              className="input"
              rows={5}
              maxLength={1000}
              style={{ ...field, resize: 'vertical' }}
              value={template}
              onChange={e => setTemplate(e.target.value)}
            />
            <p className="sa-help" style={{ margin: 0 }}>
              Fills in <code>{'{{first_name}}'}</code> <code>{'{{total}}'}</code> <code>{'{{checkout_url}}'}</code>{' '}
              <code>{'{{discount_code}}'}</code>.{' '}
              <button type="button" className="sg-link" onClick={() => setTemplate(data.defaultTemplate)}>
                Use the default text
              </button>
            </p>
          </div>

          <button className="btn btn-primary" type="submit" disabled={busy === 'save'}>
            {busy === 'save' ? 'Saving…' : 'Save settings'}
          </button>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 8 }}>
            <label style={label} htmlFor="rec-test">
              Send yourself a test (uses the saved settings)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="rec-test"
                className="input"
                style={{ flex: 1 }}
                placeholder="919876543210"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!testPhone.trim() || busy === 'test'}
                onClick={() => void onTest(testPhone)}
              >
                <Send size={14} /> {busy === 'test' ? 'Sending…' : 'Send test'}
              </button>
            </div>
          </div>
          <p className="sa-help" style={{ margin: 0 }}>
            One reminder per checkout, only if the customer has not ordered. If the number uses the WhatsApp Cloud API,
            Meta may require an approved template for messages to people who have not written to you in 24 hours.
          </p>
        </form>

        <div className="recovery-config-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Results</h4>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onRefresh()}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Stat label="Abandoned checkouts" value={String(stats.abandoned)} />
            <Stat label="Reminders sent" value={String(stats.sent)} color="#3b82f6" />
            <Stat label="Carts recovered" value={`${stats.recovered} (${recoveryRate}%)`} color="#10b981" />
            <Stat label="Recovered revenue" value={fmtMoney(stats.recoveredRevenue, store.currency)} color="#10b981" />
          </div>
          {stats.waiting > 0 && <p className="sa-help">{stats.waiting} reminder(s) waiting for their send time.</p>}
          {stats.failed > 0 && <p className="sa-error">{stats.failed} reminder(s) failed. See the list below.</p>}
        </div>
      </div>

      <div className="recovery-config-card">
        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Recent checkouts</h4>
        {recent.length === 0 ? (
          <p className="sa-help" style={{ margin: 0 }}>
            No checkouts yet. They appear here when a customer starts checkout on your store.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: 6 }}>Customer</th>
                  <th style={{ padding: 6 }}>Cart</th>
                  <th style={{ padding: 6 }}>Status</th>
                  <th style={{ padding: 6 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(c => {
                  const [text, color] = STATUS_LABEL[c.status];
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6 }}>
                        {c.firstName || '—'}
                        <div className="sa-help">{c.phone ? `+${c.phone}` : 'no phone'}</div>
                      </td>
                      <td style={{ padding: 6 }}>
                        {fmtMoney(c.totalPrice, c.currency)}
                        {c.status === 'recovered' && (
                          <div className="sa-help">Order {fmtMoney(c.orderTotal, c.currency)}</div>
                        )}
                      </td>
                      <td style={{ padding: 6 }}>
                        <span style={{ color, fontWeight: 600 }}>{text}</span>
                        {c.error && <div className="sa-help">{c.error}</div>}
                      </td>
                      <td style={{ padding: 6 }}>
                        {c.status === 'waiting' && c.sendAt
                          ? `Sends ${new Date(c.sendAt).toLocaleString()}`
                          : new Date(c.sentAt ?? c.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
