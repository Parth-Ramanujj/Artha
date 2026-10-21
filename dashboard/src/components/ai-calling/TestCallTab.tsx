import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Headphones, Loader2, Mic, PhoneOff, PhoneCall } from 'lucide-react';
import { aiCallingApi, apiWebSocketUrl, type AiCall, type AiCallingSetup, type AiCallTurn } from '../../services/api';
import { useToast } from '../Toast';
import { BrowserCall, type BrowserCallState } from './browserCall';
import { CallDrawer } from './CallDrawer';
import { ACTIVE_STATUSES, errorText, panel } from './callMeta';

/** Talk to the agent through the browser microphone: same conversation engine, no phone line needed. */
export function TestCallTab({ agentId, setup }: { agentId?: string; setup?: AiCallingSetup | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [state, setState] = useState<BrowserCallState | 'idle'>('idle');
  const [turns, setTurns] = useState<AiCallTurn[]>([]);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [result, setResult] = useState<AiCall | null>(null);
  const call = useRef<BrowserCall | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => () => call.current?.hangup(), []);
  useEffect(() => transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [turns]);

  // The analysis runs right after the call; fetch it once it is there.
  useEffect(() => {
    if (state !== 'ended' || !callId) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      aiCallingApi
        .call(callId)
        .then(c => {
          // Done once the call has ended on the server and the analysis (or an error) is in.
          const settled = !ACTIVE_STATUSES.includes(c.status) && (c.summary || c.error);
          if (settled || tries > 15) {
            setResult(c);
            window.clearInterval(timer);
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [state, callId]);

  const start = async () => {
    setTurns([]);
    setResult(null);
    try {
      const session = await aiCallingApi.startTestCall(agentId);
      setCallId(session.callId);
      const browserCall = new BrowserCall(apiWebSocketUrl(session.path), session.token, {
        onState: (s, detail) => {
          setState(s);
          if (s === 'error' && detail) toast.error(detail);
        },
        onTurn: turn => setTurns(prev => [...prev, turn]),
        onAgentSpeaking: setAgentSpeaking,
        onLevel: setLevel,
      });
      call.current = browserCall;
      await browserCall.start();
    } catch (err) {
      setState('error');
      toast.error(errorText(err, t('aiCalling.test.startFailed')));
    }
  };

  const live = state === 'connecting' || state === 'live';
  const missing = setup
    ? [!setup.sarvamKey && t('aiCalling.setup.sarvam.title'), !setup.groqKey && t('aiCalling.setup.groq.title')].filter(
        Boolean,
      )
    : [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      <div
        style={{
          ...panel,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: agentSpeaking ? '#8b5cf633' : live ? '#22c55e22' : 'var(--bg-primary)',
            border: `3px solid ${agentSpeaking ? '#8b5cf6' : live ? '#22c55e' : 'var(--border)'}`,
            transition: 'all 0.2s',
            boxShadow: live && !agentSpeaking ? `0 0 0 ${Math.round(level * 30)}px #22c55e22` : 'none',
          }}
        >
          {agentSpeaking ? (
            <PhoneCall size={40} color="#8b5cf6" />
          ) : (
            <Mic size={40} color={live ? '#22c55e' : 'var(--text-muted)'} />
          )}
        </div>
        <div style={{ fontWeight: 700 }}>
          {state === 'connecting'
            ? t('aiCalling.test.connecting')
            : state === 'live'
              ? agentSpeaking
                ? t('aiCalling.test.speaking')
                : t('aiCalling.test.listening')
              : t('aiCalling.test.idle')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 340 }}>
          <Headphones size={13} style={{ verticalAlign: '-2px' }} /> {t('aiCalling.test.headphones')}
        </div>
        {live ? (
          <button className="btn-danger" onClick={() => call.current?.hangup()}>
            <PhoneOff size={16} /> {t('aiCalling.test.hangUp')}
          </button>
        ) : (
          <button className="btn-primary" onClick={() => void start()} disabled={missing.length > 0}>
            <PhoneCall size={16} /> {t('aiCalling.test.start')}
          </button>
        )}
        {!live && missing.length > 0 && (
          <div style={{ fontSize: 12.5, color: '#f59e0b' }}>
            {t('aiCalling.test.missing', { items: missing.join(', ') })}
          </div>
        )}
        {state === 'ended' && !result && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <Loader2 size={14} className="animate-spin" style={{ verticalAlign: '-2px' }} />{' '}
            {t('aiCalling.test.analysing')}
          </div>
        )}
      </div>

      <div style={{ ...panel, minHeight: 320, maxHeight: 520, overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{t('aiCalling.test.transcript')}</div>
        {turns.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('aiCalling.test.transcriptEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {turns.map((turn, i) => (
              <div
                key={i}
                style={{
                  alignSelf: turn.role === 'agent' ? 'flex-start' : 'flex-end',
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  fontSize: 14,
                  background: turn.role === 'agent' ? 'var(--bg-primary)' : '#25d36622',
                  border: '1px solid var(--border)',
                  opacity: turn.interrupted ? 0.7 : 1,
                }}
              >
                {turn.text}
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>
        )}
      </div>

      {result && <CallDrawer call={result} onClose={() => setResult(null)} onChanged={setResult} />}
    </div>
  );
}
