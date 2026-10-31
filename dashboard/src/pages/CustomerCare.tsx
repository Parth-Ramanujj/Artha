import { useCallback, useEffect, useState } from 'react';
import { Save, PhoneMissed } from 'lucide-react';
import { aiCallingApi, customerCareApi, API_BASE_URL } from '../services/api';
import type { CustomerCareSettings, MissedCallRow, VoiceAgent } from '../services/api';
import { useSessionsQuery } from '../hooks/queries';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import './SalesAgent.css';

const STATUS_TEXT: Record<MissedCallRow['status'], string> = {
  new: 'New',
  messaged: 'WhatsApp sent, waiting for reply',
  replied: 'Replied on WhatsApp',
  called: 'AI call queued',
  skipped: 'Skipped',
  failed: 'Failed',
};

export function CustomerCare() {
  useDocumentTitle('Missed Calls & Assistant');
  const sessions = useSessionsQuery().data ?? [];
  const [cfg, setCfg] = useState<CustomerCareSettings | null>(null);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [rows, setRows] = useState<MissedCallRow[]>([]);
  const [testPhone, setTestPhone] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    customerCareApi
      .missedCalls()
      .then(setRows)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    customerCareApi
      .settings()
      .then(setCfg)
      .catch(e => setError(String(e instanceof Error ? e.message : e)));
    aiCallingApi
      .agents()
      .then(setAgents)
      .catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!cfg) return <p className="sa-help">{error ?? 'Loading…'}</p>;

  const setMissed = (p: Partial<CustomerCareSettings['missedCall']>) =>
    setCfg({ ...cfg, missedCall: { ...cfg.missedCall, ...p } });
  const setAssistant = (p: Partial<CustomerCareSettings['assistant']>) =>
    setCfg({ ...cfg, assistant: { ...cfg.assistant, ...p } });

  const save = async () => {
    setError(null);
    try {
      // Only the editable fields: the API rejects unknown ones such as id or createdAt.
      const { ownerName, missedCall, assistant } = cfg;
      setCfg(await customerCareApi.saveSettings({ ownerName, missedCall, assistant }));
      setNotice('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const test = async () => {
    setError(null);
    try {
      const row = await customerCareApi.reportMissedCall(testPhone);
      setNotice(`Test missed call: ${STATUS_TEXT[row.status]}${row.error ? ` (${row.error})` : ''}`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const sessionSelect = (value: string, onChange: (v: string) => void, anyLabel: string) => (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{anyLabel}</option>
      {sessions.map(s => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.status})
        </option>
      ))}
    </select>
  );

  return (
    <div className="sa-page">
      <PageHeader title="Missed Calls & Assistant" icon={<PhoneMissed size={24} />} />
      {error && <p className="sa-error">{error}</p>}
      {notice && <p className="sa-notice">{notice}</p>}

      <section className="sa-panel sa-form">
        <fieldset>
          <legend>You</legend>
          <label>
            Your name or business name (the AI speaks on your behalf: {'{owner}'})
            <input
              className="input"
              value={cfg.ownerName}
              onChange={e => setCfg({ ...cfg, ownerName: e.target.value })}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Missed call → WhatsApp → AI call</legend>
          <label className="sa-check">
            <input
              type="checkbox"
              checked={cfg.missedCall.enabled}
              onChange={e => setMissed({ enabled: e.target.checked })}
            />
            Send a WhatsApp message when I miss a call
          </label>
          <label className="sa-check">
            <input
              type="checkbox"
              checked={cfg.missedCall.includeWhatsappCalls}
              onChange={e => setMissed({ includeWhatsappCalls: e.target.checked })}
            />
            Also for missed WhatsApp calls
          </label>
          <div className="sa-grid">
            <label>
              Send from number
              {sessionSelect(cfg.missedCall.sessionId, sessionId => setMissed({ sessionId }), 'Any connected number')}
            </label>
          </div>
          <label>
            WhatsApp message ({'{name}'} and {'{owner}'} are filled in)
            <textarea
              className="input"
              rows={3}
              value={cfg.missedCall.message}
              onChange={e => setMissed({ message: e.target.value })}
            />
          </label>
          <label className="sa-check">
            <input
              type="checkbox"
              checked={cfg.missedCall.callOnNoReply}
              onChange={e => setMissed({ callOnNoReply: e.target.checked })}
            />
            If they do not reply on WhatsApp, the AI calls them
          </label>
          <div className="sa-grid">
            <label>
              Wait for a reply (minutes)
              <input
                className="input"
                type="number"
                min={1}
                value={cfg.missedCall.waitMinutes}
                onChange={e => setMissed({ waitMinutes: Number(e.target.value) })}
              />
            </label>
            <label>
              Voice agent
              <select
                className="input"
                value={cfg.missedCall.voiceAgentId}
                onChange={e => setMissed({ voiceAgentId: e.target.value })}
              >
                <option value="">Default agent</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            What the AI says first on the call
            <textarea
              className="input"
              rows={2}
              value={cfg.missedCall.callGreeting}
              onChange={e => setMissed({ callGreeting: e.target.value })}
            />
          </label>
          <p className="sa-help">
            Phone call log: have your Android phone (a call-log app, or MacroDroid/Tasker "Missed call" trigger) send
            <code> POST {API_BASE_URL}/customer-care/missed-calls </code> with header <code>X-API-Key</code> and body{' '}
            <code>{'{"phone":"<caller number>"}'}</code>. AI calls use the AI Calling setup (Twilio + public URL).
          </p>
        </fieldset>

        <fieldset>
          <legend>WhatsApp → AI assistant link</legend>
          <label className="sa-check">
            <input
              type="checkbox"
              checked={cfg.assistant.enabled}
              onChange={e => setAssistant({ enabled: e.target.checked })}
            />
            When someone messages on WhatsApp, offer a link to chat with the AI assistant
          </label>
          <div className="sa-grid">
            <label>
              Only on number
              {sessionSelect(cfg.assistant.sessionId, sessionId => setAssistant({ sessionId }), 'All numbers')}
            </label>
            <label>
              Offer again after (hours)
              <input
                className="input"
                type="number"
                min={1}
                value={cfg.assistant.cooldownHours}
                onChange={e => setAssistant({ cooldownHours: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            Offer message (the link is added below it)
            <textarea
              className="input"
              rows={3}
              value={cfg.assistant.message}
              onChange={e => setAssistant({ message: e.target.value })}
            />
          </label>
          <label>
            Extra instructions for the assistant
            <textarea
              className="input"
              rows={3}
              value={cfg.assistant.instructions}
              onChange={e => setAssistant({ instructions: e.target.value })}
            />
          </label>
          <p className="sa-help">
            The assistant knows the customer's number, the number they wrote to, their recent WhatsApp chat, lead
            details, last AI call summary and your AI knowledge base. Links use the public URL from AI Calling setup.
          </p>
        </fieldset>

        <button className="btn btn-primary" onClick={() => void save()}>
          <Save size={16} /> Save
        </button>
      </section>

      <section className="sa-panel">
        <h3>Recent missed calls</h3>
        <div className="sa-grid">
          <input
            className="input"
            placeholder="Test with a number"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
          />
          <button className="btn" disabled={!testPhone.trim()} onClick={() => void test()}>
            Simulate missed call
          </button>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Number</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    {r.phone}
                    {r.name ? ` (${r.name})` : ''}
                  </td>
                  <td>{r.source === 'whatsapp' ? 'WhatsApp' : 'Phone'}</td>
                  <td title={r.error ?? undefined}>
                    {STATUS_TEXT[r.status]}
                    {r.error ? ` — ${r.error}` : ''}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4}>No missed calls yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
