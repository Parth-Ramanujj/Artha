import { useEffect, useRef, useState } from 'react';
import { Headphones, Loader2, Mic, PhoneOff, PhoneCall } from 'lucide-react';
import { aiCallingApi, apiWebSocketUrl, type AiCall, type AiCallTurn } from '../../services/api';
import { useToast } from '../Toast';
import { BrowserCall, type BrowserCallState } from './browserCall';
import { CallDrawer } from './CallDrawer';
import { errorText, panel } from './callMeta';

/** Talk to the agent through the browser microphone: same conversation engine, no phone line needed. */
export function TestCallTab({ agentId }: { agentId?: string }) {
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
          if (c.summary || tries > 15) {
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
      toast.error(errorText(err, 'Could not start the test call'));
    }
  };

  const live = state === 'connecting' || state === 'live';
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
            ? 'Connecting…'
            : state === 'live'
              ? agentSpeaking
                ? 'Agent is speaking'
                : 'Listening — speak now'
              : 'Test the agent with your voice'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 340 }}>
          <Headphones size={13} style={{ verticalAlign: '-2px' }} /> Use headphones so the agent does not hear itself.
          Talk in Gujarati or Hindi and interrupt it any time, like a real customer.
        </div>
        {live ? (
          <button className="btn-danger" onClick={() => call.current?.hangup()}>
            <PhoneOff size={16} /> Hang up
          </button>
        ) : (
          <button className="btn-primary" onClick={() => void start()}>
            <PhoneCall size={16} /> Start test call
          </button>
        )}
        {state === 'ended' && !result && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <Loader2 size={14} className="animate-spin" style={{ verticalAlign: '-2px' }} /> Analysing the call…
          </div>
        )}
      </div>

      <div style={{ ...panel, minHeight: 320, maxHeight: 520, overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Live transcript</div>
        {turns.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>The conversation appears here as you talk.</div>
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
