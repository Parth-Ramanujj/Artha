import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Modal } from '../Modal';
import { aiAgentsApi, type AiAgent } from '../../services/api';
import { aiCreditsService } from '../../services/aiCredits';
import { inputStyle } from './styles';

type Turn = { role: 'user' | 'assistant'; content: string; latencyMs?: number };

export function AgentTestModal({ agent, onClose }: { agent: AiAgent; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns(prev => [...prev, { role: 'user', content: message }]);
    setInput('');
    setError(null);
    setSending(true);
    try {
      const res = await aiAgentsApi.test(agent.id, message, history);
      setTurns(prev => [...prev, { role: 'assistant', content: res.reply, latencyMs: res.latencyMs }]);
      aiCreditsService.deduct('agent_reply', `Test chat with ${agent.name}`, 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      title={`Test: ${agent.name}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <input
            type="text"
            aria-label="Test message"
            placeholder="Type a test customer message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button className="btn-primary" onClick={send} disabled={sending || !input.trim()} aria-label="Send">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: 360,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {turns.length === 0 && (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Send a message as a customer would. Replies come from the real agent; nothing is sent on WhatsApp.
          </p>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            style={{
              alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
              background: t.role === 'user' ? '#6366f1' : 'var(--bg-tertiary)',
              color: t.role === 'user' ? '#ffffff' : 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: 10,
              maxWidth: '80%',
              fontSize: '0.875rem',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
            }}
          >
            {t.content}
            {t.latencyMs != null && (
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                {t.latencyMs} ms
              </div>
            )}
          </div>
        ))}
        {error && (
          <div role="alert" style={{ color: '#dc2626', fontSize: '0.8125rem' }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
