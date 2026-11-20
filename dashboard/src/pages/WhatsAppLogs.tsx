import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleHelp, Copy, RefreshCw, ScrollText, XCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { sessionApi, whatsappLogsApi, type HealthCheck, type WhatsAppLogEvent } from '../services/api';
import { copyToClipboard } from '../utils/clipboard';
import './WhatsAppLogs.css';

const KINDS: Array<[string, string]> = [
  ['', 'Everything'],
  ['send.', 'Sends'],
  ['status.', 'Delivery reports'],
  ['message.', 'Incoming messages'],
  ['webhook.', 'Other webhooks'],
];
const KIND_LABEL: Record<string, string> = {
  'send.accepted': 'Sent',
  'send.rejected': 'Send refused',
  'status.sent': 'Sent (Meta)',
  'status.delivered': 'Delivered',
  'status.read': 'Read',
  'status.failed': 'Failed',
  'message.incoming': 'Incoming',
  'webhook.rejected': 'Webhook rejected',
  'webhook.unmatched': 'Webhook ignored',
  'health.subscribed': 'Fix applied',
};

/** Everything that happened to official WhatsApp messages, from send to delivery, and what is broken. */
export function WhatsAppLogs() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [sessionId, setSessionId] = useState('');
  const [kind, setKind] = useState('');
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [live, setLive] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const sessions = useQuery({ queryKey: ['sessions', 'list'], queryFn: () => sessionApi.list() });
  const cloud = (sessions.data ?? []).filter(s => s.engineType === 'cloud-api');
  const activeId = sessionId || cloud[0]?.id || '';

  const health = useQuery({
    queryKey: ['whatsapp-logs', 'health', activeId],
    queryFn: () => whatsappLogsApi.health(activeId),
    enabled: Boolean(activeId),
  });
  const events = useQuery({
    queryKey: ['whatsapp-logs', 'list', activeId, kind, level, search],
    queryFn: () =>
      whatsappLogsApi.list({ sessionId: sessionId || undefined, kind: kind || undefined, level: level || undefined, search: search.trim() || undefined, limit: 300 }),
    refetchInterval: live ? 5000 : false,
  });
  const subscribe = useMutation({
    mutationFn: () => whatsappLogsApi.subscribe(activeId),
    onSuccess: r => {
      void health.refetch();
      if (r.ok) toast.success('Fixed', r.message);
      else toast.error('Not fixed', r.message);
    },
    onError: (e: Error) => toast.error('Not fixed', e.message),
  });

  const callbackUrl = `${window.location.origin}/api/cloud-api/webhook`;
  const broken = (health.data ?? []).filter(c => c.ok === false);
  const list = useMemo(() => events.data ?? [], [events.data]);
  const groups = useMemo(() => groupByMessage(list), [list]);

  return (
    <div className="whatsapp-logs-page">
      <PageHeader
        title="Message Logs"
        subtitle="Every official WhatsApp message from send to delivery, every webhook from Meta, and what is broken."
        icon={<ScrollText size={24} />}
      />

      {cloud.length > 1 && (
        <select className="wl2-select" value={activeId} onChange={e => setSessionId(e.target.value)} aria-label="WhatsApp number">
          {cloud.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {activeId && (
        <section className={`wl2-card ${broken.length ? 'is-bad' : ''}`} aria-labelledby="wl2-health">
          <div className="wl2-row wl2-between">
            <h2 id="wl2-health" className="wl2-title">
              {broken.length ? `Delivery health: ${broken.length} problem${broken.length > 1 ? 's' : ''} found` : 'Delivery health'}
            </h2>
            <button className="btn btn-secondary" onClick={() => void health.refetch()} disabled={health.isFetching}>
              <RefreshCw size={14} /> {health.isFetching ? 'Checking…' : 'Check again'}
            </button>
          </div>
          {health.isLoading ? (
            <p className="wl2-muted">Checking with Meta…</p>
          ) : (
            <ul className="wl2-checks">
              {(health.data ?? []).map(c => (
                <Check key={c.id} check={c} onSubscribe={() => subscribe.mutate()} busy={subscribe.isPending} />
              ))}
            </ul>
          )}
          <div className="wl2-row wl2-muted">
            Callback URL for Meta: <code>{callbackUrl}</code>
            <button
              className="btn-link"
              onClick={() => void copyToClipboard(callbackUrl).then(() => toast.success('Copied', callbackUrl))}
            >
              <Copy size={13} /> Copy
            </button>
          </div>
        </section>
      )}

      <section className="wl2-card" aria-labelledby="wl2-log">
        <div className="wl2-row wl2-between">
          <h2 id="wl2-log" className="wl2-title">Timeline</h2>
          <label className="wl2-row wl2-muted">
            <input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Live (every 5 s)
          </label>
        </div>
        <div className="wl2-row">
          <select className="wl2-select" value={kind} onChange={e => setKind(e.target.value)} aria-label="Type">
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="wl2-select" value={level} onChange={e => setLevel(e.target.value)} aria-label="Level">
            <option value="">All levels</option>
            <option value="error">Problems only</option>
            <option value="success">Delivered / read</option>
          </select>
          <input
            className="wl2-search"
            type="search"
            placeholder="Phone number or message id (wamid…)"
            aria-label="Search"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {events.isLoading ? (
          <p className="wl2-muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="wl2-muted">
            Nothing yet. Send a message to an official number; every step will appear here within seconds.
          </p>
        ) : (
          <ol className="wl2-list">
            {list.map(e => (
              <li key={e.id} className={`wl2-item is-${e.level}`}>
                <button className="wl2-line" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <time>{new Date(e.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                  <span className="wl2-kind">{KIND_LABEL[e.kind] ?? e.kind.replace(/^webhook\./, '')}</span>
                  <span className="wl2-summary">{e.summary}</span>
                </button>
                {e.waMessageId && (groups.get(e.waMessageId) ?? 0) > 1 && search !== e.waMessageId && (
                  <button className="btn-link wl2-trace" onClick={() => setSearch(e.waMessageId!)}>
                    Show this message&apos;s journey
                  </button>
                )}
                {open === e.id && (
                  <pre className="wl2-details">
                    {JSON.stringify({ messageId: e.waMessageId, phone: e.phone, ...(e.details ?? {}) }, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** How many log lines share each message id, so a single message's journey can be traced. */
function groupByMessage(list: WhatsAppLogEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of list) if (e.waMessageId) m.set(e.waMessageId, (m.get(e.waMessageId) ?? 0) + 1);
  return m;
}

function Check({ check: c, onSubscribe, busy }: { check: HealthCheck; onSubscribe: () => void; busy: boolean }) {
  const Icon = c.ok === true ? CheckCircle2 : c.ok === false ? XCircle : CircleHelp;
  return (
    <li className={`wl2-check ${c.ok === true ? 'is-ok' : c.ok === false ? 'is-bad' : 'is-unknown'}`}>
      <Icon size={17} aria-hidden="true" />
      <div>
        <strong>{c.title}</strong>
        {c.detail && <span className="wl2-muted">{c.detail}</span>}
        {c.fix && <span className="wl2-fix">👉 {c.fix}</span>}
        {c.action === 'subscribe_app' && (
          <button className="btn btn-primary" onClick={onSubscribe} disabled={busy}>
            {busy ? 'Subscribing…' : 'Subscribe app'}
          </button>
        )}
      </div>
    </li>
  );
}
