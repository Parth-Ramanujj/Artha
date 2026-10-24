import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { integrationApi, salesAgentApi } from '../../services/api';
import { useSessionsQuery } from '../../hooks/queries';
import type { SalesAgentConfig, SalesChannelName } from '../../types/salesAgent';

const csv = (v: string[]) => v.join(', ');
const fromCsv = (v: string) =>
  v
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export function SettingsTab({ onChange }: { onChange: () => void }) {
  const sessions = useSessionsQuery().data ?? [];
  const [cfg, setCfg] = useState<SalesAgentConfig | null>(null);
  const [channels, setChannels] = useState<SalesChannelName[]>([]);
  const [smtp, setSmtp] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    salesAgentApi
      .getConfig()
      .then(res => {
        setCfg(res.config);
        setChannels(res.channels);
        if (res.channels.includes('email')) {
          integrationApi
            .list('email_smtp')
            .then(list => setSmtp((list as Array<{ id: string; name: string }>).map(i => ({ id: i.id, name: i.name }))))
            .catch(() => setSmtp([]));
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!cfg) return <p className="sa-help">{error ?? 'Loading settings…'}</p>;

  const set = <K extends keyof SalesAgentConfig>(key: K, patch: Partial<SalesAgentConfig[K]>) =>
    setCfg({ ...cfg, [key]: { ...(cfg[key] as object), ...patch } });

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { enabled, persona, product, icp, whatsapp, email, schedule } = cfg;
      setCfg(await salesAgentApi.updateConfig({ enabled, persona, product, icp, whatsapp, email, schedule }));
      setNotice('Saved.');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggleApproval = async (requireApproval: boolean) => {
    let confirm: string | undefined;
    if (!requireApproval) {
      confirm =
        window.prompt(
          'Autopilot sends messages without your approval (still within limits, quiet hours and opt-outs). Type "autopilot" to confirm.',
        ) ?? '';
      if (confirm !== 'autopilot') return;
    }
    try {
      setCfg(await salesAgentApi.updateConfig({ requireApproval, confirm }));
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change mode');
    }
  };

  return (
    <section className="sa-panel sa-form">
      <fieldset>
        <legend>Agent</legend>
        <label className="sa-check">
          <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} />
          Run the agent on its own every {cfg.schedule.heartbeatMinutes} minutes
        </label>
        <label className="sa-check">
          <input type="checkbox" checked={cfg.requireApproval} onChange={e => void toggleApproval(e.target.checked)} />
          Every message waits for my approval (recommended)
        </label>
      </fieldset>

      <fieldset>
        <legend>Who the agent is</legend>
        <div className="sa-grid">
          <Text label="Your name" value={cfg.persona.name} onChange={name => set('persona', { name })} />
          <Text label="Company" value={cfg.persona.company} onChange={company => set('persona', { company })} />
          <Text label="Role" value={cfg.persona.role} onChange={role => set('persona', { role })} />
          <Text label="Tone" value={cfg.persona.tone} onChange={tone => set('persona', { tone })} />
          <Text label="Your website" value={cfg.persona.website} onChange={website => set('persona', { website })} />
        </div>
      </fieldset>

      <fieldset>
        <legend>What you sell</legend>
        <div className="sa-grid">
          <Text label="Product name" value={cfg.product.name} onChange={name => set('product', { name })} />
          <Text label="Pricing" value={cfg.product.pricing} onChange={pricing => set('product', { pricing })} />
          <Text label="Goal" value={cfg.product.goal} onChange={goal => set('product', { goal })} />
          <Text label="Booking link" value={cfg.product.bookingUrl} onChange={bookingUrl => set('product', { bookingUrl })} />
        </div>
        <label>
          Description
          <textarea
            className="input"
            rows={3}
            value={cfg.product.description}
            onChange={e => set('product', { description: e.target.value })}
          />
        </label>
        <Text
          label="Key benefits (comma separated)"
          value={csv(cfg.product.benefits)}
          onChange={v => set('product', { benefits: fromCsv(v) })}
        />
      </fieldset>

      <fieldset>
        <legend>Who to target</legend>
        <div className="sa-grid">
          <Text label="Industries" value={csv(cfg.icp.industries)} onChange={v => set('icp', { industries: fromCsv(v) })} />
          <Text label="Buyer titles" value={csv(cfg.icp.titles)} onChange={v => set('icp', { titles: fromCsv(v) })} />
          <Text label="Places" value={csv(cfg.icp.geography)} onChange={v => set('icp', { geography: fromCsv(v) })} />
        </div>
      </fieldset>

      <fieldset>
        <legend>WhatsApp</legend>
        <label className="sa-check">
          <input
            type="checkbox"
            checked={cfg.whatsapp.enabled}
            onChange={e => set('whatsapp', { enabled: e.target.checked })}
          />
          Reach prospects on WhatsApp
        </label>
        <div className="sa-grid">
          <label>
            Send from number
            <select
              className="input"
              value={cfg.whatsapp.sessionId}
              onChange={e => set('whatsapp', { sessionId: e.target.value })}
            >
              <option value="">Choose a session</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </label>
          <Num label="Max messages a day" value={cfg.whatsapp.maxDailySends} onChange={maxDailySends => set('whatsapp', { maxDailySends })} />
          <Text
            label="Country code for local numbers"
            value={cfg.whatsapp.defaultCountryCode}
            onChange={defaultCountryCode => set('whatsapp', { defaultCountryCode })}
          />
          <Text label="Opt-out line" value={cfg.whatsapp.optOutLine} onChange={optOutLine => set('whatsapp', { optOutLine })} />
        </div>
        <p className="sa-help">
          Keep the daily number low (10 to 30) on a new number: many cold messages a day can get a WhatsApp number banned.
        </p>
      </fieldset>

      {channels.includes('email') ? (
        <fieldset>
          <legend>Email</legend>
          <label className="sa-check">
            <input type="checkbox" checked={cfg.email.enabled} onChange={e => set('email', { enabled: e.target.checked })} />
            Reach prospects by email (used when there is no WhatsApp number)
          </label>
          <div className="sa-grid">
            <label>
              SMTP account
              <select
                className="input"
                value={cfg.email.integrationId}
                onChange={e => set('email', { integrationId: e.target.value })}
              >
                <option value="">Choose an email integration</option>
                {smtp.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <Text label="IMAP host (replies)" value={cfg.email.imapHost} onChange={imapHost => set('email', { imapHost })} />
            <Num label="IMAP port" value={cfg.email.imapPort} onChange={imapPort => set('email', { imapPort })} />
            <Num label="Max emails a day" value={cfg.email.maxDailySends} onChange={maxDailySends => set('email', { maxDailySends })} />
            <Text label="Opt-out line" value={cfg.email.optOutLine} onChange={optOutLine => set('email', { optOutLine })} />
            <Text label="Postal address" value={cfg.email.postalAddress} onChange={postalAddress => set('email', { postalAddress })} />
          </div>
          <p className="sa-help">Add the SMTP account under Integrations first. IMAP uses the same login to read replies.</p>
        </fieldset>
      ) : (
        <p className="sa-help">Email is switched off on this server (SALES_AGENT_EMAIL_ENABLED=false).</p>
      )}

      <fieldset>
        <legend>Schedule</legend>
        <div className="sa-grid">
          <Num
            label="Run every (minutes)"
            value={cfg.schedule.heartbeatMinutes}
            onChange={heartbeatMinutes => set('schedule', { heartbeatMinutes })}
          />
          <Text label="Quiet from" value={cfg.schedule.quietStart} onChange={quietStart => set('schedule', { quietStart })} />
          <Text label="Quiet until" value={cfg.schedule.quietEnd} onChange={quietEnd => set('schedule', { quietEnd })} />
          <Text label="Timezone" value={cfg.schedule.timezone} onChange={timezone => set('schedule', { timezone })} />
        </div>
      </fieldset>

      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="sa-notice">{notice}</p>}
      <div>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </section>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {label}
      <input className="input" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label>
      {label}
      <input className="input" type="number" min={0} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}
