import { useCallback, useEffect, useState } from 'react';
import { salesAgentApi } from '../../services/api';
import type { SalesConversation } from '../../types/salesAgent';
import { who } from './format';

const STATUS_LABEL: Record<SalesConversation['status'], string> = {
  open: 'Agent handles it',
  needs_human: 'Needs a person',
  closed: 'Closed',
};

export function ConversationsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<SalesConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    salesAgentApi
      .conversations()
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  const setStatus = async (id: string, status: SalesConversation['status']) => {
    try {
      await salesAgentApi.setConversationStatus(id, status);
      load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update');
    }
  };

  return (
    <section className="sa-panel">
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {rows?.length === 0 && <p className="sa-help">No conversations yet. They start when a prospect is contacted.</p>}
      <ul className="sa-list">
        {rows?.map(c => (
          <li key={c.id} className={`sa-card ${c.status === 'needs_human' ? 'attention' : ''}`}>
            <div className="sa-card-head">
              <strong>{who(c.prospect)}</strong>
              <span className={`sa-chip ${c.channel}`}>{c.channel}</span>
              {c.intent && <span className="sa-chip">{c.intent}</span>}
              <span className="sa-muted">{c.stage.replace(/_/g, ' ')}</span>
              <select
                className="input input-sm"
                aria-label="Conversation owner"
                value={c.status}
                onChange={e => setStatus(c.id, e.target.value as SalesConversation['status'])}
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <ol className="sa-thread">
              {c.thread.slice(-8).map((m, i) => (
                <li key={i} className={m.from}>
                  <span className="sa-muted">
                    {m.from === 'agent' ? 'You' : 'Prospect'} · {new Date(m.at).toLocaleString()}
                  </span>
                  <p>{m.text}</p>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
