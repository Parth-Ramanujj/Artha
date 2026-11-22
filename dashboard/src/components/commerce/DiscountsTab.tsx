import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { VolumeTier, WalletOverview } from '../../services/api';
import { discountedPaise, monthCostPaise, tierDiscount } from '../../utils/volumePricing';
import { inr } from '../../utils/commerceFormat';
import { Stat } from './shared';

export function DiscountsTab({
  wallet,
  busy,
  onSaveTiers,
}: {
  wallet: WalletOverview | null;
  busy: string | null;
  onSaveTiers: (tiers: VolumeTier[]) => Promise<void>;
}) {
  const [volume, setVolume] = useState(25_000);
  const [draft, setDraft] = useState<VolumeTier[]>(wallet?.volumeTiers ?? []);
  useEffect(() => setDraft(wallet?.volumeTiers ?? []), [wallet]);

  const tiers = useMemo(() => wallet?.volumeTiers ?? [], [wallet]);
  if (!wallet) {
    return (
      <div className="recovery-config-card">
        <p style={{ margin: 0 }}>Billing details could not be loaded.</p>
      </div>
    );
  }
  const rate = wallet.ratesPaise.marketing;
  const used = wallet.monthPaidMessages;
  const currentPct = tierDiscount(tiers, used + 1);
  const next = tiers.find(t => t.fromMessages > used + 1);
  const cost = monthCostPaise(volume, rate, tiers);
  const full = volume * rate;
  const savings = full - cost;

  return (
    <>
      <div className="recovery-config-card">
        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>This month</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Stat label="Paid messages so far" value={used.toLocaleString('en-IN')} />
          <Stat label="Your discount now" value={`${currentPct}%`} color="#10b981" />
          <Stat label="Marketing message price" value={`${inr(discountedPaise(rate, currentPct))}`} />
          <Stat
            label="Next discount"
            value={next ? `${next.discountPercent}% from message ${next.fromMessages.toLocaleString('en-IN')}` : '—'}
            color="#6366f1"
          />
        </div>
        <p className="sa-help" style={{ margin: 0 }}>
          {wallet.enabled
            ? 'Counts restart on the 1st of every month (UTC). Each paid message is charged at the tier it reaches; free service replies are not counted.'
            : 'Wallet billing is off for your account, so nothing is charged per message right now.'}
        </p>
      </div>

      <div className="pricing-tiers-grid">
        {[{ fromMessages: 1, discountPercent: 0 }, ...tiers].map((t, i, all) => {
          const end = all[i + 1]?.fromMessages;
          return (
            <div key={t.fromMessages} className={`tier-card ${t.discountPercent === currentPct ? 'featured' : ''}`}>
              {t.discountPercent > 0 && <div className="featured-ribbon">{t.discountPercent}% off</div>}
              <h4 className="tier-name">{i === 0 ? 'Standard' : `Tier ${i}`}</h4>
              <div className="tier-rate">
                {inr(discountedPaise(rate, t.discountPercent))} <span>/ marketing message</span>
              </div>
              <div className="tier-volume">
                {end
                  ? `Messages ${t.fromMessages.toLocaleString('en-IN')} – ${(end - 1).toLocaleString('en-IN')} each month`
                  : `From message ${t.fromMessages.toLocaleString('en-IN')} each month`}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                Utility {inr(discountedPaise(wallet.ratesPaise.utility, t.discountPercent))} ·
                Authentication {inr(discountedPaise(wallet.ratesPaise.authentication, t.discountPercent))}
              </p>
            </div>
          );
        })}
      </div>
      {tiers.length === 0 && (
        <p className="sa-help" style={{ margin: 0 }}>
          No volume discounts are set up yet, so every message is charged the standard price.
        </p>
      )}

      <div className="recovery-config-card">
        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
          Monthly cost calculator (marketing messages)
        </h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <label htmlFor="calc-volume" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            Messages per month
          </label>
          <input
            className="input"
            type="number"
            min={0}
            max={5_000_000}
            value={volume}
            onChange={e => setVolume(Math.max(0, Math.min(5_000_000, Number(e.target.value) || 0)))}
            style={{ width: 140 }}
          />
        </div>
        <input
          id="calc-volume"
          type="range"
          min={0}
          max={300_000}
          step={1000}
          value={Math.min(volume, 300_000)}
          onChange={e => setVolume(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Stat label="Without discounts" value={inr(full)} />
          <Stat label="You pay" value={inr(cost)} />
          <Stat
            label="You save"
            value={`${inr(savings)}${full ? ` (${Math.round((savings / full) * 100)}%)` : ''}`}
            color="#10b981"
          />
        </div>
      </div>

      {wallet.isPlatformAdmin && (
        <div className="recovery-config-card">
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Volume tiers (platform admin)</h4>
          <p className="sa-help" style={{ margin: 0 }}>
            Apply to every customer&apos;s wallet. A message gets the discount of the highest tier its monthly count has
            reached.
          </p>
          {draft.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13 }}>From message</span>
              <input
                className="input"
                type="number"
                min={1}
                style={{ width: 130 }}
                aria-label={`Tier ${i + 1} starts at message`}
                value={t.fromMessages}
                onChange={e =>
                  setDraft(d => d.map((x, j) => (j === i ? { ...x, fromMessages: Number(e.target.value) } : x)))
                }
              />
              <input
                className="input"
                type="number"
                min={1}
                max={90}
                style={{ width: 80 }}
                aria-label={`Tier ${i + 1} discount percent`}
                value={t.discountPercent}
                onChange={e =>
                  setDraft(d => d.map((x, j) => (j === i ? { ...x, discountPercent: Number(e.target.value) } : x)))
                }
              />
              <span style={{ fontSize: 13 }}>% off</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label={`Remove tier ${i + 1}`}
                onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={draft.length >= 10}
              onClick={() =>
                setDraft(d => [
                  ...d,
                  {
                    fromMessages: (d.at(-1)?.fromMessages ?? 0) + 10_000,
                    discountPercent: (d.at(-1)?.discountPercent ?? 0) + 10,
                  },
                ])
              }
            >
              Add tier
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy === 'tiers'}
              onClick={() => void onSaveTiers(draft)}
            >
              {busy === 'tiers' ? 'Saving…' : 'Save tiers'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
