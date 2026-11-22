import { useEffect, useState, type CSSProperties } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  aiCallingApi,
  type AiProviderConfig,
  type AiProvidersState,
  type AiSecretName,
} from '../../services/api';
import { useToast } from '../Toast';
import { errorText, panel } from './callMeta';

const KEYS: { name: AiSecretName; label: string }[] = [
  { name: 'SARVAM_API_KEY', label: 'Sarvam (Gujarati/Hindi voice, default)' },
  { name: 'DEEPGRAM_API_KEY', label: 'Deepgram (speech-to-text)' },
  { name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs (text-to-speech)' },
  { name: 'LLM_API_KEY', label: 'Your LLM provider (OpenAI-compatible)' },
  { name: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID (starts with AC)' },
  { name: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token' },
  { name: 'TWILIO_PHONE_NUMBER', label: 'Twilio phone number (with +country code, e.g. +15551234567)' },
];

const field: CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' };
const label: CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 };
const help: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' };

const STATE_TEXT: Record<'saved' | 'environment' | 'missing', string> = {
  saved: 'saved (encrypted)',
  environment: 'set on the server environment',
  missing: 'not set',
};

/**
 * Which engine does each part of an AI call, and the API keys. Changes apply to the next call, no redeploy.
 * Keys are write-only: the page shows only whether each one is set.
 */
export function ProvidersPanel() {
  const toast = useToast();
  const [state, setState] = useState<AiProvidersState | null>(null);
  const [draft, setDraft] = useState<AiProviderConfig | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Partial<Record<AiSecretName, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const s = await aiCallingApi.providers();
      setState(s);
      setDraft(s.config);
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Could not load the provider settings (admin key needed)'));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (error) {
    return (
      <div style={{ ...panel, marginBottom: 20 }}>
        <p style={{ margin: 0, color: '#ef4444' }}>{error}</p>
      </div>
    );
  }
  if (!state || !draft) return null;

  const save = async () => {
    setBusy('config');
    try {
      const next = await aiCallingApi.saveProviders(draft);
      setState(next);
      setDraft(next.config);
      toast.addToast({ type: 'success', title: 'Engine choices saved. The next call uses them.' });
    } catch (err) {
      toast.addToast({ type: 'error', title: errorText(err, 'Save failed') });
    } finally {
      setBusy(null);
    }
  };

  const saveKey = async (name: AiSecretName, value: string | null) => {
    setBusy(name);
    try {
      const next = await aiCallingApi.saveSecret(name, value);
      setState(next);
      setKeyDrafts(d => ({ ...d, [name]: '' }));
      toast.addToast({ type: 'success', title: value ? 'Key saved' : 'Saved key removed' });
    } catch (err) {
      toast.addToast({ type: 'error', title: errorText(err, 'Could not save the key') });
    } finally {
      setBusy(null);
    }
  };

  const ttsRow = (name: 'ttsGujarati' | 'ttsHindi' | 'ttsEnglish', text: string) => (
    <div key={name}>
      <label style={label}>Voice for {text}</label>
      <select
        style={field}
        value={draft[name]}
        onChange={e => setDraft({ ...draft, [name]: e.target.value as 'sarvam' | 'elevenlabs' })}
      >
        <option value="sarvam">Sarvam (proven for Gujarati and Hindi)</option>
        <option value="elevenlabs">ElevenLabs</option>
      </select>
    </div>
  );

  return (
    <div style={{ ...panel, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Engines and API keys</h3>
        <p style={help}>
          Change an engine here and the next call uses it: no redeploy. Keep Sarvam for Gujarati unless you have
          tested the alternative on a real call. Keys are stored encrypted and never shown again.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div>
          <label style={label}>Speech-to-text (what the customer says)</label>
          <select
            style={field}
            value={draft.stt}
            onChange={e => setDraft({ ...draft, stt: e.target.value as 'sarvam' | 'deepgram' })}
          >
            <option value="sarvam">Sarvam (default)</option>
            <option value="deepgram">Deepgram nova-3 (Gujarati and Hindi)</option>
          </select>
        </div>
        {ttsRow('ttsGujarati', 'Gujarati')}
        {ttsRow('ttsHindi', 'Hindi')}
        {ttsRow('ttsEnglish', 'English')}
        <div>
          <label style={label}>ElevenLabs voice id</label>
          <input style={field} value={draft.elevenVoiceId} onChange={e => setDraft({ ...draft, elevenVoiceId: e.target.value })} />
        </div>
        <div>
          <label style={label}>ElevenLabs model</label>
          <input style={field} value={draft.elevenModel} onChange={e => setDraft({ ...draft, elevenModel: e.target.value })} />
          <p style={help}>Gujarati is only in the v3/v4 family; multilingual_v2 covers Hindi.</p>
        </div>
        <div>
          <label style={label}>Language model</label>
          <select
            style={field}
            value={draft.llm}
            onChange={e => setDraft({ ...draft, llm: e.target.value as 'groq' | 'openai-compatible' })}
          >
            <option value="groq">Groq (default)</option>
            <option value="openai-compatible">OpenAI-compatible endpoint</option>
          </select>
        </div>
        {draft.llm === 'openai-compatible' && (
          <>
            <div>
              <label style={label}>LLM base address</label>
              <input
                style={field}
                placeholder="https://api.openai.com/v1"
                value={draft.llmBaseUrl}
                onChange={e => setDraft({ ...draft, llmBaseUrl: e.target.value })}
              />
            </div>
            <div>
              <label style={label}>LLM model</label>
              <input style={field} value={draft.llmModel} onChange={e => setDraft({ ...draft, llmModel: e.target.value })} />
            </div>
          </>
        )}
      </div>

      <div>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy === 'config'}>
          {busy === 'config' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save engine choices
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>API keys and phone account</h4>
        {KEYS.map(k => (
          <div key={k.name} style={{ display: 'grid', gap: 4 }}>
            <label style={label}>
              {k.label} <span style={help}>({STATE_TEXT[state.secrets[k.name]]})</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                autoComplete="off"
                style={{ ...field, flex: 1 }}
                placeholder={state.secrets[k.name] === 'saved' ? 'Enter a new key to replace it' : 'Paste key'}
                value={keyDrafts[k.name] ?? ''}
                onChange={e => setKeyDrafts(d => ({ ...d, [k.name]: e.target.value }))}
              />
              <button
                className="btn btn-secondary"
                disabled={!keyDrafts[k.name]?.trim() || busy === k.name}
                onClick={() => void saveKey(k.name, keyDrafts[k.name] ?? '')}
              >
                Save key
              </button>
              {state.secrets[k.name] === 'saved' && (
                <button className="btn btn-secondary" disabled={busy === k.name} onClick={() => void saveKey(k.name, null)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        <p style={help}>
          Keys are encrypted with the server&apos;s GOOGLE_TOKEN_ENCRYPTION_KEY. If that key is missing, saving a key
          fails with a clear message. Twilio values are used for calls right after you save them: no redeploy needed.
        </p>
      </div>
    </div>
  );
}
