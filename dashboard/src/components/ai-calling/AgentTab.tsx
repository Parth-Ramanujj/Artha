import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Save } from 'lucide-react';
import { aiCallingApi, type VoiceAgent } from '../../services/api';
import { useToast } from '../Toast';
import { errorText, label, panel } from './callMeta';

const GUJARATI_VOICES = [
  ['pooja_gu_customer', 'Pooja — customer care (female)'],
  ['pooja_gu_conversational', 'Pooja — conversational (female)'],
  ['bhavik_gu_conversation', 'Bhavik — conversational (male)'],
];
const HINDI_VOICES = [
  ['ritu_hi_customer_warm', 'Ritu — warm customer care (female)'],
  ['ritu_hi_customer', 'Ritu — customer care (female)'],
  ['aparna_hi_customer', 'Aparna — customer care (female)'],
  ['aarti_hi_customer', 'Aarti — customer care (female)'],
  ['shubh_hi_customer', 'Shubh — customer care (male)'],
  ['amit_hi_conversational', 'Amit — conversational (male)'],
];

function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div style={label}>{title}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// The server rejects unknown fields, so only these are sent (never ids or timestamps).
const EDITABLE: (keyof VoiceAgent)[] = [
  'name',
  'personaName',
  'companyName',
  'greeting',
  'script',
  'verifiedLeadCriteria',
  'defaultLanguage',
  'gujaratiVoice',
  'hindiVoice',
  'pace',
  'maxCallSeconds',
  'concurrency',
  'maxAttempts',
  'retryAfterMinutes',
  'callingStart',
  'callingEnd',
  'callingTimezone',
  'whatsappFollowup',
  'whatsappMessage',
];

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 } as const;
const full = { width: '100%' } as const;

/** How the agent introduces itself, what it is after, and when and how it calls. */
export function AgentTab({ agent, onSaved }: { agent: VoiceAgent; onSaved: (a: VoiceAgent) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<VoiceAgent>(agent);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(agent), [agent]);

  const set = <K extends keyof VoiceAgent>(key: K, value: VoiceAgent[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(agent);

  const save = async () => {
    setSaving(true);
    try {
      const change = Object.fromEntries(EDITABLE.map(key => [key, form[key]])) as Partial<VoiceAgent>;
      const saved = await aiCallingApi.updateAgent(form.id, change);
      onSaved(saved);
      toast.success('Agent saved');
    } catch (err) {
      toast.error(errorText(err, 'Could not save the agent'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={panel}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Who is calling</div>
        <div style={grid}>
          <Field title="Agent's name on the call" hint="Write it in Gujarati for natural pronunciation, e.g. પૂજા">
            <input
              className="input"
              style={full}
              value={form.personaName}
              onChange={e => set('personaName', e.target.value)}
            />
          </Field>
          <Field title="Company name">
            <input
              className="input"
              style={full}
              value={form.companyName}
              onChange={e => set('companyName', e.target.value)}
            />
          </Field>
          <Field title="Opening language" hint="The agent switches to Hindi by itself if the customer speaks Hindi">
            <select
              className="input"
              style={full}
              value={form.defaultLanguage}
              onChange={e => set('defaultLanguage', e.target.value as VoiceAgent['defaultLanguage'])}
            >
              <option value="gu-IN">Gujarati</option>
              <option value="hi-IN">Hindi</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field
            title="First sentence of every call"
            hint="{name}, {persona} and {company} are filled in automatically"
          >
            <textarea
              className="input"
              rows={3}
              style={full}
              value={form.greeting}
              onChange={e => set('greeting', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={panel}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>What the agent should do</div>
        <Field
          title="Script and knowledge"
          hint="Describe your business, the goal of the call and what to find out. Plain language works best."
        >
          <textarea
            className="input"
            rows={10}
            style={full}
            value={form.script}
            onChange={e => set('script', e.target.value)}
          />
        </Field>
        <div style={{ marginTop: 14 }}>
          <Field title="When is a call a verified lead?">
            <textarea
              className="input"
              rows={3}
              style={full}
              value={form.verifiedLeadCriteria}
              onChange={e => set('verifiedLeadCriteria', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={panel}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Voice</div>
        <div style={grid}>
          <Field title="Gujarati voice">
            <select
              className="input"
              style={full}
              value={form.gujaratiVoice}
              onChange={e => set('gujaratiVoice', e.target.value)}
            >
              {GUJARATI_VOICES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field title="Hindi voice">
            <select
              className="input"
              style={full}
              value={form.hindiVoice}
              onChange={e => set('hindiVoice', e.target.value)}
            >
              {HINDI_VOICES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field title={`Speaking speed: ${form.pace.toFixed(2)}×`}>
            <input
              type="range"
              min={0.8}
              max={1.3}
              step={0.05}
              value={form.pace}
              onChange={e => set('pace', Number(e.target.value))}
              style={full}
            />
          </Field>
        </div>
      </div>

      <div style={panel}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Calling rules</div>
        <div style={grid}>
          <Field title="Call between" hint={form.callingTimezone}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="time"
                className="input"
                value={form.callingStart}
                onChange={e => set('callingStart', e.target.value)}
              />
              <span>and</span>
              <input
                type="time"
                className="input"
                value={form.callingEnd}
                onChange={e => set('callingEnd', e.target.value)}
              />
            </div>
          </Field>
          <Field title="Calls at the same time" hint="Twilio trial accounts allow 1">
            <input
              type="number"
              min={1}
              max={10}
              className="input"
              style={full}
              value={form.concurrency}
              onChange={e => set('concurrency', Number(e.target.value))}
            />
          </Field>
          <Field
            title="Tries per number"
            hint={`Unanswered or busy calls are retried after ${form.retryAfterMinutes} minutes`}
          >
            <input
              type="number"
              min={1}
              max={5}
              className="input"
              style={full}
              value={form.maxAttempts}
              onChange={e => set('maxAttempts', Number(e.target.value))}
            />
          </Field>
          <Field title="Longest call (minutes)">
            <input
              type="number"
              min={1}
              max={15}
              className="input"
              style={full}
              value={Math.round(form.maxCallSeconds / 60)}
              onChange={e => set('maxCallSeconds', Number(e.target.value) * 60)}
            />
          </Field>
        </div>
      </div>

      <div style={panel}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>WhatsApp follow-up for verified leads</div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={form.whatsappFollowup}
            onChange={e => set('whatsappFollowup', e.target.checked)}
          />
          Send automatically after every verified call (you can also turn it on per call list)
        </label>
        <Field
          title="Message"
          hint="{name}, {persona} and {company} are filled in. Contacts who opted out (DND) never get it."
        >
          <textarea
            className="input"
            rows={3}
            style={full}
            value={form.whatsappMessage ?? ''}
            onChange={e => set('whatsappMessage', e.target.value)}
          />
        </Field>
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '10px 0', background: 'var(--bg-primary)' }}>
        <button className="btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{' '}
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
