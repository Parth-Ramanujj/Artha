import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Cpu,
  Globe,
  Key,
  Loader2,
  Mic,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  aiCallingApi,
  type AiCallingSetup,
  type AiProviderConfig,
  type AiProvidersState,
  type AiSecretName,
} from '../../services/api';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../Toast';
import { errorText, panel } from './callMeta';

const KEYS_META: { name: AiSecretName; label: string; group: 'voice' | 'llm' | 'twilio' }[] = [
  { name: 'SARVAM_API_KEY', label: 'Sarvam API Key (Speech & Voice)', group: 'voice' },
  { name: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key (Speech-to-Text)', group: 'voice' },
  { name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key (TTS Voice)', group: 'voice' },
  { name: 'LLM_API_KEY', label: 'Custom LLM API Key (OpenAI-compatible)', group: 'llm' },
  { name: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID (starts with AC)', group: 'twilio' },
  { name: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token', group: 'twilio' },
  { name: 'TWILIO_PHONE_NUMBER', label: 'Twilio Phone Number (+CountryCode)', group: 'twilio' },
];

const STATE_BADGE: Record<'saved' | 'environment' | 'missing', { label: string; color: string; bg: string }> = {
  saved: { label: 'Configured (Encrypted in DB)', color: '#22c55e', bg: '#22c55e1a' },
  environment: { label: 'Set in Environment (.env)', color: '#3b82f6', bg: '#3b82f61a' },
  missing: { label: 'Missing', color: '#ef4444', bg: '#ef44441a' },
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 13,
};

const labelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  display: 'block',
  marginBottom: 5,
  color: 'var(--text-primary)',
};

/**
 * Unified, user-friendly AI Calling Setup, Engines, and Credentials panel.
 * When ready, it displays a sleek 44px summary bar that can be expanded to adjust settings anytime.
 * Eliminates duplicate key inputs, raw .env pasting confusion, and screen clutter.
 */
export function SetupPanel({ setup, onChanged }: { setup: AiCallingSetup; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAdmin } = useRole();

  // Collapsed by default if everything is ready for phone calls; open if setup is needed
  const [open, setOpen] = useState(!setup.readyForPhoneCalls);
  const [activeTab, setActiveTab] = useState<'engines' | 'keys' | 'tunnel'>('engines');

  // Providers & Config state
  const [providers, setProviders] = useState<AiProvidersState | null>(null);
  const [draft, setDraft] = useState<AiProviderConfig | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Partial<Record<AiSecretName, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Public tunnel URL state
  const [url, setUrl] = useState(setup.publicUrl ?? setup.suggestedPublicUrl ?? '');
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => {
    setUrl(setup.publicUrl ?? setup.suggestedPublicUrl ?? '');
  }, [setup.publicUrl, setup.suggestedPublicUrl]);

  useEffect(() => {
    if (!setup.readyForPhoneCalls) setOpen(true);
  }, [setup.readyForPhoneCalls]);

  const loadProviders = async () => {
    try {
      const res = await aiCallingApi.providers();
      setProviders(res);
      setDraft(res.config);
    } catch {
      // Ignored for non-admin or fallback
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  const saveEngines = async () => {
    if (!draft) return;
    setBusy('engines');
    try {
      const next = await aiCallingApi.saveProviders(draft);
      setProviders(next);
      setDraft(next.config);
      toast.success('AI engine choices saved for next calls');
      onChanged();
    } catch (err) {
      toast.error(errorText(err, 'Failed to save engine choices'));
    } finally {
      setBusy(null);
    }
  };

  const saveKey = async (name: AiSecretName, value: string | null) => {
    setBusy(name);
    try {
      const next = await aiCallingApi.saveSecret(name, value);
      setProviders(prev => (prev ? { ...prev, ...next } : next));
      setKeyDrafts(d => ({ ...d, [name]: '' }));
      toast.success(value ? 'API key saved securely' : 'API key removed');
      onChanged();
      void loadProviders();
    } catch (err) {
      toast.error(errorText(err, 'Could not save the key'));
    } finally {
      setBusy(null);
    }
  };

  const savePublicUrl = async () => {
    setSavingUrl(true);
    try {
      await aiCallingApi.setPublicUrl(url.trim());
      toast.success(t('aiCalling.setup.saved', 'Server public address saved'));
      onChanged();
    } catch (err) {
      toast.error(errorText(err, t('aiCalling.setup.saveFailed', 'Could not save address')));
    } finally {
      setSavingUrl(false);
    }
  };

  const usesElevenLabs =
    draft?.ttsGujarati === 'elevenlabs' ||
    draft?.ttsHindi === 'elevenlabs' ||
    draft?.ttsEnglish === 'elevenlabs';

  const usesCustomLlm = draft?.llm === 'openai-compatible';

  // Summary labels for compact bar
  const sttSummary = draft?.stt === 'deepgram' ? 'Deepgram' : 'Sarvam';
  const ttsGuSummary = draft?.ttsGujarati === 'elevenlabs' ? 'ElevenLabs' : 'Sarvam';
  const llmSummary = draft?.llm === 'openai-compatible' ? 'Custom LLM' : 'Groq';

  // ── Sleek Compact Bar when Ready and Collapsed ──
  if (setup.readyForPhoneCalls && !open) {
    return (
      <div
        style={{
          ...panel,
          padding: '10px 16px',
          marginBottom: 18,
          borderColor: '#22c55e66',
          display: 'flex',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#22c55e',
              fontWeight: 700,
              fontSize: 13.5,
            }}
          >
            <CheckCircle2 size={17} color="#22c55e" />
            AI Calling & Phone Lines Ready
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              STT: {sttSummary}
            </span>
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              Voice: {ttsGuSummary}
            </span>
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              LLM: {llmSummary}
            </span>
            {setup.twilioAccountType && (
              <span
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                Twilio: {setup.twilioAccountType}
              </span>
            )}
          </div>
        </div>

        <button
          className="btn-secondary"
          onClick={() => setOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '5px 12px' }}
        >
          <Settings2 size={14} /> Configure Engines & Keys <ChevronDown size={14} />
        </button>
      </div>
    );
  }

  // ── Expanded Setup & Configuration Panel ──
  return (
    <div
      style={{
        ...panel,
        marginBottom: 20,
        borderColor: setup.readyForPhoneCalls ? '#22c55e66' : '#f59e0b88',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Top Header & Collapse Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {setup.readyForPhoneCalls ? (
              <CheckCircle2 size={18} color="#22c55e" />
            ) : (
              <AlertTriangle size={18} color="#f59e0b" />
            )}
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {setup.readyForPhoneCalls
                ? 'AI Engines, API Keys & Telephony'
                : 'AI Calling Setup & Configuration'}
            </h3>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Choose speech and AI engines, save encrypted API keys, and configure your phone line without redeploying.
          </p>
        </div>

        {setup.readyForPhoneCalls && (
          <button
            className="btn-secondary"
            onClick={() => setOpen(false)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
          >
            <ChevronUp size={14} /> Collapse
          </button>
        )}
      </div>

      {/* Setup Readiness Warning Banner (if incomplete) */}
      {!setup.readyForPhoneCalls && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: '#f59e0b18',
            border: '1px solid #f59e0b55',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}
        >
          <CircleAlert size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <b>Action needed before placing real phone calls:</b> Ensure Sarvam API key is configured, Twilio
            credentials are saved, and the public webhook URL is reachable.
          </div>
        </div>
      )}

      {/* Sub-tabs: Engines, API Keys, Public URL */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setActiveTab('engines')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: activeTab === 'engines' ? 700 : 500,
            border: `1px solid ${activeTab === 'engines' ? 'var(--primary)' : 'var(--border)'}`,
            background: activeTab === 'engines' ? 'var(--primary)' : 'var(--bg-primary)',
            color: activeTab === 'engines' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Cpu size={14} /> Voice & Speech Engines
        </button>

        <button
          onClick={() => setActiveTab('keys')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: activeTab === 'keys' ? 700 : 500,
            border: `1px solid ${activeTab === 'keys' ? 'var(--primary)' : 'var(--border)'}`,
            background: activeTab === 'keys' ? 'var(--primary)' : 'var(--bg-primary)',
            color: activeTab === 'keys' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Key size={14} /> API Keys & Credentials
        </button>

        <button
          onClick={() => setActiveTab('tunnel')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: activeTab === 'tunnel' ? 700 : 500,
            border: `1px solid ${activeTab === 'tunnel' ? 'var(--primary)' : 'var(--border)'}`,
            background: activeTab === 'tunnel' ? 'var(--primary)' : 'var(--bg-primary)',
            color: activeTab === 'tunnel' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Globe size={14} /> Public Webhook URL
        </button>
      </div>

      {/* ── TAB 1: Voice & Speech Engines ── */}
      {activeTab === 'engines' && draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {/* STT Engine */}
            <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
              <label style={labelStyle}>
                <Mic size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Speech-to-Text (Customer Audio)
              </label>
              <select
                style={inputStyle}
                value={draft.stt}
                onChange={e => setDraft({ ...draft, stt: e.target.value as 'sarvam' | 'deepgram' })}
              >
                <option value="sarvam">Sarvam (Proven for Gujarati & Hindi)</option>
                <option value="deepgram">Deepgram nova-3 (Multilingual)</option>
              </select>
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Sarvam is proven for Indian accents. Deepgram requires DEEPGRAM_API_KEY.
              </p>
            </div>

            {/* Gujarati Voice */}
            <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
              <label style={labelStyle}>
                <Volume2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Voice for Gujarati
              </label>
              <select
                style={inputStyle}
                value={draft.ttsGujarati}
                onChange={e => setDraft({ ...draft, ttsGujarati: e.target.value as 'sarvam' | 'elevenlabs' })}
              >
                <option value="sarvam">Sarvam Bulbul (Proven natural Gujarati)</option>
                <option value="elevenlabs">ElevenLabs (Custom cloned voice)</option>
              </select>
            </div>

            {/* Hindi Voice */}
            <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
              <label style={labelStyle}>
                <Volume2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Voice for Hindi
              </label>
              <select
                style={inputStyle}
                value={draft.ttsHindi}
                onChange={e => setDraft({ ...draft, ttsHindi: e.target.value as 'sarvam' | 'elevenlabs' })}
              >
                <option value="sarvam">Sarvam Bulbul (Default)</option>
                <option value="elevenlabs">ElevenLabs (Custom cloned voice)</option>
              </select>
            </div>

            {/* English Voice */}
            <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
              <label style={labelStyle}>
                <Volume2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Voice for English
              </label>
              <select
                style={inputStyle}
                value={draft.ttsEnglish}
                onChange={e => setDraft({ ...draft, ttsEnglish: e.target.value as 'sarvam' | 'elevenlabs' })}
              >
                <option value="sarvam">Sarvam Bulbul (Default)</option>
                <option value="elevenlabs">ElevenLabs (Custom cloned voice)</option>
              </select>
            </div>

            {/* Language Model (LLM) */}
            <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
              <label style={labelStyle}>
                <Sparkles size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Conversational Language Model (LLM)
              </label>
              <select
                style={inputStyle}
                value={draft.llm}
                onChange={e => setDraft({ ...draft, llm: e.target.value as 'groq' | 'openai-compatible' })}
              >
                <option value="groq">Groq (Ultra-low latency streaming, Default)</option>
                <option value="openai-compatible">Custom OpenAI-compatible Endpoint</option>
              </select>
            </div>
          </div>

          {/* Conditional ElevenLabs fields: ONLY shown if ElevenLabs is selected */}
          {usesElevenLabs && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: 'var(--bg-primary)',
                border: '1px dashed var(--primary)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>ElevenLabs Voice ID</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. wS22teQFfZZKTTTGs9e5"
                  value={draft.elevenVoiceId ?? ''}
                  onChange={e => setDraft({ ...draft, elevenVoiceId: e.target.value })}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  From your ElevenLabs Voice Lab.
                </p>
              </div>
              <div>
                <label style={labelStyle}>ElevenLabs Model</label>
                <input
                  style={inputStyle}
                  placeholder="eleven_v4_turbo or eleven_multilingual_v2"
                  value={draft.elevenModel ?? ''}
                  onChange={e => setDraft({ ...draft, elevenModel: e.target.value })}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  Note: Gujarati voice requires eleven_v3 or eleven_v4_turbo.
                </p>
              </div>
            </div>
          )}

          {/* Conditional OpenAI-compatible fields: ONLY shown if chosen */}
          {usesCustomLlm && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: 'var(--bg-primary)',
                border: '1px dashed var(--primary)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>OpenAI-compatible Base URL</label>
                <input
                  style={inputStyle}
                  placeholder="https://api.openai.com/v1"
                  value={draft.llmBaseUrl ?? ''}
                  onChange={e => setDraft({ ...draft, llmBaseUrl: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Model Name</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. gpt-4o-mini or llama-3.3-70b-versatile"
                  value={draft.llmModel ?? ''}
                  onChange={e => setDraft({ ...draft, llmModel: e.target.value })}
                />
              </div>
            </div>
          )}

          <div>
            <button className="btn btn-primary" onClick={() => void saveEngines()} disabled={busy === 'engines'}>
              {busy === 'engines' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{' '}
              Save Engine Choices
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 2: API Keys & Credentials (Unified, Clean) ── */}
      {activeTab === 'keys' && providers && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Keys are encrypted using AES-256 in the database. Saved keys are write-only and never shown again.
          </p>

          <div style={{ display: 'grid', gap: 10 }}>
            {KEYS_META.map(k => {
              const status = providers.secrets[k.name] ?? 'missing';
              const badge = STATE_BADGE[status];
              const isBusy = busy === k.name;

              return (
                <div
                  key={k.name}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{k.label}</div>
                    <span
                      style={{
                        padding: '1px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        color: badge.color,
                        background: badge.bg,
                        border: `1px solid ${badge.color}44`,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="password"
                      autoComplete="off"
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder={status === 'saved' ? '•••••••••••••••• (Enter new key to replace)' : 'Paste API key or credential'}
                      value={keyDrafts[k.name] ?? ''}
                      onChange={e => setKeyDrafts(d => ({ ...d, [k.name]: e.target.value }))}
                    />
                    <button
                      className="btn-secondary"
                      disabled={!keyDrafts[k.name]?.trim() || isBusy}
                      onClick={() => void saveKey(k.name, keyDrafts[k.name] ?? '')}
                      style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}
                    >
                      {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Key
                    </button>
                    {status === 'saved' && (
                      <button
                        className="btn-secondary"
                        disabled={isBusy}
                        onClick={() => void saveKey(k.name, null)}
                        style={{ color: '#ef4444', fontSize: 12.5 }}
                        title="Remove saved key"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 3: Public Webhook URL (Tunnel) ── */}
      {activeTab === 'tunnel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Twilio needs a public https address to stream audio to this server. When running on Render or any public host,
            this server&apos;s own address is suggested. When developing locally, use Cloudflare tunnel.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, flex: '1 1 320px', maxWidth: 500 }}
              placeholder="https://your-app.onrender.com"
              value={url}
              onChange={e => setUrl(e.target.value)}
              readOnly={!isAdmin}
            />

            {!setup.publicUrl && setup.suggestedPublicUrl && (
              <button
                className="btn-secondary"
                onClick={() => setUrl(setup.suggestedPublicUrl ?? '')}
                style={{ fontSize: 12 }}
              >
                Use Suggested ({setup.suggestedPublicUrl})
              </button>
            )}

            {isAdmin && (
              <button
                className="btn btn-primary"
                onClick={() => void savePublicUrl()}
                disabled={savingUrl || !url.trim()}
              >
                {savingUrl ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Address
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <span>Status:</span>
            {setup.publicUrlReachable === true ? (
              <span style={{ color: '#22c55e', fontWeight: 600 }}>● Reachable by Twilio</span>
            ) : setup.publicUrl ? (
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>● Address saved: {setup.publicUrl}</span>
            ) : (
              <span style={{ color: '#ef4444', fontWeight: 600 }}>● Not configured</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
