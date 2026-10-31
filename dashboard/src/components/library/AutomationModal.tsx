import { useState } from 'react';
import { Modal } from '../Modal';
import { libraryApi } from '../../services/api';
import type { LibraryAutomation, LibraryItem, LibrarySchedule, LibraryTarget } from '../../types/library';
import { TargetFields } from './TargetFields';
import { DAYS, parseChats } from './format';

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

/** ISO instant → value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

interface Props {
  automation: LibraryAutomation | null;
  items: LibraryItem[];
  /** Pre-picked posts when scheduling from a post card. */
  initialItemIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** Create/edit an automation: which posts, where, and when (once, daily or weekly). */
export function AutomationModal({ automation, items, initialItemIds, onClose, onSaved }: Props) {
  const a = automation;
  const [name, setName] = useState(a?.name ?? '');
  const [itemIds, setItemIds] = useState<string[]>(a?.itemIds ?? initialItemIds ?? []);
  const [target, setTarget] = useState<LibraryTarget>({
    sessionId: a?.sessionId ?? '',
    postToStatus: a?.postToStatus ?? true,
    chatIds: a?.chatIds ?? [],
  });
  const [chats, setChats] = useState((a?.chatIds ?? []).map(c => c.replace(/@c\.us$/, '')).join('\n'));
  const [kind, setKind] = useState<LibrarySchedule['kind']>(a?.schedule.kind ?? 'daily');
  const [at, setAt] = useState(toLocalInput(a?.schedule.at));
  const [time, setTime] = useState(a?.schedule.time ?? '09:00');
  const [days, setDays] = useState<number[]>(a?.schedule.days ?? [1, 3, 5]);
  const [timezone] = useState(a?.schedule.timezone ?? browserZone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleItem = (id: string) => setItemIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  const toggleDay = (d: number) => setDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]));

  const save = async () => {
    setBusy(true);
    setError(null);
    const schedule: LibrarySchedule =
      kind === 'once'
        ? { kind, at: at ? new Date(at).toISOString() : '', timezone }
        : { kind, time, timezone, ...(kind === 'weekly' ? { days } : {}) };
    try {
      await libraryApi.saveAutomation(
        { name, itemIds, ...target, chatIds: parseChats(chats), schedule, enabled: a?.enabled ?? true },
        a?.id,
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={a ? 'Edit automation' : 'New automation'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !name.trim() || !itemIds.length || !target.sessionId}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save automation'}
          </button>
        </>
      }
    >
      <div className="sa-form">
        <label>
          Name
          <input
            className="input"
            placeholder="e.g. Good morning status"
            value={name}
            maxLength={200}
            onChange={e => setName(e.target.value)}
          />
        </label>

        <fieldset>
          <legend>Posts ({itemIds.length} picked)</legend>
          <p className="sa-help">Pick one, or several to rotate: each run posts the next one in the list.</p>
          {items.length ? (
            <ul className="lib-pick">
              {items.map(item => (
                <li key={item.id}>
                  <label className="sa-check">
                    <input type="checkbox" checked={itemIds.includes(item.id)} onChange={() => toggleItem(item.id)} />
                    <span className="sa-ellipsis">{item.title}</span>
                    <span className="sa-chip">{item.type}</span>
                    {item.category && <span className="sa-chip">{item.category}</span>}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-warn">Create a post first.</p>
          )}
        </fieldset>

        <TargetFields value={target} chatsText={chats} onChange={setTarget} onChatsText={setChats} />

        <fieldset>
          <legend>When</legend>
          <div className="sa-grid">
            <label>
              Repeat
              <select className="input" value={kind} onChange={e => setKind(e.target.value as LibrarySchedule['kind'])}>
                <option value="once">Once</option>
                <option value="daily">Every day</option>
                <option value="weekly">Some days of the week</option>
              </select>
            </label>
            {kind === 'once' ? (
              <label>
                Date and time
                <input className="input" type="datetime-local" value={at} onChange={e => setAt(e.target.value)} />
              </label>
            ) : (
              <label>
                Time
                <input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} />
              </label>
            )}
          </div>
          {kind === 'weekly' && (
            <div className="sa-row-actions" role="group" aria-label="Days of the week">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(i)}
                  className={days.includes(i) ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => toggleDay(i)}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          <p className="sa-help">Times are in {timezone}.</p>
        </fieldset>

        {error && (
          <p className="sa-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
