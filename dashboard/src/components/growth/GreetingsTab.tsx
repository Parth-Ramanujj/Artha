import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { growthApi } from '../../services/api';
import type { GreetingLogEntry, GrowthSettings } from '../../types/growth';
import type { SaveSettings } from '../../pages/Growth';
import { SessionPicker } from './SessionPicker';
import { ContactDates } from './ContactDates';
import { useSaver } from './useSaver';

const KIND = { birthday: 'Birthday', anniversary: 'Anniversary', winback: 'Win-back' } as const;

/** Birthday, anniversary and win-back messages, sent once a day at a set time. */
export function GreetingsTab({ settings, onSave }: { settings: GrowthSettings; onSave: SaveSettings }) {
  const [draft, setDraft] = useState(settings);
  const [log, setLog] = useState<GreetingLogEntry[]>([]);
  const { busy, run, messages } = useSaver();
  const set = (patch: Partial<GrowthSettings>) => setDraft({ ...draft, ...patch });

  useEffect(() => {
    growthApi
      .greetings()
      .then(setLog)
      .catch(() => setLog([]));
  }, []);

  const save = () =>
    run(async () => {
      const {
        sessionId,
        timezone,
        greetingsEnabled,
        greetingTime,
        birthdayText,
        anniversaryText,
        winbackDays,
        winbackText,
        dailySendCap,
      } = draft;
      await onSave({
        sessionId,
        timezone,
        greetingsEnabled,
        greetingTime,
        birthdayText,
        anniversaryText,
        winbackDays,
        winbackText,
        dailySendCap,
      });
      return 'Saved.';
    });

  return (
    <section className="sa-panel sa-form">
      {messages}
      <fieldset>
        <legend>Automatic greetings</legend>
        <label className="sa-check">
          <input
            type="checkbox"
            checked={draft.greetingsEnabled}
            onChange={e => set({ greetingsEnabled: e.target.checked })}
          />
          Send greetings every day at
          <input
            className="input"
            type="time"
            style={{ width: 120 }}
            value={draft.greetingTime}
            aria-label="Greeting time"
            onChange={e => set({ greetingTime: e.target.value })}
          />
        </label>
        <SessionPicker value={draft.sessionId} onChange={sessionId => set({ sessionId: sessionId || null })} />
        <label>
          Timezone
          <input className="input" value={draft.timezone} onChange={e => set({ timezone: e.target.value })} />
        </label>
        <label>
          Birthday message <span className="sa-muted">({'{name}'} becomes the customer's name; empty = off)</span>
          <textarea
            className="input"
            rows={2}
            maxLength={1000}
            value={draft.birthdayText}
            onChange={e => set({ birthdayText: e.target.value })}
          />
        </label>
        <label>
          Anniversary message
          <textarea
            className="input"
            rows={2}
            maxLength={1000}
            value={draft.anniversaryText}
            onChange={e => set({ anniversaryText: e.target.value })}
          />
        </label>
        <label>
          Win-back: message customers who have been quiet for this many days (0 = off)
          <input
            className="input"
            type="number"
            min={0}
            max={365}
            style={{ width: 100 }}
            value={draft.winbackDays}
            onChange={e => set({ winbackDays: Number(e.target.value) })}
          />
        </label>
        <label>
          Win-back message
          <textarea
            className="input"
            rows={2}
            maxLength={1000}
            value={draft.winbackText}
            onChange={e => set({ winbackText: e.target.value })}
          />
        </label>
        <label>
          At most this many greetings per day
          <input
            className="input"
            type="number"
            min={1}
            max={500}
            style={{ width: 100 }}
            value={draft.dailySendCap}
            onChange={e => set({ dailySendCap: Number(e.target.value) })}
          />
        </label>
        <p className="sa-help">Customers who opted out are always skipped. Each person gets each greeting only once.</p>
        {settings.greetingsLastError && <p className="sa-warn">Last run problem: {settings.greetingsLastError}</p>}
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          <Save size={14} /> Save
        </button>
      </fieldset>

      <ContactDates />

      <fieldset>
        <legend>Recently sent</legend>
        {!log.length ? (
          <p className="sa-help">Nothing sent yet.</p>
        ) : (
          <ul className="sa-list">
            {log.slice(0, 30).map(g => (
              <li key={g.id}>
                {KIND[g.kind]} → {g.name || g.chatId.replace(/@.*$/, '')}{' '}
                <span className="sa-muted">
                  {g.status}
                  {g.error ? ` (${g.error})` : ''} · {new Date(g.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </section>
  );
}
