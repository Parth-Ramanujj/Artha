import { useEffect, useRef, useState } from 'react';
import { Loader2, Play, RotateCw, Square, Volume2 } from 'lucide-react';
import { aiAgentsApi, type AiVoicesResponse, type VoiceLanguageCode } from '../../services/api';
import { aiCreditsService } from '../../services/aiCredits';
import { useToast } from '../Toast';
import { inputStyle } from './styles';

const SAMPLE_TEXT: Record<VoiceLanguageCode, string> = {
  'gu-IN': 'નમસ્તે! હું તમારી કેવી રીતે મદદ કરી શકું?',
  'hi-IN': 'नमस्ते! मैं आपकी कैसे मदद कर सकती हूँ?',
  'en-IN': 'Hello! How can I help you today?',
};

const labelStyle = { fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: 4 } as const;

export function VoiceTab() {
  const toast = useToast();
  const [data, setData] = useState<AiVoicesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [language, setLanguage] = useState<VoiceLanguageCode>('gu-IN');
  const [voice, setVoice] = useState('');
  const [text, setText] = useState(SAMPLE_TEXT['gu-IN']);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = () => {
    setLoadError(null);
    aiAgentsApi
      .voices()
      .then(res => {
        setData(res);
        const first = res.languages.find(l => l.code === language) ?? res.languages[0];
        if (first) {
          setLanguage(first.code);
          setVoice(first.voices[0]?.id ?? '');
        }
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    load();
    return () => audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  };

  const changeLanguage = (code: VoiceLanguageCode) => {
    setLanguage(code);
    setVoice(data?.languages.find(l => l.code === code)?.voices[0]?.id ?? '');
    setText(SAMPLE_TEXT[code] ?? '');
  };

  const play = async () => {
    if (!text.trim() || !voice) return;
    stop();
    setLoadingAudio(true);
    try {
      const res = await aiAgentsApi.voicePreview({ text: text.trim(), language, voice });
      const audio = new Audio(`data:audio/wav;base64,${res.audio}`);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      await audio.play();
      setPlaying(true);
      aiCreditsService.deduct('voice_tts', 'Voice AI Synthesis Preview', 2);
    } catch (err) {
      toast.error('Voice preview failed', err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAudio(false);
    }
  };

  if (loadError) {
    return (
      <div className="empty-state">
        <p>Could not load voices: {loadError}</p>
        <button className="btn-secondary" onClick={load}>
          <RotateCw size={14} /> Retry
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="empty-state">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const voices = data.languages.find(l => l.code === language)?.voices ?? [];

  return (
    <div className="voice-ai-grid">
      <div className="voice-ai-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="builder-icon">
            <Volume2 size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Text-to-Speech (Sarvam)</h3>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Preview the voices your AI agents and calls speak with.
            </p>
          </div>
        </div>

        {!data.configured && (
          <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: '#b45309' }}>
            Add SARVAM_API_KEY to the server .env to enable voice
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>
            <span style={labelStyle}>Language</span>
            <select
              className="pipeline-select"
              style={{ width: '100%' }}
              value={language}
              onChange={e => changeLanguage(e.target.value as VoiceLanguageCode)}
            >
              {data.languages.map(l => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={labelStyle}>Voice</span>
            <select
              className="pipeline-select"
              style={{ width: '100%' }}
              value={voice}
              onChange={e => setVoice(e.target.value)}
            >
              {voices.map(v => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span style={labelStyle}>Sample text</span>
          <textarea
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>

        <div className="voice-preview-box">
          <button
            type="button"
            className="voice-play-btn"
            onClick={playing ? stop : play}
            disabled={loadingAudio || (!playing && (!data.configured || !voice || !text.trim()))}
            aria-label={playing ? 'Stop' : 'Play voice sample'}
          >
            {loadingAudio ? (
              <Loader2 size={18} className="animate-spin" />
            ) : playing ? (
              <Square size={18} />
            ) : (
              <Play size={20} style={{ marginLeft: 2 }} />
            )}
          </button>
          <div>
            <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>
              {loadingAudio ? 'Synthesizing...' : playing ? 'Playing — click to stop' : 'Play sample (-2 cr)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
