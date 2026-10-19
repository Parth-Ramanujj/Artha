import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Loader2, PhoneCall, PhoneOutgoing, Search, XCircle } from 'lucide-react';
import { aiCallingApi, type AiCall, type AiCallStatus } from '../../services/api';
import { useToast } from '../Toast';
import { CallDrawer } from './CallDrawer';
import { EmptyState, Pill, StatusPill } from './shared';
import {
  ACTIVE_STATUSES,
  cellStyle,
  errorText,
  formatDuration,
  formatWhen,
  headStyle,
  OUTCOME_LABEL,
  SENTIMENT_META,
  STATUS_META,
} from './callMeta';

const PAGE = 50;

/** The call log; with `verifiedOnly` it is the list of verified leads. */
export function CallsTab({
  verifiedOnly,
  refreshKey,
  onActivity,
}: {
  verifiedOnly?: boolean;
  refreshKey: number;
  /** Called whenever the calls may have changed, so the page can refresh its totals. */
  onActivity?: () => void;
}) {
  const toast = useToast();
  // The toast context changes on every toast; a ref keeps load() stable so an error cannot loop.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const [calls, setCalls] = useState<AiCall[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AiCallStatus | ''>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<AiCall | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [queuing, setQueuing] = useState(false);

  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setLoading(true);
      aiCallingApi
        .calls({
          status: status || undefined,
          verified: verifiedOnly ? true : undefined,
          search: search || undefined,
          limit: PAGE,
        })
        .then(res => {
          setCalls(res.items);
          setTotal(res.total);
          if (quiet) onActivity?.();
          setOpen(prev => (prev ? (res.items.find(c => c.id === prev.id) ?? prev) : prev));
        })
        .catch(err => {
          if (!quiet) toastRef.current.error(errorText(err, 'Could not load calls'));
        })
        .finally(() => setLoading(false));
    },
    [status, search, verifiedOnly, onActivity],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => load(), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey, search]);

  // Live refresh while anything is queued or on a call.
  const active = calls.some(c => ACTIVE_STATUSES.includes(c.status));
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => load(true), 4000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const queue = async () => {
    setQueuing(true);
    try {
      const call = await aiCallingApi.queueCall({ phone, name: name || undefined });
      toast.success(call.status === 'skipped' ? 'This number opted out (DND), so it was not called' : 'Call queued');
      setPhone('');
      setName('');
      load(true);
    } catch (err) {
      toast.error(errorText(err, 'Could not queue the call'));
    } finally {
      setQueuing(false);
    }
  };

  const cancel = async (call: AiCall) => {
    try {
      await aiCallingApi.cancelCall(call.id);
      load(true);
    } catch (err) {
      toast.error(errorText(err, 'Could not cancel the call'));
    }
  };

  return (
    <div>
      {!verifiedOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Mobile number, e.g. 98765 43210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            style={{ flex: '1 1 200px', maxWidth: 240 }}
            aria-label="Mobile number"
          />
          <input
            className="input"
            placeholder="Name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ flex: '1 1 160px', maxWidth: 200 }}
            aria-label="Name"
          />
          <button className="btn-primary" onClick={() => void queue()} disabled={queuing || !phone.trim()}>
            {queuing ? <Loader2 size={15} className="animate-spin" /> : <PhoneOutgoing size={15} />} AI call this number
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            className="input"
            placeholder="Search name or number"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34, width: '100%' }}
            aria-label="Search calls"
          />
        </div>
        {!verifiedOnly && (
          <select
            className="input"
            value={status}
            onChange={e => setStatus(e.target.value as AiCallStatus | '')}
            style={{ width: 'auto' }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        )}
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{total} calls</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={26} className="animate-spin" />
        </div>
      ) : calls.length === 0 ? (
        <EmptyState
          icon={verifiedOnly ? <BadgeCheck size={30} /> : <PhoneCall size={30} />}
          title={verifiedOnly ? 'No verified leads yet' : 'No calls yet'}
          hint={
            verifiedOnly
              ? 'Calls where the customer is interested and agreed to a call back appear here.'
              : 'Call a number above, upload a list in Call lists, or use AI Call on the Leads page.'
          }
        />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 900 }}>
            <thead>
              <tr>
                <th style={headStyle}>Contact</th>
                <th style={headStyle}>Status</th>
                <th style={headStyle}>Result</th>
                <th style={headStyle}>Summary</th>
                <th style={headStyle}>When</th>
                <th style={headStyle}>Length</th>
                <th style={headStyle} />
              </tr>
            </thead>
            <tbody>
              {calls.map(call => {
                const sentiment = call.sentiment ? SENTIMENT_META[call.sentiment] : null;
                return (
                  <tr key={call.id} onClick={() => setOpen(call)} style={{ cursor: 'pointer' }}>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 600 }}>{call.contactName || call.extracted?.name || 'Unknown'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{call.phone}</div>
                    </td>
                    <td style={cellStyle}>
                      <StatusPill call={call} />
                      {call.attempts > 1 && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                          Attempt {call.attempts}
                        </div>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {call.isVerifiedLead && (
                          <Pill color="#22c55e">
                            <BadgeCheck size={12} /> Verified
                          </Pill>
                        )}
                        {call.outcome && !call.isVerifiedLead && (
                          <Pill color="#64748b">{OUTCOME_LABEL[call.outcome]}</Pill>
                        )}
                        {sentiment && <span title={sentiment.label}>{sentiment.emoji}</span>}
                      </div>
                    </td>
                    <td style={{ ...cellStyle, maxWidth: 320 }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-secondary)',
                        }}
                        title={call.summary ?? call.error ?? undefined}
                      >
                        {call.summary ?? call.error ?? '—'}
                      </div>
                    </td>
                    <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                      {formatWhen(call.answeredAt ?? call.createdAt)}
                    </td>
                    <td style={cellStyle}>{formatDuration(call.durationSeconds)}</td>
                    <td style={cellStyle} onClick={e => e.stopPropagation()}>
                      {call.status === 'queued' && (
                        <button
                          className="btn-secondary"
                          onClick={() => void cancel(call)}
                          title="Cancel this call"
                          aria-label="Cancel this call"
                        >
                          <XCircle size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <CallDrawer
          call={open}
          onClose={() => setOpen(null)}
          onChanged={updated => {
            setOpen(updated);
            setCalls(prev => prev.map(c => (c.id === updated.id ? updated : c)));
          }}
        />
      )}
    </div>
  );
}
