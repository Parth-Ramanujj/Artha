import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { googleBusinessApi } from '../services/api';
import type { GbpOverview } from '../types/googleBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import { ReviewsTab } from '../components/google-business/ReviewsTab';
import { RequestReviewsTab } from '../components/google-business/RequestReviewsTab';
import { PostsTab } from '../components/google-business/PostsTab';
import { SettingsTab } from '../components/google-business/SettingsTab';
import './SalesAgent.css';

const TABS = [
  { id: 'reviews', label: 'Reviews' },
  { id: 'requests', label: 'Ask for reviews' },
  { id: 'posts', label: 'Posts' },
  { id: 'settings', label: 'Settings' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function GoogleBusiness() {
  useDocumentTitle('Google Business');
  const [tab, setTab] = useState<TabId>('reviews');
  const [overview, setOverview] = useState<GbpOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    googleBusinessApi
      .overview()
      .then(o => {
        setOverview(o);
        if (!o.connected || !o.locations.length) setTab(t => (t === 'reviews' ? 'settings' : t));
      })
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(refresh, [refresh]);

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await googleBusinessApi.sync();
      setNotice(
        `Synced: ${s.fetched} checked, ${s.newReviews} new, ${s.drafted} drafted, ${s.published} auto-replied, ${s.alerted} alerts` +
          (s.errors.length ? `. Problems: ${s.errors.join('; ')}` : ''),
      );
      setVersion(v => v + 1);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  const o = overview;
  const ready = !!o?.connected && !!o.locations.length;
  return (
    <div className="sa-page">
      <PageHeader
        title="Google Business"
        subtitle="Reply to Google reviews with AI, get alerts for low ratings, ask customers for reviews and publish posts"
        actions={
          <button className="btn btn-primary" disabled={busy || !ready} onClick={() => void sync()}>
            <RefreshCw size={14} /> {busy ? 'Syncing…' : 'Sync reviews now'}
          </button>
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

      {o && ready && (
        <section className="sa-stats" aria-label="Review stats">
          <Stat label="Average rating" value={o.average ? `${o.average} ★` : '–'} />
          <Stat label="Reviews" value={o.total} />
          <Stat label="Last 30 days" value={o.last30Days} />
          <Stat label="Waiting for you" value={o.waiting} tone={o.waiting ? 'warn' : 'muted'} />
          <Stat label="Unanswered" value={o.unanswered} tone={o.unanswered ? 'warn' : 'muted'} />
          <Stat label="Response rate" value={`${o.responseRate}%`} />
          <Stat label="Auto-replied" value={o.autoReplied} />
          <Stat label="Avg reply time" value={o.avgResponseHours === null ? '–' : `${o.avgResponseHours} h`} />
          <Stat label="Sync" value={o.enabled ? 'On' : 'Off'} tone={o.enabled ? 'ok' : 'muted'} />
        </section>
      )}
      {o && ready && o.total > 0 && (
        <p className="sa-help">
          Stars: {o.byStars.map((n, i) => `${i + 1}★ ${n}`).join(' · ')}
          {o.lastSyncAt ? ` · last sync ${new Date(o.lastSyncAt).toLocaleString()}` : ''}
        </p>
      )}
      {o?.lastError && <p className="sa-banner">Last sync had problems: {o.lastError}</p>}
      {o && !ready && (
        <p className="sa-banner">
          Start in Settings: connect your Google Business Profile account and pick the locations to manage.
        </p>
      )}

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
        {tab === 'reviews' && <ReviewsTab key={version} locations={o?.locations ?? []} onChange={refresh} />}
        {tab === 'requests' && <RequestReviewsTab locations={o?.locations ?? []} />}
        {tab === 'posts' && <PostsTab locations={o?.locations ?? []} />}
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
