import { useState } from 'react';
import { Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { libraryApi } from '../../services/api';
import { useSessionsQuery } from '../../hooks/queries';
import type { LibraryAutomation, LibraryItem } from '../../types/library';
import { describeSchedule, runSummary } from './format';

interface Props {
  automations: LibraryAutomation[];
  items: LibraryItem[];
  onNew: () => void;
  onEdit: (a: LibraryAutomation) => void;
  onChange: () => void;
}

/** Scheduled posting: pause/resume, run now, edit, delete. */
export function AutomationsTab({ automations, items, onNew, onEdit, onChange }: Props) {
  const sessions = useSessionsQuery().data ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleOf = (id: string) => items.find(i => i.id === id)?.title ?? '(deleted post)';

  const act = async (id: string, fn: () => Promise<string | void>) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="sa-panel">
      <div className="sa-toolbar">
        <p className="sa-help sa-grow">
          Post to your Status or send to chats automatically. Several posts in one automation rotate, one per run.
        </p>
        <button className="btn btn-primary" disabled={!items.length} onClick={onNew}>
          <Plus size={14} /> New automation
        </button>
      </div>
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
      {!automations.length ? (
        <p className="sa-help">
          {items.length ? 'No automations yet.' : 'Create a post in the Posts tab first, then schedule it here.'}
        </p>
      ) : (
        <ul className="sa-list">
          {automations.map(a => {
            const next = a.itemIds[a.cursor % Math.max(1, a.itemIds.length)];
            const session = sessions.find(s => s.id === a.sessionId);
            const where = [
              a.postToStatus ? 'Status' : '',
              a.chatIds.length ? `${a.chatIds.length} chat(s)` : '',
            ].filter(Boolean);
            return (
              <li key={a.id} className={a.lastError ? 'sa-card attention' : 'sa-card'}>
                <div className="sa-card-head">
                  <strong>{a.name}</strong>
                  <span className={a.enabled ? 'sa-chip whatsapp' : 'sa-chip'}>{a.enabled ? 'Active' : 'Paused'}</span>
                  <span className="sa-chip">{describeSchedule(a.schedule)}</span>
                </div>
                <p className="sa-help">
                  {where.join(' + ')} from {session?.name ?? 'a removed number'} · {a.itemIds.length} post(s), next:{' '}
                  <em>{titleOf(next)}</em>
                </p>
                <p className="sa-muted">
                  {a.nextRunAt ? `Next run ${new Date(a.nextRunAt).toLocaleString()}` : 'No upcoming run'}
                  {a.lastRunAt ? ` · last run ${new Date(a.lastRunAt).toLocaleString()}` : ''} · {a.runCount} run(s)
                </p>
                {a.lastError && <p className="sa-warn">Last run: {a.lastError}</p>}
                <div className="sa-row-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === a.id}
                    onClick={() =>
                      void act(a.id, () => libraryApi.toggleAutomation(a.id, !a.enabled).then(() => undefined))
                    }
                  >
                    {a.enabled ? <Pause size={14} /> : <Play size={14} />} {a.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === a.id}
                    onClick={() => void act(a.id, () => libraryApi.runAutomation(a.id).then(runSummary))}
                  >
                    <Zap size={14} /> {busyId === a.id ? 'Running…' : 'Run now'}
                  </button>
                  <button className="btn btn-secondary btn-sm" aria-label={`Edit ${a.name}`} onClick={() => onEdit(a)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    aria-label={`Delete ${a.name}`}
                    disabled={busyId === a.id}
                    onClick={() => {
                      if (window.confirm(`Delete automation "${a.name}"?`)) {
                        void act(a.id, () => libraryApi.deleteAutomation(a.id));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
