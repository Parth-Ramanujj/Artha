import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IndianRupee, Lightbulb, Copy, Wallet, Receipt } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { useRole } from '../hooks/useRole';
import { messageCostsApi, sessionApi, type CostSuggestion } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import './MessageCosts.css';

const PERIODS = [7, 30, 90] as const;
const CATEGORY_LABEL: Record<string, string> = {
  marketing: 'Marketing',
  marketing_lite: 'Marketing (lite)',
  utility: 'Utility',
  authentication: 'Authentication',
  service: 'Service (replies)',
  unknown: 'Not reported yet',
};
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What WhatsApp messages cost, where the money goes, and how to spend less. */
export function MessageCosts() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useRole();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ['message-costs', 'summary', days], queryFn: () => messageCostsApi.summary(days) });
  const suggestions = useQuery({
    queryKey: ['message-costs', 'suggestions', days],
    queryFn: () => messageCostsApi.suggestions(days),
  });
  const sessions = useQuery({ queryKey: ['sessions', 'list'], queryFn: () => sessionApi.list() });
  const cloud = (sessions.data ?? []).filter(s => s.engineType === 'cloud-api');
  const bill = useQuery({
    queryKey: ['message-costs', 'meta-bill', cloud[0]?.id, days],
    queryFn: () => messageCostsApi.metaBill(cloud[0]!.id, days),
    enabled: Boolean(cloud[0]),
  });
  const saveBudget = useMutation({
    mutationFn: (value: number | null) => messageCostsApi.saveSettings(value),
    onSuccess: () => {
      setBudgetDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['message-costs'] });
      toast.success('Budget saved', 'You get a notification when spending passes 80%.');
    },
    onError: (e: Error) => toast.error('Could not save the budget', e.message),
  });

  const s = summary.data;
  const budget = s?.budget.monthlyBudgetInr ?? null;
  const usedPct = budget ? Math.min(100, Math.round(((s?.budget.monthSpendInr ?? 0) / budget) * 100)) : 0;

  return (
    <div className="message-costs-page">
      <PageHeader
        title="Message Costs"
        subtitle="What your WhatsApp messages cost, where the money goes, and how to spend less."
        icon={<IndianRupee size={24} />}
        actions={
          <div className="mc-periods" role="tablist" aria-label="Period">
            {PERIODS.map(p => (
              <button key={p} role="tab" aria-selected={days === p} className={days === p ? 'is-active' : ''} onClick={() => setDays(p)}>
                {p} days
              </button>
            ))}
          </div>
        }
      />

      {summary.isLoading ? (
        <div className="mc-state">Loading…</div>
      ) : summary.isError || !s ? (
        <div className="mc-state mc-error">Could not load costs. {summary.error?.message}</div>
      ) : (
        <>
          <section className="mc-kpis" aria-label="Totals">
            <Kpi label={`Spent in ${days} days`} value={inr(s.totals.inr)} hint="Estimated from Meta's price per message" />
            <Kpi label="Messages" value={s.totals.messages.toLocaleString('en-IN')} hint="Sent from official (Cloud API) numbers" />
            <Kpi label="Paid" value={s.totals.paid.toLocaleString('en-IN')} />
            <Kpi label="Free" value={s.totals.free.toLocaleString('en-IN')} hint="Replies inside 24h and other free messages" />
          </section>

          <section className="mc-card" aria-labelledby="mc-budget">
            <h2 id="mc-budget" className="mc-title">
              <Wallet size={17} /> This month
            </h2>
            <div className="mc-budget-row">
              <strong>{inr(s.budget.monthSpendInr)}</strong>
              <span className="mc-muted">{budget ? `of ${inr(budget)} budget` : 'no budget set'}</span>
            </div>
            {budget !== null && (
              <div className="mc-bar" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100}>
                <span className={usedPct >= 80 ? 'is-warn' : ''} style={{ width: `${usedPct}%` }} />
              </div>
            )}
            {isAdmin && (
              <div className="mc-budget-edit">
                <label htmlFor="mc-budget-input">Monthly budget (₹)</label>
                <input
                  id="mc-budget-input"
                  type="number"
                  min={0}
                  placeholder="e.g. 2000"
                  value={budgetDraft ?? (budget ?? '')}
                  onChange={e => setBudgetDraft(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={budgetDraft === null || saveBudget.isPending}
                  onClick={() => saveBudget.mutate(budgetDraft === '' || budgetDraft === null ? null : Number(budgetDraft))}
                >
                  Save
                </button>
              </div>
            )}
          </section>

          <Suggestions items={suggestions.data ?? []} loading={suggestions.isLoading} />

          <div className="mc-grid">
            <section className="mc-card" aria-labelledby="mc-cat">
              <h2 id="mc-cat" className="mc-title">By type</h2>
              {s.byCategory.length === 0 ? (
                <p className="mc-muted">No messages from an official number in this period yet.</p>
              ) : (
                <table className="mc-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Messages</th>
                      <th>Free</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byCategory.map(c => (
                      <tr key={c.category}>
                        <td>{CATEGORY_LABEL[c.category] ?? c.category}</td>
                        <td>{c.messages}</td>
                        <td>{c.free}</td>
                        <td>{inr(c.inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="mc-card" aria-labelledby="mc-day">
              <h2 id="mc-day" className="mc-title">Per day</h2>
              {s.byDay.length === 0 ? (
                <p className="mc-muted">Nothing to show yet.</p>
              ) : (
                <div className="mc-chart">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={s.byDay}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={d => String(d).slice(5)} fontSize={11} />
                      <YAxis fontSize={11} width={40} />
                      <Tooltip formatter={v => inr(Number(v))} />
                      <Bar dataKey="inr" name="inr" fill="var(--primary, #22c55e)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>

          <section className="mc-card" aria-labelledby="mc-camp">
            <h2 id="mc-camp" className="mc-title">Campaigns</h2>
            {s.campaigns.length === 0 ? (
              <p className="mc-muted">Campaigns sent from an official number show up here with their cost and replies.</p>
            ) : (
              <div className="mc-scroll">
                <table className="mc-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Sent</th>
                      <th>Delivered</th>
                      <th>Failed</th>
                      <th>Replies</th>
                      <th>Cost</th>
                      <th>Cost per reply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.campaigns.map(c => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{c.messages}</td>
                        <td>{c.delivered}</td>
                        <td>{c.failed}</td>
                        <td>{c.replies}</td>
                        <td>{inr(c.inr)}</td>
                        <td>{c.costPerReply === null ? '—' : inr(c.costPerReply)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mc-card" aria-labelledby="mc-bill">
            <h2 id="mc-bill" className="mc-title">
              <Receipt size={17} /> Meta&apos;s own bill
            </h2>
            {!cloud.length ? (
              <p className="mc-muted">Connect an official (Cloud API) number to see Meta&apos;s bill.</p>
            ) : bill.isLoading ? (
              <p className="mc-muted">Asking Meta…</p>
            ) : !bill.data?.available ? (
              <p className="mc-muted">{bill.data?.reason ?? 'Not available.'}</p>
            ) : (
              <>
                <p>
                  <strong>{(bill.data.totalCost ?? 0).toFixed(2)}</strong> for {bill.data.totalVolume} messages{' '}
                  <span className="mc-muted">(in your Meta account&apos;s currency; Meta updates this a few hours late)</span>
                </p>
                <table className="mc-table">
                  <tbody>
                    {(bill.data.rows ?? []).map(r => (
                      <tr key={`${r.category}|${r.type}`}>
                        <td>{CATEGORY_LABEL[r.category.toLowerCase()] ?? r.category}</td>
                        <td className="mc-muted">{r.type.toLowerCase().replace(/_/g, ' ')}</td>
                        <td>{r.volume}</td>
                        <td>{r.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <p className="mc-muted mc-note">
            Costs above are estimates from Meta&apos;s India rates (Marketing ≈ ₹0.78, Utility ≈ ₹0.12 per message) and the
            category Meta reports for each message. Only messages sent after this page was set up are counted. Meta&apos;s
            own bill is the final word.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="mc-kpi" title={hint}>
      <span className="mc-muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Suggestions({ items, loading }: { items: CostSuggestion[]; loading: boolean }) {
  const toast = useToast();
  return (
    <section className="mc-card mc-tips" aria-labelledby="mc-tips">
      <h2 id="mc-tips" className="mc-title">
        <Lightbulb size={17} /> How to spend less
      </h2>
      {loading ? (
        <p className="mc-muted">Looking for savings…</p>
      ) : items.length === 0 ? (
        <p className="mc-muted">Nothing to fix right now. Suggestions appear here once you send paid messages.</p>
      ) : (
        <ul className="mc-tip-list">
          {items.map(t => (
            <li key={t.id} className="mc-tip">
              <div className="mc-tip-head">
                <strong>{t.title}</strong>
                {t.savingInr > 0 && <span className="mc-save">save ≈ {inr(t.savingInr)}</span>}
              </div>
              <p className="mc-muted">{t.detail}</p>
              {t.numbers?.length ? (
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    void copyToClipboard(t.numbers!.join('\n')).then(() =>
                      toast.success('Copied', `${t.numbers!.length} numbers copied`),
                    )
                  }
                >
                  <Copy size={14} /> Copy {t.numbers.length} numbers
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
