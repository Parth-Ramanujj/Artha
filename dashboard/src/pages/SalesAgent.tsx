import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { salesAgentApi } from '../services/api';
import type { SalesOverview } from '../types/salesAgent';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import { OutboxTab } from '../components/sales-agent/OutboxTab';
import { ProspectsTab } from '../components/sales-agent/ProspectsTab';
import { ConversationsTab } from '../components/sales-agent/ConversationsTab';
import { DiscoverTab } from '../components/sales-agent/DiscoverTab';
import { SettingsTab } from '../components/sales-agent/SettingsTab';
import './SalesAgent.css';

const TABS = [
  { id: 'outbox', label: 'Outbox' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'discover', label: 'Find businesses' },
  { id: 'settings', label: 'Settings' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function SalesAgent() {
  useDocumentTitle('Sales Agent');
  const [tab, setTab] = useState<TabId>('outbox');
  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    salesAgentApi
      .overview()
      .then(setOverview)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(refresh, [refresh]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (done) setNotice(done === 'run' ? `Cycle finished: ${JSON.stringify(res)}` : done);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const o = overview;
  return (
    <div className="sa-page">
      <PageHeader
        title="Sales Agent"
        subtitle="Finds businesses, writes personal outreach, sends it over WhatsApp or email, and answers replies"
        actions={
          <div className="sa-actions">
            {o && (
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => act(() => salesAgentApi.updateConfig({ sendingPaused: !o.sendingPaused }))}
              >
                {o.sendingPaused ? <Play size={14} /> : <Pause size={14} />}
                {o.sendingPaused ? 'Resume sending' : 'Pause sending'}
              </button>
            )}
            <button className="btn btn-primary" disabled={busy} onClick={() => act(() => salesAgentApi.run(), 'run')}>
              <RefreshCw size={14} /> Run now
            </button>
          </div>
        }
      />

      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sa-notice" role="status">
          {notice}
        </p>
      )}

      {o && (
        <section className="sa-stats" aria-label="Pipeline">
          <Stat label="Agent" value={o.enabled ? 'On' : 'Off'} tone={o.enabled ? 'ok' : 'muted'} />
          <Stat label="Mode" value={o.requireApproval ? 'Approval' : 'Autopilot'} tone={o.requireApproval ? 'ok' : 'warn'} />
          <Stat label="Waiting for you" value={o.outbox.pending_review} tone={o.outbox.pending_review ? 'warn' : 'muted'} />
          <Stat label="Needs a person" value={o.needsHuman} tone={o.needsHuman ? 'warn' : 'muted'} />
          <Stat label="New prospects" value={o.prospects.new} />
          <Stat label="Contacted" value={o.prospects.contacted} />
          <Stat label="Replied" value={o.prospects.replied} />
          <Stat label="Opted out" value={o.prospects.opted_out} />
          {o.channels.map(c => (
            <Stat
              key={c.name}
              label={c.name === 'whatsapp' ? 'WhatsApp today' : 'Email today'}
              value={c.ready ? `${o.sentToday[c.name] ?? 0} / ${c.dailyCap}` : 'Off'}
              tone={c.ready ? undefined : 'muted'}
            />
          ))}
        </section>
      )}
      {o?.sendingPaused && <p className="sa-banner">Sending is paused. Nothing leaves the outbox until you resume.</p>}
      {o?.quietNow && <p className="sa-banner">Quiet hours right now: the agent reads replies but does not send.</p>}

      <div className="sa-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'sa-tab active' : 'sa-tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'outbox' && <OutboxTab onChange={refresh} />}
        {tab === 'conversations' && <ConversationsTab onChange={refresh} />}
        {tab === 'prospects' && <ProspectsTab onChange={refresh} />}
        {tab === 'discover' && <DiscoverTab onChange={refresh} />}
        {tab === 'settings' && <SettingsTab onChange={refresh} />}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'muted' }) {
  return (
    <div className={`sa-stat ${tone ?? ''}`}>
      <span className="sa-stat-value">{value}</span>
      <span className="sa-stat-label">{label}</span>
    </div>
  );
}
