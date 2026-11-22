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

const POPULAR_ELEVEN_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Calm)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Confident)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Soft)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Balanced)' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Deep)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Conversational)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (British)' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Gentle)' },
];

const KEYS_META: { name: AiSecretName; label: string; group: 'voice' | 'llm' | 'twilio'; hint?: string }[] = [
  { name: 'SARVAM_API_KEY', label: 'Sarvam API Key (Speech & Voice)', group: 'voice', hint: 'From sarvam.ai dashboard' },
  { name: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key (Speech-to-Text)', group: 'voice', hint: 'From console.deepgram.com' },
  {
    name: 'ELEVENLABS_API_KEY',
    label: 'ElevenLabs API Key (TTS Voice)',
    group: 'voice',
    hint: 'From elevenlabs.io > Profile (bottom-left) > "Profile + API key". Starts with sk_ or 32-char hex. (NOT a Voice ID)',
  },
  { name: 'LLM_API_KEY', label: 'Custom LLM API Key (OpenAI-compatible)', group: 'llm', hint: 'From your LLM provider' },
  { name: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID (starts with AC)', group: 'twilio', hint: '34 chars starting with AC from twilio.com/console' },
  { name: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token', group: 'twilio', hint: 'From twilio.com/console' },
  { name: 'TWILIO_PHONE_NUMBER', label: 'Twilio Phone Number (+CountryCode)', group: 'twilio', hint: 'e.g. +15551234567' },
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
  const [elevenVoices, setElevenVoices] = useState<Array<{ id: string; name: string; category?: string }>>([]);
  const [loadingElevenVoices, setLoadingElevenVoices] = useState(false);
  const [elevenVoiceError, setElevenVoiceError] = useState<string | null>(null);

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

  const loadElevenVoices = async () => {
    setLoadingElevenVoices(true);
    setElevenVoiceError(null);
    try {
      const res = await aiCallingApi.elevenLabsVoices();
      if (res.error) {
        setElevenVoiceError(res.error);
      } else {
        setElevenVoices(res.voices);
      }
    } catch (err) {
      setElevenVoiceError(errorText(err, 'Failed to fetch ElevenLabs voices'));
    } finally {
      setLoadingElevenVoices(false);
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

  const toggleOverride = async (checked: boolean) => {
    if (!draft) return;
    const nextDraft = { ...draft, overrideAgentSettings: checked };
    setDraft(nextDraft);
    setBusy('override');
    try {
      const saved = await aiCallingApi.saveProviders(nextDraft);
      setProviders(saved);
      setDraft(saved.config);
      toast.success(
        checked
          ? 'Global Engine Override ENABLED: outer choices (STT, Voices, LLM) now apply to all calls'
          : 'Global Engine Override DISABLED: calls will use individual Agent Tab settings'
      );
      onChanged();
    } catch (err) {
      toast.error(errorText(err, 'Failed to update global override setting'));
      setDraft(draft);
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
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 999,
                background: providers?.config.overrideAgentSettings ? '#22c55e1a' : 'var(--bg-primary)',
                border: `1px solid ${providers?.config.overrideAgentSettings ? '#22c55e44' : 'var(--border)'}`,
                color: providers?.config.overrideAgentSettings ? '#22c55e' : 'var(--text-secondary)',
                fontWeight: 600,
              }}
            >
              {providers?.config.overrideAgentSettings ? 'Global Override: ON' : 'Agent Defaults: Active'}
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
          {/* Master Toggle: Global Engine Override vs Agent Defaults */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              background: draft.overrideAgentSettings ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-primary)',
              border: `1.5px solid ${draft.overrideAgentSettings ? '#22c55e' : 'var(--border)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>Global Engine Override</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: draft.overrideAgentSettings ? '#22c55e22' : 'var(--bg-secondary)',
                      color: draft.overrideAgentSettings ? '#22c55e' : 'var(--text-secondary)',
                      border: `1px solid ${draft.overrideAgentSettings ? '#22c55e55' : 'var(--border)'}`,
                    }}
                  >
                    {busy === 'override' ? 'Saving...' : draft.overrideAgentSettings ? 'ON — Using Outer Engines' : 'OFF — Using Agent Tab Settings'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {draft.overrideAgentSettings
                    ? 'ON: Calls will strictly use the global speech & language engines chosen below (STT, Voices, ElevenLabs, Custom LLM) for all agents.'
                    : 'OFF: Calls will use each agent\'s individual settings from the Agent tab (voices like Pooja/Ritu, pace, model). Global engines below are bypassed.'}
                </p>
              </div>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: busy === 'override' ? 'wait' : 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  disabled={busy === 'override'}
                  checked={draft.overrideAgentSettings ?? true}
                  onChange={e => void toggleOverride(e.target.checked)}
                  style={{ display: 'none' }}
                />
                <div
                  style={{
                    width: 48,
                    height: 26,
                    borderRadius: 999,
                    background: draft.overrideAgentSettings ? '#22c55e' : '#9ca3af',
                    position: 'relative',
                    transition: 'background 0.2s',
                    opacity: busy === 'override' ? 0.6 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute',
                      top: 3,
                      left: draft.overrideAgentSettings ? 25 : 3,
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </div>
              </label>
            </div>

            {/* Active Override Badges Preview */}
            {draft.overrideAgentSettings && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                  paddingTop: 6,
                  borderTop: '1px solid rgba(34, 197, 94, 0.2)',
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 700, color: '#16a34a', fontSize: 11.5 }}>Active on next calls:</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--bg-primary)',
                    border: '1px solid #22c55e66',
                    color: 'var(--text-primary)',
                  }}
                >
                  STT: {draft.stt === 'deepgram' ? 'Deepgram nova-3' : 'Sarvam'}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--bg-primary)',
                    border: '1px solid #22c55e66',
                    color: 'var(--text-primary)',
                  }}
                >
                  Gujarati: {draft.ttsGujarati === 'elevenlabs' ? `ElevenLabs (${draft.elevenVoiceId ? draft.elevenVoiceId.slice(0, 8) + '...' : 'No ID'})` : (draft.sarvamGujaratiVoice || 'pooja_gu_customer')}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--bg-primary)',
                    border: '1px solid #22c55e66',
                    color: 'var(--text-primary)',
                  }}
                >
                  Hindi: {draft.ttsHindi === 'elevenlabs' ? `ElevenLabs (${draft.elevenVoiceId ? draft.elevenVoiceId.slice(0, 8) + '...' : 'No ID'})` : (draft.sarvamHindiVoice || 'ritu_hi_customer_warm')}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--bg-primary)',
                    border: '1px solid #22c55e66',
                    color: 'var(--text-primary)',
                  }}
                >
                  LLM: {draft.llm === 'openai-compatible' ? (draft.llmModel || 'OpenAI Compatible') : (draft.groqModel || 'llama-3.3-70b-versatile')}
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
              opacity: draft.overrideAgentSettings ? 1 : 0.7,
              transition: 'opacity 0.2s',
            }}
          >
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
              {draft.ttsGujarati === 'sarvam' && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--text-secondary)' }}>
                    Sarvam Voice:
                  </label>
                  <select
                    style={{ ...inputStyle, fontSize: 12.5, padding: '5px 8px' }}
                    value={draft.sarvamGujaratiVoice || 'pooja_gu_customer'}
                    onChange={e => setDraft({ ...draft, sarvamGujaratiVoice: e.target.value })}
                  >
                    <option value="pooja_gu_customer">Pooja — Customer Care (Female, Proven)</option>
                    <option value="pooja_gu_conversational">Pooja — Conversational (Female)</option>
                    <option value="bhavik_gu_conversation">Bhavik — Conversational (Male)</option>
                  </select>
                </div>
              )}
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
              {draft.ttsHindi === 'sarvam' && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--text-secondary)' }}>
                    Sarvam Voice:
                  </label>
                  <select
                    style={{ ...inputStyle, fontSize: 12.5, padding: '5px 8px' }}
                    value={draft.sarvamHindiVoice || 'ritu_hi_customer_warm'}
                    onChange={e => setDraft({ ...draft, sarvamHindiVoice: e.target.value })}
                  >
                    <option value="ritu_hi_customer_warm">Ritu — Customer Warm (Female, Default)</option>
                    <option value="ritu_hi_customer">Ritu — Customer Care (Female)</option>
                    <option value="aparna_hi_customer">Aparna — Customer Care (Female)</option>
                    <option value="aarti_hi_customer">Aarti — Customer Care (Female)</option>
                    <option value="shubh_hi_customer">Shubh — Customer Care (Male)</option>
                    <option value="amit_hi_conversational">Amit — Conversational (Male)</option>
                  </select>
                </div>
              )}
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
              {draft.llm === 'groq' && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--text-secondary)' }}>
                    Groq Model:
                  </label>
                  <select
                    style={{ ...inputStyle, fontSize: 12.5, padding: '5px 8px' }}
                    value={draft.groqModel || 'llama-3.3-70b-versatile'}
                    onChange={e => setDraft({ ...draft, groqModel: e.target.value })}
                  >
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Recommended, Fast & Smart)</option>
                    <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Agent Default)</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Fastest Latency)</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 (High Context)</option>
                  </select>
                </div>
              )}
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
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={labelStyle}>ElevenLabs Voice ID</label>
                    {providers?.secrets.ELEVENLABS_API_KEY !== 'missing' && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void loadElevenVoices()}
                        disabled={loadingElevenVoices}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {loadingElevenVoices ? (
                          <>
                            <Loader2 size={11} className="animate-spin" /> Fetching...
                          </>
                        ) : (
                          'Load My Account Voices'
                        )}
                      </button>
                    )}
                  </div>

                  {elevenVoices.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <select
                        style={inputStyle}
                        value={draft.elevenVoiceId ?? ''}
                        onChange={e => setDraft({ ...draft, elevenVoiceId: e.target.value })}
                      >
                        <option value="">-- Choose from your ElevenLabs Account ({elevenVoices.length} voices) --</option>
                        {elevenVoices.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.category ?? 'voice'}) - {v.id.slice(0, 8)}...
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <input
                    style={inputStyle}
                    placeholder="e.g. 21m00Tcm4TlvDq8ikWAM or custom voice ID"
                    value={draft.elevenVoiceId ?? ''}
                    onChange={e => setDraft({ ...draft, elevenVoiceId: e.target.value.trim() })}
                  />

                  {elevenVoiceError && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: '#ef444415',
                        border: '1px solid #ef444455',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 3 }}>
                        ❌ {elevenVoiceError}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        Your ElevenLabs API key was rejected (401 Unauthorized). Please ensure you pasted your secret API key from <em>elevenlabs.io &gt; Profile + API key</em>, and not a Voice ID.
                        <div style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setActiveTab('keys')}
                            style={{ fontSize: 11.5 }}
                          >
                            Open API Keys &amp; Credentials Tab →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Popular Preset Chips */}
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Popular Pre-made Voices (work immediately on all accounts):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {POPULAR_ELEVEN_VOICES.map(pv => {
                        const isSelected = draft.elevenVoiceId === pv.id;
                        return (
                          <button
                            key={pv.id}
                            type="button"
                            onClick={() => setDraft({ ...draft, elevenVoiceId: pv.id })}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                              background: isSelected ? 'var(--primary)' : 'var(--bg-secondary)',
                              color: isSelected ? '#fff' : 'var(--text-primary)',
                              cursor: 'pointer',
                            }}
                          >
                            {pv.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>ElevenLabs Model</label>
                  <input
                    style={inputStyle}
                    placeholder="eleven_v4_turbo or eleven_multilingual_v2"
                    value={draft.elevenModel ?? ''}
                    onChange={e => setDraft({ ...draft, elevenModel: e.target.value.trim() })}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {['eleven_v4_turbo', 'eleven_multilingual_v2', 'eleven_turbo_v2_5'].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft({ ...draft, elevenModel: m })}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: `1px solid ${draft.elevenModel === m ? 'var(--primary)' : 'var(--border)'}`,
                          background: draft.elevenModel === m ? 'var(--primary)' : 'var(--bg-secondary)',
                          color: draft.elevenModel === m ? '#fff' : 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    Note: Gujarati voice requires <code>eleven_v3</code> or <code>eleven_v4_turbo</code>.
                  </p>
                </div>
              </div>

              {/* Crucial Explanatory Callout on Community Voices & Automatic Sarvam Fallback */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#f59e0b12',
                  border: '1px solid #f59e0b44',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: 2 }}>
                    How ElevenLabs Voice IDs work &amp; why &quot;voice_id_does_not_exist&quot; occurs:
                  </div>
                  <div style={{ lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                    If you copy a Voice ID from the <strong>ElevenLabs Community Library</strong> (e.g.{' '}
                    <code>wS22teQFfZZKTTTGs9e5</code>), you <strong>MUST</strong> open{' '}
                    <a
                      href="https://elevenlabs.io"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                    >
                      elevenlabs.io
                    </a>
                    , search the voice and click <strong>&quot;Add to Voice Lab&quot;</strong> in your account first.
                    Without adding it to your account, ElevenLabs returns <code>voice_id_does_not_exist</code>.<br />
                    <em>Pre-made voices above (Rachel, Adam, etc.) work immediately without adding to Voice Lab. If ElevenLabs ever fails, Artha now automatically falls back to Sarvam TTS so test and phone calls never crash.</em>
                  </div>
                </div>
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

                  {k.hint && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      {k.hint}
                    </div>
                  )}

                  {k.name === 'ELEVENLABS_API_KEY' && keyDrafts[k.name] && keyDrafts[k.name]!.length === 20 && (
                    <div style={{ fontSize: 11.5, color: '#f59e0b', fontWeight: 600 }}>
                      ⚠️ Warning: This input is 20 characters long, which looks like a Voice ID (like <code>wS22teQFfZZKTTTGs9e5</code>), NOT an API Key! An ElevenLabs API key starts with <code>sk_</code> and can be copied from elevenlabs.io &gt; Profile + API key.
                    </div>
                  )}

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
