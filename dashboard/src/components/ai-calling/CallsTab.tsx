import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2, PhoneCall, PhoneOutgoing, Search, XCircle } from 'lucide-react';
import { aiCallingApi, type AiCall, type AiCallingSetup, type AiCallStatus } from '../../services/api';
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
  SENTIMENT_META,
  STATUS_COLOR,
} from './callMeta';

const PAGE = 50;

/** The call log; with `verifiedOnly` it is the list of verified leads. */
export function CallsTab({
  verifiedOnly,
  setup,
  refreshKey,
  onActivity,
}: {
  verifiedOnly?: boolean;
  setup?: AiCallingSetup | null;
  refreshKey: number;
  /** Called whenever the calls may have changed, so the page can refresh its totals. */
  onActivity?: () => void;
}) {
  const { t } = useTranslation();
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
  const [loadingMore, setLoadingMore] = useState(false);
  // How many rows are shown, so a live refresh keeps the pages already loaded.
  const shown = useRef(PAGE);

  const filters = useCallback(
    () => ({
      status: status || undefined,
      verified: verifiedOnly ? true : undefined,
      search: search || undefined,
    }),
    [status, search, verifiedOnly],
  );

  const load = useCallback(
    (quiet = false) => {
      if (!quiet) {
        setLoading(true);
        shown.current = PAGE;
      }
      aiCallingApi
        .calls({ ...filters(), limit: Math.max(PAGE, shown.current) })
        .then(res => {
          setCalls(res.items);
          shown.current = Math.max(PAGE, res.items.length);
          setTotal(res.total);
          if (quiet) onActivity?.();
          setOpen(prev => (prev ? (res.items.find(c => c.id === prev.id) ?? prev) : prev));
        })
        .catch(err => {
          if (!quiet) toastRef.current.error(errorText(err, t('aiCalling.calls.loadFailed')));
        })
        .finally(() => setLoading(false));
    },
    [filters, onActivity, t],
  );

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await aiCallingApi.calls({ ...filters(), limit: PAGE, offset: calls.length });
      setCalls(prev => {
        const seen = new Set(prev.map(c => c.id));
        const next = [...prev, ...res.items.filter(c => !seen.has(c.id))];
        shown.current = next.length;
        return next;
      });
      setTotal(res.total);
    } catch (err) {
      toast.error(errorText(err, t('aiCalling.calls.loadMoreFailed')));
    } finally {
      setLoadingMore(false);
    }
  };

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
      toast.success(call.status === 'skipped' ? t('aiCalling.calls.dnd') : t('aiCalling.calls.queued'));
      setPhone('');
      setName('');
      load(true);
    } catch (err) {
      toast.error(errorText(err, t('aiCalling.calls.queueFailed')));
    } finally {
      setQueuing(false);
    }
  };

  const cancel = async (call: AiCall) => {
    try {
      await aiCallingApi.cancelCall(call.id);
      load(true);
    } catch (err) {
      toast.error(errorText(err, t('aiCalling.calls.cancelFailed')));
    }
  };

  return (
    <div>
      {!verifiedOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <input
            className="input"
            placeholder={t('aiCalling.calls.phonePlaceholder')}
            value={phone}
            onChange={e => setPhone(e.target.value)}
            style={{ flex: '1 1 200px', maxWidth: 240 }}
            aria-label={t('aiCalling.calls.phoneLabel')}
          />
          <input
            className="input"
            placeholder={t('aiCalling.calls.namePlaceholder')}
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ flex: '1 1 160px', maxWidth: 200 }}
            aria-label={t('aiCalling.calls.nameLabel')}
          />
          <button className="btn-primary" onClick={() => void queue()} disabled={queuing || !phone.trim()}>
            {queuing ? <Loader2 size={15} className="animate-spin" /> : <PhoneOutgoing size={15} />}{' '}
            {t('aiCalling.calls.callNumber')}
          </button>
          {setup?.readyForPhoneCalls === false && (
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{t('aiCalling.waitForSetup')}</span>
          )}
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
            placeholder={t('aiCalling.calls.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34, width: '100%' }}
            aria-label={t('aiCalling.calls.searchLabel')}
          />
        </div>
        {!verifiedOnly && (
          <select
            className="input"
            value={status}
            onChange={e => setStatus(e.target.value as AiCallStatus | '')}
            style={{ width: 'auto' }}
            aria-label={t('aiCalling.calls.statusFilter')}
          >
            <option value="">{t('aiCalling.calls.allStatuses')}</option>
            {Object.keys(STATUS_COLOR).map(value => (
              <option key={value} value={value}>
                {t(`aiCalling.status.${value}`)}
              </option>
            ))}
          </select>
        )}
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          {t('aiCalling.calls.total', { count: total })}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={26} className="animate-spin" />
        </div>
      ) : calls.length === 0 ? (
        <EmptyState
          icon={verifiedOnly ? <BadgeCheck size={30} /> : <PhoneCall size={30} />}
          title={verifiedOnly ? t('aiCalling.calls.emptyVerified') : t('aiCalling.calls.empty')}
          hint={verifiedOnly ? t('aiCalling.calls.emptyVerifiedHint') : t('aiCalling.calls.emptyHint')}
        />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 900 }}>
            <thead>
              <tr>
                <th style={headStyle}>{t('aiCalling.calls.contact')}</th>
                <th style={headStyle}>{t('aiCalling.calls.status')}</th>
                <th style={headStyle}>{t('aiCalling.calls.result')}</th>
                <th style={headStyle}>{t('aiCalling.calls.summary')}</th>
                <th style={headStyle}>{t('aiCalling.calls.when')}</th>
                <th style={headStyle}>{t('aiCalling.calls.length')}</th>
                <th style={headStyle} />
              </tr>
            </thead>
            <tbody>
              {calls.map(call => {
                const sentiment = call.sentiment ? SENTIMENT_META[call.sentiment] : null;
                return (
                  <tr
                    key={call.id}
                    onClick={() => setOpen(call)}
                    tabIndex={0}
                    aria-label={t('aiCalling.calls.openCall', { name: call.contactName || call.phone })}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpen(call);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 600 }}>
                        {call.contactName || call.extracted?.name || t('aiCalling.calls.unknown')}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{call.phone}</div>
                    </td>
                    <td style={cellStyle}>
                      <StatusPill call={call} />
                      {call.attempts > 1 && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                          {t('aiCalling.calls.attempt', { count: call.attempts })}
                        </div>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {call.isVerifiedLead && (
                          <Pill color="#22c55e">
                            <BadgeCheck size={12} /> {t('aiCalling.calls.verified')}
                          </Pill>
                        )}
                        {call.outcome && !call.isVerifiedLead && (
                          <Pill color="#64748b">{t(`aiCalling.outcome.${call.outcome}`)}</Pill>
                        )}
                        {sentiment && <span title={t(`aiCalling.sentiment.${call.sentiment}`)}>{sentiment.emoji}</span>}
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
                          title={t('aiCalling.calls.cancelCall')}
                          aria-label={t('aiCalling.calls.cancelCall')}
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
      {!loading && calls.length < total && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button className="btn-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore && <Loader2 size={15} className="animate-spin" />}{' '}
            {t('aiCalling.calls.loadMore', { count: total - calls.length })}
          </button>
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
