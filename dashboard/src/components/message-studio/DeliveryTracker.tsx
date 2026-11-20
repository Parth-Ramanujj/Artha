import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCheck, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { messageCostsApi } from '../../services/api';

const STEPS = ['sent', 'delivered', 'read'] as const;
const STEP_LABEL = { sent: 'Accepted by WhatsApp', delivered: 'Delivered to the phone', read: 'Read' };
const NO_WEBHOOK_AFTER_MS = 45_000;
const STOP_AFTER_MS = 3 * 60_000;

/**
 * Live delivery of one sent message. "Accepted" only means Meta took it; whether it reaches the phone
 * arrives later on the status webhook, so this keeps checking and explains a failure in plain words.
 */
export function DeliveryTracker({ sessionId, messageId }: { sessionId: string; messageId: string }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = now - startedAt;

  const report = useQuery({
    queryKey: ['delivery', sessionId, messageId],
    queryFn: () => messageCostsApi.delivery(sessionId, messageId),
    refetchInterval: q => {
      const s = q.state.data?.status;
      return s === 'read' || s === 'failed' || Date.now() - startedAt > STOP_AFTER_MS ? false : 3000;
    },
  });
  const r = report.data;
  const status = r?.status ?? 'sent';
  const reached = status === 'unknown' ? 0 : STEPS.indexOf(status as (typeof STEPS)[number]) + 1;

  return (
    <div className="dt-box" role="status" aria-live="polite">
      {status === 'failed' ? (
        <div className="dt-failed">
          <strong>
            <XCircle size={16} /> Not delivered
          </strong>
          <p>{r?.why}</p>
          <p>
            <strong>What to do:</strong> {r?.fix}
          </p>
          {r?.errorCode ? (
            <p className="dt-muted">
              Meta error {r.errorCode}
              {r.errorTitle ? `: ${r.errorTitle}` : ''}
            </p>
          ) : null}
        </div>
      ) : (
        <ol className="dt-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < reached ? 'is-done' : ''}>
              {i < reached ? s === 'read' ? <CheckCheck size={15} /> : <CheckCircle2 size={15} /> : <Clock size={15} />}{' '}
              {STEP_LABEL[s]}
            </li>
          ))}
        </ol>
      )}

      {status !== 'failed' && status !== 'read' && !r?.webhookSeen && elapsed > NO_WEBHOOK_AFTER_MS && (
        <div className="dt-warn">
          <strong>No report from WhatsApp yet.</strong> WhatsApp is probably not sending delivery reports to this
          server. <Link to="/whatsapp-logs">Open Message Logs</Link> — its health check finds the broken step and can
          fix the most common one in one click.
        </div>
      )}
      <Link className="dt-muted" to={`/whatsapp-logs?search=${encodeURIComponent(messageId)}`}>
        See every step of this message in Message Logs →
      </Link>
      {status === 'delivered' && (
        <p className="dt-muted">It is on their phone. “Read” appears if they open it and have read receipts on.</p>
      )}
      {r?.billable === true && r.estimatedInr ? (
        <p className="dt-muted">Charged ≈ ₹{r.estimatedInr.toFixed(2)} by Meta.</p>
      ) : null}
      {r?.billable === false && <p className="dt-muted">Free — no charge for this message.</p>}
    </div>
  );
}
