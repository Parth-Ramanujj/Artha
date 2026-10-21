import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, RotateCcw, Send, X } from 'lucide-react';
import type { WorkflowRun } from '../../services/api';
import { stepTraceLabel, stepsToBubbles, triggerSuggestions, type SimBubble } from './simulatorMessages';
import './WorkflowSimulator.css';

interface SessionOption {
  id: string;
  alias?: string;
  status?: string;
}

export interface SimulateStart {
  (messageBody: string): Promise<WorkflowRun>;
}
export interface SimulateReply {
  (runId: string, reply: string): Promise<{ outcome: string; run: WorkflowRun }>;
}

interface WorkflowSimulatorProps {
  open: boolean;
  onClose: () => void;
  /** Saves the flow and starts a fresh conversation; pauses at the first menu/question. */
  onStart: SimulateStart;
  /** Continues a paused conversation with the customer's reply. */
  onReply: SimulateReply;
  /** Current canvas nodes, used only to suggest trigger keywords. */
  nodes: unknown;
  sessions?: SessionOption[];
  sessionId: string;
  onSessionChange: (id: string) => void;
}

interface Turn {
  id: number;
  from: 'user' | 'bot';
  text?: string;
  bubbles?: SimBubble[];
  trace?: Array<{ label: string; ok: boolean }>;
  note?: string;
}

/**
 * A WhatsApp-style preview. It runs the flow in the backend's "simulate" mode, which pauses at menus
 * and questions just like a real chat but never sends a real message. Tapping a button or typing an
 * answer continues the same conversation.
 */
export function WorkflowSimulator({
  open,
  onClose,
  onStart,
  onReply,
  nodes,
  sessions = [],
  sessionId,
  onSessionChange,
}: WorkflowSimulatorProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  // The live conversation: the paused run and how many of its steps we've already shown as bubbles.
  const runId = useRef<string | null>(null);
  const shownSteps = useRef(0);
  const suggestions = triggerSuggestions(nodes);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [turns, busy]);

  const reset = () => {
    setTurns([]);
    runId.current = null;
    shownSteps.current = 0;
  };

  const pushBot = (run: WorkflowRun, fromStep: number) => {
    const steps = Array.isArray(run.steps) ? run.steps : [];
    const fresh = steps.slice(fromStep);
    const bubbles = stepsToBubbles(fresh);
    const trace = fresh.map((s, i) => stepTraceLabel(s, fromStep + i));
    shownSteps.current = steps.length;
    if (bubbles.length === 0) {
      setTurns(prev => [
        ...prev,
        { id: nextId.current++, from: 'bot', note: run.failureReason || 'The flow did not reply to this.', trace },
      ]);
    } else {
      setTurns(prev => [...prev, { id: nextId.current++, from: 'bot', bubbles, trace }]);
    }
    // When the conversation ends, the next message starts a fresh one.
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      runId.current = null;
      shownSteps.current = 0;
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setTurns(prev => [...prev, { id: nextId.current++, from: 'user', text }]);
    try {
      if (!runId.current) {
        const run = await onStart(text);
        runId.current = run.status === 'paused' ? run.id : null;
        pushBot(run, 0);
      } else {
        const { outcome, run } = await onReply(runId.current, text);
        if (outcome === 'restart') {
          // The reply meant "start over": begin a fresh conversation with it.
          runId.current = null;
          shownSteps.current = 0;
          const fresh = await onStart(text);
          runId.current = fresh.status === 'paused' ? fresh.id : null;
          pushBot(fresh, 0);
        } else if (outcome === 'ignored') {
          setTurns(prev => [
            ...prev,
            { id: nextId.current++, from: 'bot', note: 'The bot was not expecting that — try one of the options.' },
          ]);
        } else {
          if (run.status === 'paused') runId.current = run.id;
          pushBot(run, shownSteps.current);
        }
      }
    } catch (err: unknown) {
      setTurns(prev => [
        ...prev,
        {
          id: nextId.current++,
          from: 'bot',
          note: err instanceof Error ? err.message : 'Could not run the simulation.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <aside className="wf-sim" role="dialog" aria-label="WhatsApp simulator">
      <div className="wf-sim-head">
        <span className="wf-sim-avatar" aria-hidden="true">
          B
        </span>
        <span className="wf-sim-head-title">
          <strong>Your business</strong>
          <small>Preview · nothing is really sent</small>
        </span>
        <button type="button" onClick={reset} title="Restart chat" aria-label="Restart chat">
          <RotateCcw size={16} />
        </button>
        <button type="button" onClick={onClose} title="Close simulator" aria-label="Close simulator">
          <X size={18} />
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="wf-sim-session">
          <span>As number</span>
          <select value={sessionId} onChange={e => onSessionChange(e.target.value)} aria-label="Send from number">
            <option value="">Preview only</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.alias || s.id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="wf-sim-chat" ref={chatRef}>
        {turns.length === 0 && (
          <div className="wf-sim-empty">
            <span>Type a message as a customer, or tap one to start:</span>
            <div className="wf-sim-chips">
              {suggestions.map(s => (
                <button key={s} type="button" className="wf-sim-chip" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map(turn =>
          turn.from === 'user' ? (
            <div key={turn.id} className="wf-sim-row out">
              <div className="wf-sim-bubble">{turn.text}</div>
            </div>
          ) : turn.note && !turn.bubbles ? (
            <BotNote key={turn.id} note={turn.note} trace={turn.trace} />
          ) : (
            <BotTurn key={turn.id} turn={turn} onTapButton={label => void send(label)} />
          ),
        )}

        {busy && (
          <div className="wf-sim-row in">
            <div className="wf-sim-bubble">
              <Loader2 size={14} className="animate-spin" /> typing…
            </div>
          </div>
        )}
      </div>

      <form
        className="wf-sim-input"
        onSubmit={e => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message to the bot"
          disabled={busy}
        />
        <button type="submit" className="wf-sim-send" disabled={busy || !input.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}

function BotNote({ note, trace }: { note: string; trace?: Array<{ label: string; ok: boolean }> }) {
  return (
    <>
      <div className="wf-sim-note">{note}</div>
      <Trace trace={trace} />
    </>
  );
}

function BotTurn({ turn, onTapButton }: { turn: Turn; onTapButton: (label: string) => void }) {
  return (
    <>
      {(turn.bubbles ?? []).map(b => {
        if (b.kind === 'note') {
          return (
            <div key={b.key} className="wf-sim-note">
              {b.text}
            </div>
          );
        }
        return (
          <div key={b.key} className="wf-sim-row in">
            <div className="wf-sim-bubble">
              {b.kind === 'media' && (
                <div className="wf-sim-media">
                  <FileText size={16} aria-hidden="true" /> {b.mediaKind || 'file'}
                </div>
              )}
              {b.text}
              {b.kind === 'buttons' && (b.buttons?.length ?? 0) > 0 && (
                <div className="wf-sim-btns">
                  {b.buttons!.map(label => (
                    <button key={label} type="button" className="wf-sim-btn" onClick={() => onTapButton(label)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <Trace trace={turn.trace} />
    </>
  );
}

function Trace({ trace }: { trace?: Array<{ label: string; ok: boolean }> }) {
  if (!trace || trace.length === 0) return null;
  return (
    <details className="wf-sim-trace">
      <summary>What the bot did ({trace.length})</summary>
      <ul>
        {trace.map((t, i) => (
          <li key={i} style={{ color: t.ok ? undefined : 'var(--error, #ef4444)' }}>
            {t.ok ? '✓' : '✕'} {t.label}
          </li>
        ))}
      </ul>
    </details>
  );
}
