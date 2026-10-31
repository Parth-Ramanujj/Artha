import { useState } from 'react';
import { Eye, Save, Send } from 'lucide-react';
import { growthApi } from '../../services/api';
import type { GrowthSettings, SummaryPreview } from '../../types/growth';
import type { SaveSettings } from '../../pages/Growth';
import { SessionPicker } from './SessionPicker';
import { useSaver } from './useSaver';

/** The owner's end-of-day WhatsApp summary: leads, deals, complaints and who to follow up. */
export function SummaryTab({ settings, onSave }: { settings: GrowthSettings; onSave: SaveSettings }) {
  const [draft, setDraft] = useState(settings);
  const [preview, setPreview] = useState<SummaryPreview | null>(null);
  const { busy, run, messages } = useSaver();
  const set = (patch: Partial<GrowthSettings>) => setDraft({ ...draft, ...patch });

  const save = () =>
    run(async () => {
      const { sessionId, timezone, summaryEnabled, ownerPhone, summaryTime } = draft;
      await onSave({ sessionId, timezone, summaryEnabled, ownerPhone, summaryTime });
      return 'Saved.';
    });

  return (
    <section className="sa-panel sa-form">
      {messages}
      <fieldset>
        <legend>Daily summary on WhatsApp</legend>
        <label className="sa-check">
          <input
            type="checkbox"
            checked={draft.summaryEnabled}
            onChange={e => set({ summaryEnabled: e.target.checked })}
          />
          Send me a summary every day at
          <input
            className="input"
            type="time"
            style={{ width: 120 }}
            value={draft.summaryTime}
            aria-label="Summary time"
            onChange={e => set({ summaryTime: e.target.value })}
          />
        </label>
        <label>
          Owner's WhatsApp number (with country code)
          <input
            className="input"
            maxLength={20}
            placeholder="919876543210"
            value={draft.ownerPhone}
            onChange={e => set({ ownerPhone: e.target.value })}
          />
        </label>
        <SessionPicker value={draft.sessionId} onChange={sessionId => set({ sessionId: sessionId || null })} />
        <label>
          Timezone
          <input className="input" value={draft.timezone} onChange={e => set({ timezone: e.target.value })} />
        </label>
        {settings.summaryLastError && <p className="sa-warn">Last send problem: {settings.summaryLastError}</p>}
        <div className="sa-inline">
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            <Save size={14} /> Save
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void run(async () => setPreview(await growthApi.previewSummary()))}
          >
            <Eye size={14} /> Preview today
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy || !settings.ownerPhone || !settings.sessionId}
            onClick={() =>
              void run(async () => {
                await growthApi.sendSummary();
                return 'Sent to the owner.';
              })
            }
          >
            <Send size={14} /> Send now
          </button>
        </div>
      </fieldset>

      {preview && (
        <fieldset>
          <legend>Today's summary {preview.ai ? '' : '(plain, AI unavailable)'}</legend>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{preview.text}</pre>
        </fieldset>
      )}
    </section>
  );
}
