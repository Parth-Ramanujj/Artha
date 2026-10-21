import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2, Save } from 'lucide-react';
import { aiCallingApi, sessionApi, type Session, type VoiceAgent } from '../../services/api';
import { useToast } from '../Toast';
import { errorText, label, panel } from './callMeta';

// Voice labels live in the locale files under aiCalling.agent.voices.<id>.
const GUJARATI_VOICES = ['pooja_gu_customer', 'pooja_gu_conversational', 'bhavik_gu_conversation'];
const HINDI_VOICES = [
  'ritu_hi_customer_warm',
  'ritu_hi_customer',
  'aparna_hi_customer',
  'aarti_hi_customer',
  'shubh_hi_customer',
  'amit_hi_conversational',
];

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'Asia/Singapore'];

/** Voice options, plus the saved one if it is not in the list, so it is never silently replaced. */
function voiceOptions(list: string[], current: string, t: TFunction) {
  const all = list.includes(current) || !current ? list : [...list, current];
  return all.map(id => (
    <option key={id} value={id}>
      {t(`aiCalling.agent.voices.${id}`, id)}
    </option>
  ));
}

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
  'model',
  'maxCallSeconds',
  'concurrency',
  'maxAttempts',
  'retryAfterMinutes',
  'callingStart',
  'callingEnd',
  'callingTimezone',
  'whatsappFollowup',
  'whatsappMessage',
  'whatsappSessionId',
];

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 } as const;
const full = { width: '100%' } as const;

/** How the agent introduces itself, what it is after, and when and how it calls. */
export function AgentTab({ agent, onSaved }: { agent: VoiceAgent; onSaved: (a: VoiceAgent) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<VoiceAgent>(agent);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => setForm(agent), [agent]);
  useEffect(() => {
    sessionApi
      .list()
      .then(setSessions)
      .catch(() => undefined);
  }, []);

  const set = <K extends keyof VoiceAgent>(key: K, value: VoiceAgent[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(agent);
  const timeError = form.callingStart === form.callingEnd ? t('aiCalling.agent.timeError') : null;

  const save = async () => {
    if (timeError) return;
    setSaving(true);
    try {
      const change = Object.fromEntries(EDITABLE.map(key => [key, form[key]])) as Partial<VoiceAgent>;
      const saved = await aiCallingApi.updateAgent(form.id, change);
      onSaved(saved);
      toast.success(t('aiCalling.agent.saved'));
    } catch (err) {
      toast.error(errorText(err, t('aiCalling.agent.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={panel}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{t('aiCalling.agent.who')}</div>
        <div style={grid}>
          <Field title={t('aiCalling.agent.name')} hint={t('aiCalling.agent.nameHint')}>
            <input className="input" style={full} value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field title={t('aiCalling.agent.persona')} hint={t('aiCalling.agent.personaHint')}>
            <input
              className="input"
              style={full}
              value={form.personaName}
              onChange={e => set('personaName', e.target.value)}
            />
          </Field>
          <Field title={t('aiCalling.agent.company')}>
            <input
              className="input"
              style={full}
              value={form.companyName}
              onChange={e => set('companyName', e.target.value)}
            />
          </Field>
          <Field title={t('aiCalling.agent.language')} hint={t('aiCalling.agent.languageHint')}>
            <select
              className="input"
              style={full}
              value={form.defaultLanguage}
              onChange={e => set('defaultLanguage', e.target.value as VoiceAgent['defaultLanguage'])}
            >
              <option value="gu-IN">{t('aiCalling.language.gu')}</option>
              <option value="hi-IN">{t('aiCalling.language.hi')}</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field title={t('aiCalling.agent.greeting')} hint={t('aiCalling.agent.greetingHint')}>
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
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{t('aiCalling.agent.what')}</div>
        <Field title={t('aiCalling.agent.script')} hint={t('aiCalling.agent.scriptHint')}>
          <textarea
            className="input"
            rows={10}
            style={full}
            value={form.script}
            onChange={e => set('script', e.target.value)}
          />
        </Field>
        <div style={{ marginTop: 14 }}>
          <Field title={t('aiCalling.agent.criteria')}>
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
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{t('aiCalling.agent.voice')}</div>
        <div style={grid}>
          <Field title={t('aiCalling.agent.gujaratiVoice')}>
            <select
              className="input"
              style={full}
              value={form.gujaratiVoice}
              onChange={e => set('gujaratiVoice', e.target.value)}
            >
              {voiceOptions(GUJARATI_VOICES, form.gujaratiVoice, t)}
            </select>
          </Field>
          <Field title={t('aiCalling.agent.hindiVoice')}>
            <select
              className="input"
              style={full}
              value={form.hindiVoice}
              onChange={e => set('hindiVoice', e.target.value)}
            >
              {voiceOptions(HINDI_VOICES, form.hindiVoice, t)}
            </select>
          </Field>
          <Field title={t('aiCalling.agent.pace', { pace: form.pace.toFixed(2) })}>
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
          <Field title={t('aiCalling.agent.model')} hint={t('aiCalling.agent.modelHint')}>
            <input
              className="input"
              style={full}
              value={form.model}
              placeholder="openai/gpt-oss-120b"
              onChange={e => set('model', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div style={panel}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{t('aiCalling.agent.rules')}</div>
        <div style={grid}>
          <Field title={t('aiCalling.agent.callBetween')}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="time"
                className="input"
                value={form.callingStart}
                onChange={e => set('callingStart', e.target.value)}
              />
              <span>{t('aiCalling.agent.and')}</span>
              <input
                type="time"
                className="input"
                value={form.callingEnd}
                onChange={e => set('callingEnd', e.target.value)}
              />
            </div>
            {timeError && (
              <div role="alert" style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                {timeError}
              </div>
            )}
          </Field>
          <Field title={t('aiCalling.agent.timezone')} hint={t('aiCalling.agent.timezoneHint')}>
            <input
              className="input"
              style={full}
              list="ai-calling-timezones"
              value={form.callingTimezone}
              onChange={e => set('callingTimezone', e.target.value)}
            />
            <datalist id="ai-calling-timezones">
              {TIMEZONES.map(zone => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </Field>
          <Field title={t('aiCalling.agent.concurrency')} hint={t('aiCalling.agent.concurrencyHint')}>
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
            title={t('aiCalling.agent.attempts')}
            hint={t('aiCalling.agent.attemptsHint', { minutes: form.retryAfterMinutes })}
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
          <Field title={t('aiCalling.agent.retryAfter')} hint={t('aiCalling.agent.retryAfterHint')}>
            <input
              type="number"
              min={5}
              max={1440}
              className="input"
              style={full}
              value={form.retryAfterMinutes}
              onChange={e => set('retryAfterMinutes', Number(e.target.value))}
            />
          </Field>
          <Field title={t('aiCalling.agent.maxCall')}>
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
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{t('aiCalling.agent.whatsapp')}</div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={form.whatsappFollowup}
            onChange={e => set('whatsappFollowup', e.target.checked)}
          />
          {t('aiCalling.agent.whatsappAuto')}
        </label>
        {(form.whatsappFollowup || form.whatsappSessionId) && (
          <div style={{ marginBottom: 12, maxWidth: 360 }}>
            <Field title={t('aiCalling.agent.sendFrom')}>
              <select
                className="input"
                style={full}
                value={form.whatsappSessionId ?? ''}
                onChange={e => set('whatsappSessionId', e.target.value || null)}
              >
                <option value="">{t('aiCalling.agent.firstConnected')}</option>
                {form.whatsappSessionId && !sessions.some(s => s.id === form.whatsappSessionId) && (
                  <option value={form.whatsappSessionId}>{form.whatsappSessionId}</option>
                )}
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.phone ? ` (${s.phone})` : ''}
                    {s.status !== 'ready' ? ` — ${t('aiCalling.agent.notConnected')}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field title={t('aiCalling.agent.message')} hint={t('aiCalling.agent.messageHint')}>
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
        <button className="btn-primary" onClick={() => void save()} disabled={saving || !dirty || !!timeError}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{' '}
          {dirty ? t('aiCalling.agent.saveChanges') : t('aiCalling.agent.savedState')}
        </button>
      </div>
    </div>
  );
}
