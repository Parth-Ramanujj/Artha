import { useQuery } from '@tanstack/react-query';
import { waToolsApi } from '../../services/api';

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const level = !limit ? '' : pct >= 100 ? 'is-bad' : pct >= 80 ? 'is-warn' : '';
  return (
    <div className="wt-card">
      <strong>{label}</strong>
      <span>
        <strong>{used.toLocaleString('en-IN')}</strong>
        {limit ? ` / ${limit.toLocaleString('en-IN')}` : ' (no limit)'}
      </span>
      {limit ? (
        <div
          className={`wt-meter ${level}`}
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <span className="wt-muted">{note}</span>
    </div>
  );
}

/** Daily messaging limit and free monthly replies for the selected number; alerts go to Notifications. */
export function UsageCard({ sessionId }: { sessionId: string }) {
  const q = useQuery({
    queryKey: ['wa-tools', 'usage', sessionId],
    queryFn: () => waToolsApi.usage(sessionId),
    refetchInterval: 5 * 60_000,
  });
  if (!q.data) return null;
  const u = q.data;
  return (
    <div className="wt-stats">
      <Meter
        label="People messaged with templates (last 24 h)"
        used={u.peopleLast24h}
        limit={u.dailyLimit}
        note={`Meta's daily messaging limit${u.tier ? ` (${u.tier})` : ''}. New people beyond it are refused until the 24 hours roll over.`}
      />
      <Meter
        label="Free replies this month"
        used={u.freeRepliesUsed}
        limit={u.freeRepliesLimit}
        note="Free-form replies (AI chatbot included) are free up to 1,000 a month per number, then charged."
      />
    </div>
  );
}
