import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Mic, PhoneOff } from 'lucide-react';
import { assistantApi, apiWebSocketUrl, type AssistantTurn } from '../services/api';
import { BrowserCall, type BrowserCallState } from '../components/ai-calling/browserCall';
import './AssistantChat.css';

/** Public page a customer opens from the WhatsApp link: /assistant/:token. No login. Talk by voice or type. */
export function AssistantChat({ token }: { token: string }) {
  const [title, setTitle] = useState('AI Assistant');
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<BrowserCallState | 'idle'>('idle');
  const [speaking, setSpeaking] = useState(false);
  const call = useRef<BrowserCall | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    assistantApi
      .view(token)
      .then(v => {
        setTitle(v.title);
        setTurns(v.transcript);
        document.title = v.title;
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);

  useEffect(() => () => call.current?.hangup(), []);

  // Braces matter: scrollIntoView can return a Promise, which React would call as the cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setText('');
    setTurns(t => [...t, { role: 'user', content: message, at: new Date().toISOString() }]);
    try {
      setTurns((await assistantApi.chat(token, message)).transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startVoice = async () => {
    setError(null);
    setVoice('connecting');
    try {
      const session = await assistantApi.voice(token);
      const browserCall = new BrowserCall(apiWebSocketUrl(session.path), session.token, {
        onState: (s, detail) => {
          setVoice(s);
          if (s === 'error') setError(detail ?? 'Voice call failed. Please try again.');
          if (s === 'ended' || s === 'error') setSpeaking(false);
        },
        onTurn: turn =>
          setTurns(prev => [
            ...prev,
            { role: turn.role === 'agent' ? 'assistant' : 'user', content: turn.text, at: turn.at },
          ]),
        onAgentSpeaking: setSpeaking,
      });
      call.current = browserCall;
      await browserCall.start();
    } catch (err) {
      setVoice('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCall = voice === 'connecting' || voice === 'live';

  return (
    <main className="ac-page">
      <header className="ac-header">
        <h1>{title}</h1>
        <p>
          {onCall
            ? speaking
              ? 'Assistant is speaking…'
              : voice === 'live'
                ? 'Listening… speak now'
                : 'Connecting…'
            : 'AI assistant · talk or type'}
        </p>
      </header>
      <section className="ac-thread" aria-live="polite">
        {!turns.length && !error && !onCall && (
          <div className="ac-start">
            <p>Tap the microphone to talk to our AI assistant, or type below.</p>
            <button type="button" className="ac-mic-big" onClick={() => void startVoice()} aria-label="Talk by voice">
              <Mic size={36} />
            </button>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`ac-bubble ac-${t.role}`}>
            {t.content}
          </div>
        ))}
        {busy && (
          <div className="ac-bubble ac-assistant" aria-label="Typing">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}
        {error && <p className="ac-error">{error}</p>}
        <div ref={endRef} />
      </section>
      <form className="ac-form" onSubmit={e => void send(e)}>
        {onCall ? (
          <button
            type="button"
            className="ac-hangup"
            onClick={() => call.current?.hangup()}
            aria-label="End voice call"
          >
            <PhoneOff size={18} />
          </button>
        ) : (
          <button type="button" onClick={() => void startVoice()} aria-label="Talk by voice">
            <Mic size={18} />
          </button>
        )}
        <input
          aria-label="Your message"
          placeholder={onCall ? 'Voice call on…' : 'Type your message…'}
          value={text}
          maxLength={1000}
          disabled={onCall}
          onChange={e => setText(e.target.value)}
        />
        <button type="submit" disabled={busy || onCall || !text.trim()} aria-label="Send">
          <Send size={18} />
        </button>
      </form>
    </main>
  );
}
