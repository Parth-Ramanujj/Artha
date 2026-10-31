import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { growthApi } from '../../services/api';
import type { ComplianceReport, GrowthSettings } from '../../types/growth';
import type { SaveSettings } from '../../pages/Growth';
import { useSaver } from './useSaver';

const LEVEL = { good: 'Healthy', watch: 'Needs care', risk: 'At risk' } as const;
const when = (d: string | null) => (d ? new Date(d).toLocaleString() : '');
const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Estimated sender health plus the opt-in proof you would need if a number gets reported. */
export function ComplianceTab({ settings, onSave }: { settings: GrowthSettings | null; onSave: SaveSettings }) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const { busy, run, messages } = useSaver();

  useEffect(() => {
    void run(async () => setReport(await growthApi.compliance(days)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ['Contact', 'Status', 'Source', 'Opted in', 'Opted out'],
      ...report.proof.map(p => [p.waContactId, p.status, p.source ?? '', when(p.consentedAt), when(p.revokedAt)]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'opt-in-proof.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const r = report;
  return (
    <section className="sa-panel">
      {messages}
      <div className="sa-toolbar">
        <label className="sa-grow">
          Period{' '}
          <select className="input" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 140 }}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        {settings && (
          <label className="sa-check">
            <input
              type="checkbox"
              disabled={busy}
              checked={settings.autoStopEnabled}
              onChange={e =>
                void run(async () => {
                  await onSave({ autoStopEnabled: e.target.checked });
                  return 'Saved.';
                })
              }
            />
            Auto opt-out when a customer replies STOP (bandh, રદ…)
          </label>
        )}
      </div>

      {r && (
        <>
          <section className="sa-stats" aria-label="Sender health">
            <div className={`sa-stat ${r.health.level === 'good' ? 'ok' : ''}`}>
              <span className="sa-stat-value">{r.health.score}/100</span>
              <span className="sa-stat-label">Estimated health: {LEVEL[r.health.level]}</span>
            </div>
            <Stat label="Messages sent" value={r.sent} />
            <Stat
              label="Failed"
              value={r.sent ? `${r.failed} (${((r.failed / r.sent) * 100).toFixed(1)}%)` : r.failed}
            />
            <Stat label="New opt-ins" value={r.optIns} />
            <Stat label="Opt-outs" value={r.optOuts} />
            <Stat label="Most sent in 1 hour" value={r.peakPerHour} />
          </section>
          {r.health.warnings.map(w => (
            <p key={w} className="sa-warn">
              {w}
            </p>
          ))}
          <p className="sa-help">
            An estimate from your own sending data, not Meta's official quality rating. {r.dndChats} chats are on
            do-not-disturb.{r.truncated ? ' Very high volume: only the most recent messages were counted.' : ''}
          </p>

          <div className="sa-toolbar">
            <h3 className="sa-grow">Opt-in proof ({r.proof.length})</h3>
            <button className="btn btn-secondary" disabled={!r.proof.length} onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
          </div>
          {!r.proof.length ? (
            <p className="sa-help">
              No recorded opt-ins with a source yet. Forms and campaigns that collect consent fill this.
            </p>
          ) : (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Opted in</th>
                    <th>Opted out</th>
                  </tr>
                </thead>
                <tbody>
                  {r.proof.slice(0, 100).map(p => (
                    <tr key={p.waContactId}>
                      <td>{p.waContactId.replace(/@.*$/, '')}</td>
                      <td>{p.status === 'opted_in' ? 'Opted in' : 'Opted out'}</td>
                      <td>{p.source}</td>
                      <td>{when(p.consentedAt)}</td>
                      <td>{when(p.revokedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sa-stat">
      <span className="sa-stat-value">{value}</span>
      <span className="sa-stat-label">{label}</span>
    </div>
  );
}
