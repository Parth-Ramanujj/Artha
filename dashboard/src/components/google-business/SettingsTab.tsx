import { useEffect, useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { googleApi, googleBusinessApi } from '../../services/api';
import { useSessionsQuery } from '../../hooks/queries';
import type { GbpConfig } from '../../types/googleBusiness';
import { LocationPicker } from './LocationPicker';

export function SettingsTab({ onChange }: { onChange: () => void }) {
  const sessions = useSessionsQuery().data ?? [];
  const [cfg, setCfg] = useState<GbpConfig | null>(null);
  const [connections, setConnections] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    googleBusinessApi
      .getConfig()
      .then(res => {
        setConnections(res.connections);
        // One connection and none chosen yet: pick it, so the account list loads straight away.
        const only = res.connections.length === 1 ? res.connections[0].id : '';
        setCfg({ ...res.config, integrationId: res.config.integrationId || only });
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!cfg) return <p className="sa-help">{error ?? 'Loading settings…'}</p>;
  const set = (patch: Partial<GbpConfig>) => setCfg({ ...cfg, ...patch });

  const connect = async () => {
    try {
      const { url } = await googleApi.start({ services: ['business'] });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in');
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // The server only reads the settings fields; id and sync status are ignored.
      setCfg(await googleBusinessApi.updateConfig(cfg));
      setNotice('Saved.');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="sa-panel sa-form">
      <fieldset>
        <legend>Google account</legend>
        {connections.length > 0 && (
          <label>
            Connection
            <select
              className="input"
              value={cfg.integrationId}
              onChange={e => set({ integrationId: e.target.value, accountName: '', locations: [] })}
            >
              <option value="">Choose…</option>
              {connections.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.status !== 'connected' ? `(${c.status})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="sa-inline">
          <button type="button" className="btn btn-secondary" onClick={() => void connect()}>
            <ExternalLink size={14} /> {connections.length ? 'Connect another Google account' : 'Connect with Google'}
          </button>
          <span className="sa-help">Use the Google account that owns or manages your Business Profile.</span>
        </div>
        {cfg.integrationId && (
          <LocationPicker
            key={cfg.integrationId}
            integrationId={cfg.integrationId}
            accountName={cfg.accountName}
            locations={cfg.locations}
            onChange={(accountName, locations) => set({ accountName, locations })}
          />
        )}
      </fieldset>

      <fieldset>
        <legend>Automation</legend>
        <label className="sa-check">
          <input type="checkbox" checked={cfg.enabled} onChange={e => set({ enabled: e.target.checked })} />
          Check for new reviews every
          <input
            className="input"
            type="number"
            min={10}
            max={1440}
            style={{ width: 80 }}
            value={cfg.syncMinutes}
            onChange={e => set({ syncMinutes: Number(e.target.value) })}
          />
          minutes
        </label>
        <label className="sa-check">
          <input type="checkbox" checked={cfg.autoDraft} onChange={e => set({ autoDraft: e.target.checked })} />
          Draft an AI reply for every new review
        </label>
        <label>
          Publish replies without my approval for
          <select
            className="input"
            value={cfg.autoPublishMinStars}
            onChange={e => set({ autoPublishMinStars: Number(e.target.value) })}
          >
            <option value={0}>No reviews (I approve every reply)</option>
            <option value={5}>5-star reviews</option>
            <option value={4}>4 and 5-star reviews</option>
            <option value={3}>3 stars and up</option>
            <option value={1}>All reviews (not recommended)</option>
          </select>
        </label>
        {cfg.autoPublishMinStars > 0 && (
          <label className="sa-check">
            <input
              type="checkbox"
              checked={cfg.autoPublishRequiresText}
              onChange={e => set({ autoPublishRequiresText: e.target.checked })}
            />
            Only when the review has written text
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>How replies sound</legend>
        <div className="sa-grid">
          <label>
            Tone
            <input className="input" value={cfg.tone} onChange={e => set({ tone: e.target.value })} />
          </label>
          <label>
            Signature
            <input
              className="input"
              placeholder="e.g. Team Sharma Sweets"
              value={cfg.signature}
              onChange={e => set({ signature: e.target.value })}
            />
          </label>
        </div>
        <label>
          About your business (the AI only uses these facts)
          <textarea
            className="input"
            rows={4}
            placeholder="What you sell, opening hours, how an unhappy customer can reach you (phone or email)…"
            value={cfg.instructions}
            onChange={e => set({ instructions: e.target.value })}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>WhatsApp alert for low ratings</legend>
        <div className="sa-grid">
          <label>
            Send from
            <select
              className="input"
              value={cfg.alertSessionId}
              onChange={e => set({ alertSessionId: e.target.value })}
            >
              <option value="">No alerts</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            To (with country code)
            <input
              className="input"
              placeholder="919876543210"
              value={cfg.alertPhone}
              onChange={e => set({ alertPhone: e.target.value })}
            />
          </label>
          <label>
            Alert for reviews of
            <select
              className="input"
              value={cfg.alertMaxStars}
              onChange={e => set({ alertMaxStars: Number(e.target.value) })}
            >
              <option value={0}>Never</option>
              <option value={1}>1 star</option>
              <option value={2}>2 stars or less</option>
              <option value={3}>3 stars or less</option>
              <option value={4}>4 stars or less</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Review request message</legend>
        <textarea
          className="input"
          rows={3}
          aria-label="Review request message"
          value={cfg.reviewRequestTemplate}
          onChange={e => set({ reviewRequestTemplate: e.target.value })}
        />
        <p className="sa-help">
          {'{name}'} becomes the customer&apos;s first name and {'{link}'} your Google review link.
        </p>
      </fieldset>

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
      <div className="sa-row-actions">
        <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          <Save size={14} /> Save settings
        </button>
      </div>
    </section>
  );
}
