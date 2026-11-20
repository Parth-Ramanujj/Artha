import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock,
  Copy,
  MessageCircle,
  RefreshCw,
  ScrollText,
  Send,
  XCircle,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { sessionApi, whatsappLogsApi, type HealthCheck, type WhatsAppLogEvent } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import { buildJourneys, journeyStats, took, type MessageJourney } from '../utils/messageJourneys';
import './WhatsAppLogs.css';

type View = 'messages' | 'activity' | 'raw';
type Filter = 'all' | 'failed' | 'pending' | 'delivered';
const PERIODS: Array<[number, string]> = [
  [60, 'Last hour'],
  [1440, 'Last 24 hours'],
  [10_080, 'Last 7 days'],
];
const STEPS: Array<[keyof MessageJourney['at'], string]> = [
  ['accepted', 'Sent'],
  ['delivered', 'Delivered'],
  ['read', 'Read'],
];

const phoneLabel = (p: string | null) =>
  !p ? 'unknown number' : p.length === 12 && p.startsWith('91') ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : `+${p}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Every official WhatsApp message from send to delivery, what else Meta told us, and what is broken. */
export function WhatsAppLogs() {
  const [params] = useSearchParams();
  const [sessionId, setSessionId] = useState('');
  const [view, setView] = useState<View>('messages');
  const [filter, setFilter] = useState<Filter>('all');
  const [period, setPeriod] = useState(1440);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [live, setLive] = useState(true);

  const sessions = useQuery({ queryKey: ['sessions', 'list'], queryFn: () => sessionApi.list() });
  const cloud = (sessions.data ?? []).filter(s => s.engineType === 'cloud-api');
  const activeId = sessionId || cloud[0]?.id || '';

  const events = useQuery({
    queryKey: ['whatsapp-logs', 'list', sessionId, period],
    queryFn: () => whatsappLogsApi.list({ sessionId: sessionId || undefined, sinceMinutes: period, limit: 1000 }),
    refetchInterval: live ? 5000 : false,
  });
  const list = useMemo(() => events.data ?? [], [events.data]);
  const { journeys, activity } = useMemo(() => buildJourneys(list), [list]);
  const stats = journeyStats(journeys);

  const q = search.trim().toLowerCase().replace(/[\s+]/g, '');
  const shown = journeys.filter(
    j =>
      (filter === 'all' ||
        (filter === 'failed' && (j.stage === 'failed' || j.stage === 'refused')) ||
        (filter === 'pending' && (j.stage === 'accepted' || j.stage === 'sent')) ||
        (filter === 'delivered' && (j.stage === 'delivered' || j.stage === 'read'))) &&
      (!q || j.phone?.includes(q) || j.title.toLowerCase().includes(q) || j.waMessageId.toLowerCase().includes(q)),
  );

  return (
    <div className="whatsapp-logs-page">
      <PageHeader
        title="Message Logs"
        subtitle="Follow every official WhatsApp message from send to read — and see exactly why one did not arrive."
        icon={<ScrollText size={24} />}
        actions={
          <label className="wl2-live">
            <input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />
            <span className={live ? 'is-on' : ''}>{live ? 'Live' : 'Paused'}</span>
          </label>
        }
      />

      <div className="wl2-toolbar">
        {cloud.length > 1 && (
          <select className="wl2-select" value={activeId} onChange={e => setSessionId(e.target.value)} aria-label="WhatsApp number">
            {cloud.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select className="wl2-select" value={period} onChange={e => setPeriod(Number(e.target.value))} aria-label="Period">
          {PERIODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {activeId && <HealthPanel sessionId={activeId} />}

      <section className="wl2-stats" aria-label="Summary">
        <Stat label="Messages sent" value={stats.total} />
        <Stat label="Delivered" value={stats.delivered} tone="good" />
        <Stat label="Read" value={stats.read} tone="good" />
        <Stat label="Failed" value={stats.failed} tone={stats.failed ? 'bad' : undefined} />
        <Stat label="Delivery rate" value={stats.deliveryRate === null ? '—' : `${stats.deliveryRate}%`} />
      </section>

      <section className="wl2-card">
        <div className="wl2-tabs" role="tablist" aria-label="View">
          {(
            [
              ['messages', `Messages (${journeys.length})`],
              ['activity', `Activity (${activity.length})`],
              ['raw', 'Raw log'],
            ] as Array<[View, string]>
          ).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'is-active' : ''} onClick={() => setView(v)}>
              {l}
            </button>
          ))}
        </div>

        {events.isLoading ? (
          <p className="wl2-muted">Loading…</p>
        ) : view === 'messages' ? (
          <>
            <div className="wl2-toolbar">
              <div className="wl2-chips" role="radiogroup" aria-label="Filter">
                {(
                  [
                    ['all', 'All'],
                    ['failed', `Failed${stats.failed ? ` (${stats.failed})` : ''}`],
                    ['pending', 'Waiting'],
                    ['delivered', 'Delivered'],
                  ] as Array<[Filter, string]>
                ).map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={filter === v} className={filter === v ? 'is-active' : ''} onClick={() => setFilter(v)}>
                    {l}
                  </button>
                ))}
              </div>
              <input
                className="wl2-search"
                type="search"
                placeholder="Search number, template or message id"
                aria-label="Search messages"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {shown.length === 0 ? (
              <Empty text={journeys.length ? 'No message matches this filter.' : 'No messages in this period. Send one and it shows up here within seconds.'} />
            ) : (
              <ul className="wl2-journeys">
                {shown.map(j => (
                  <JourneyCard key={j.waMessageId} j={j} />
                ))}
              </ul>
            )}
          </>
        ) : view === 'activity' ? (
          activity.length === 0 ? (
            <Empty text="Nothing else happened in this period." />
          ) : (
            <ul className="wl2-activity">
              {activity.map(e => (
                <ActivityRow key={e.id} e={e} />
              ))}
            </ul>
          )
        ) : (
          <RawLog events={list} />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`wl2-stat ${tone ? `is-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="wl2-empty">{text}</p>;
}

function JourneyCard({ j }: { j: MessageJourney }) {
  const [open, setOpen] = useState(false);
  const failed = j.stage === 'failed' || j.stage === 'refused';
  const reached = (k: keyof MessageJourney['at']) => Boolean(j.at[k]) || (k === 'accepted' && j.stage !== 'refused');
  const deliveredIn = took(j.startedAt, j.at.delivered);
  const Icon = failed ? XCircle : j.stage === 'read' ? CheckCheck : j.stage === 'delivered' ? CheckCircle2 : Clock;

  return (
    <li className={`wl2-journey is-${failed ? 'failed' : j.stage}`}>
      <div className="wl2-journey-head">
        <Icon size={20} className="wl2-journey-icon" aria-hidden="true" />
        <div className="wl2-journey-main">
          <div className="wl2-journey-title">
            <strong>{j.title}</strong>
            <span className="wl2-muted">→ {phoneLabel(j.phone)}</span>
          </div>
          <div className="wl2-journey-meta">
            <span>{dateTime(j.startedAt)}</span>
            {deliveredIn && <span>Delivered in {deliveredIn}</span>}
            {j.category && <span className="wl2-tag">{j.category}</span>}
            {j.billable !== null && <span className="wl2-tag">{j.billable ? 'paid' : 'free'}</span>}
          </div>
        </div>
        <button className="wl2-more" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          Details <ChevronDown size={14} className={open ? 'is-open' : ''} />
        </button>
      </div>

      {failed ? (
        <div className="wl2-failure">
          <strong>{j.stage === 'refused' ? 'Meta refused to send it' : 'Not delivered'}</strong>
          <p>{j.failure?.why ?? j.failure?.reason}</p>
          {j.failure?.fix && (
            <p>
              <strong>What to do:</strong> {j.failure.fix}
            </p>
          )}
          {j.failure?.code && <span className="wl2-muted">Meta error {j.failure.code}</span>}
        </div>
      ) : (
        <ol className="wl2-steps" aria-label="Progress">
          {STEPS.map(([k, label]) => (
            <li key={k} className={reached(k) ? 'is-done' : ''}>
              <span className="wl2-dot" aria-hidden="true" />
              <span>{label}</span>
              {j.at[k] && <time>{time(j.at[k]!)}</time>}
            </li>
          ))}
        </ol>
      )}

      {open && (
        <ol className="wl2-steps-raw">
          {j.events.map(e => (
            <li key={e.id}>
              <time>{time(e.createdAt)}</time> {e.summary}
            </li>
          ))}
          <li className="wl2-muted">Message id: {j.waMessageId}</li>
        </ol>
      )}
    </li>
  );
}

const ACTIVITY_ICON: Record<string, typeof Zap> = { 'message.incoming': MessageCircle, 'health.subscribed': Zap };

function ActivityRow({ e }: { e: WhatsAppLogEvent }) {
  const Icon = ACTIVITY_ICON[e.kind] ?? (e.level === 'error' ? XCircle : Send);
  return (
    <li className={`wl2-act is-${e.level}`}>
      <Icon size={16} aria-hidden="true" />
      <span className="wl2-act-text">{e.summary.replace(/^Meta: /, '')}</span>
      <time>{dateTime(e.createdAt)}</time>
    </li>
  );
}

function RawLog({ events }: { events: WhatsAppLogEvent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!events.length) return <Empty text="Nothing logged in this period." />;
  return (
    <ol className="wl2-list">
      {events.map(e => (
        <li key={e.id} className={`wl2-item is-${e.level}`}>
          <button className="wl2-line" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
            <time>{dateTime(e.createdAt)}</time>
            <span className="wl2-kind">{e.kind}</span>
            <span className="wl2-summary">{e.summary}</span>
          </button>
          {open === e.id && (
            <pre className="wl2-details">{JSON.stringify({ messageId: e.waMessageId, phone: e.phone, ...(e.details ?? {}) }, null, 2)}</pre>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The chain from send to delivery report. Folded to one line while everything works. */
function HealthPanel({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const health = useQuery({ queryKey: ['whatsapp-logs', 'health', sessionId], queryFn: () => whatsappLogsApi.health(sessionId) });
  const subscribe = useMutation({
    mutationFn: () => whatsappLogsApi.subscribe(sessionId),
    onSuccess: r => {
      void health.refetch();
      if (r.ok) toast.success('Fixed', r.message);
      else toast.error('Not fixed', r.message);
    },
    onError: (e: Error) => toast.error('Not fixed', e.message),
  });
  const checks = health.data ?? [];
  const broken = checks.filter(c => c.ok === false);
  const show = expanded || broken.length > 0;
  const callbackUrl = `${window.location.origin}/api/cloud-api/webhook`;

  return (
    <section className={`wl2-card wl2-health ${broken.length ? 'is-bad' : health.data ? 'is-good' : ''}`} aria-label="Delivery health">
      <div className="wl2-health-head">
        {health.isLoading ? (
          <span className="wl2-muted">Checking delivery setup with Meta…</span>
        ) : broken.length ? (
          <strong>
            <XCircle size={18} /> {broken.length} problem{broken.length > 1 ? 's' : ''} stop delivery reports
          </strong>
        ) : (
          <strong>
            <CheckCircle2 size={18} /> Delivery is working — all {checks.length} checks passed
          </strong>
        )}
        <div className="wl2-health-actions">
          <button className="btn btn-secondary" onClick={() => void health.refetch()} disabled={health.isFetching}>
            <RefreshCw size={14} /> {health.isFetching ? 'Checking…' : 'Check again'}
          </button>
          {!broken.length && (
            <button className="wl2-more" aria-expanded={expanded} onClick={() => setExpanded(e => !e)}>
              {expanded ? 'Hide' : 'Show'} checks <ChevronDown size={14} className={expanded ? 'is-open' : ''} />
            </button>
          )}
        </div>
      </div>
      {show && (
        <>
          <ul className="wl2-checks">
            {checks.map(c => (
              <Check key={c.id} check={c} onSubscribe={() => subscribe.mutate()} busy={subscribe.isPending} />
            ))}
          </ul>
          <div className="wl2-callback">
            <span className="wl2-muted">Callback URL for Meta</span>
            <code>{callbackUrl}</code>
            <button className="btn-link" onClick={() => void copyToClipboard(callbackUrl).then(() => toast.success('Copied', callbackUrl))}>
              <Copy size={13} /> Copy
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Check({ check: c, onSubscribe, busy }: { check: HealthCheck; onSubscribe: () => void; busy: boolean }) {
  const Icon = c.ok === true ? CheckCircle2 : c.ok === false ? XCircle : CircleHelp;
  return (
    <li className={`wl2-check ${c.ok === true ? 'is-ok' : c.ok === false ? 'is-bad' : 'is-unknown'}`}>
      <Icon size={17} aria-hidden="true" />
      <div>
        <strong>{c.title}</strong>
        {c.detail && <span className="wl2-muted">{c.detail}</span>}
        {c.fix && c.ok !== true && <span className="wl2-fix">👉 {c.fix}</span>}
        {c.action === 'subscribe_app' && (
          <button className="btn btn-primary" onClick={onSubscribe} disabled={busy}>
            {busy ? 'Subscribing…' : 'Subscribe app'}
          </button>
        )}
      </div>
    </li>
  );
}
