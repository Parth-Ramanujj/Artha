import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCheck, Pencil, X } from 'lucide-react';
import { salesAgentApi } from '../../services/api';
import type { SalesOutboxItem } from '../../types/salesAgent';
import { Modal } from '../Modal';
import { who } from './format';

const FILTERS = [
  { value: 'pending_review', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved (scheduled)' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: '', label: 'All' },
];

export function OutboxTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('pending_review');
  const [rows, setRows] = useState<SalesOutboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SalesOutboxItem | null>(null);

  const load = useCallback(() => {
    salesAgentApi
      .outbox(status || undefined)
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, [status]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <section className="sa-panel">
      <div className="sa-toolbar">
        <select className="input" aria-label="Filter outbox" value={status} onChange={e => setStatus(e.target.value)}>
          {FILTERS.map(f => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {status === 'pending_review' && !!rows?.length && (
          <button className="btn btn-primary" onClick={() => run(() => salesAgentApi.approveAll())}>
            <CheckCheck size={14} /> Approve all
          </button>
        )}
      </div>
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {rows?.length === 0 && <p className="sa-help">Nothing here.</p>}
      <ul className="sa-list">
        {rows?.map(r => (
          <li key={r.id} className="sa-card">
            <div className="sa-card-head">
              <strong>{who(r.prospect)}</strong>
              <span className={`sa-chip ${r.channel}`}>{r.channel}</span>
              <span className="sa-chip">{r.kind === 'reply' ? 'reply' : `step ${r.step}`}</span>
              <span className="sa-muted">
                {r.status === 'sent' && r.sentAt ? `sent ${new Date(r.sentAt).toLocaleString()}` : `due ${new Date(r.sendAt).toLocaleString()}`}
              </span>
            </div>
            {r.subject && <p className="sa-subject">{r.subject}</p>}
            <p className="sa-body">{r.body}</p>
            {r.error && <p className="sa-warn">{r.error}</p>}
            {r.status === 'pending_review' && (
              <div className="sa-row-actions">
                <button className="btn btn-primary btn-sm" onClick={() => run(() => salesAgentApi.approve(r.id))}>
                  <Check size={14} /> Approve
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(r)}>
                  <Pencil size={14} /> Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => run(() => salesAgentApi.reject(r.id))}>
                  <X size={14} /> Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={input =>
            run(async () => {
              await salesAgentApi.edit(editing.id, input);
              setEditing(null);
            })
          }
        />
      )}
    </section>
  );
}

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: SalesOutboxItem;
  onClose: () => void;
  onSave: (input: { subject?: string; body: string }) => void;
}) {
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  return (
    <Modal
      title="Edit message"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!body.trim()} onClick={() => onSave({ subject, body })}>
            Save
          </button>
        </>
      }
    >
      <div className="sa-page sa-form">
        {item.channel === 'email' && (
          <label>
            Subject
            <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
          </label>
        )}
        <label>
          Message
          <textarea className="input" rows={8} value={body} onChange={e => setBody(e.target.value)} />
        </label>
        <p className="sa-help">Saving keeps it waiting for approval.</p>
      </div>
    </Modal>
  );
}
