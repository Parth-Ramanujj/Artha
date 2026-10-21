import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Circle, ListChecks, Plus } from 'lucide-react';
import type { WorkflowIssue } from './workflowIssues';

interface WorkflowChecklistProps {
  checklist: {
    trigger: boolean;
    steps: boolean;
    connected: boolean;
    ready: boolean;
    errorCount: number;
    warningCount: number;
  };
  issues: WorkflowIssue[];
  onAddTrigger: () => void;
  onFocus: (nodeId: string) => void;
}

const row = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '4px 0' } as const;

function Tick({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 size={15} color="#22c55e" aria-label="done" />
  ) : (
    <Circle size={15} color="var(--text-muted, #94a3b8)" aria-label="not done" />
  );
}

/**
 * A short "what's left" list on top of the canvas. A new user sees the next thing to do, and a
 * click on an issue jumps to the step that needs it.
 */
export function WorkflowChecklist({ checklist, issues, onAddTrigger, onFocus }: WorkflowChecklistProps) {
  const shown = issues.slice(0, 5);
  const more = issues.length - shown.length;
  // Open while something needs doing; folded to a small pill once the flow is ready. The user can
  // always open or fold it, and the choice stays until the next change in readiness.
  const [open, setOpen] = useState(!checklist.ready);
  const [lastReady, setLastReady] = useState(checklist.ready);
  if (lastReady !== checklist.ready) {
    setLastReady(checklist.ready);
    setOpen(!checklist.ready);
  }
  const pending = checklist.errorCount + checklist.warningCount;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={checklist.ready ? 'Setup checklist: ready. Open' : `Setup checklist: ${pending} to finish. Open`}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 5,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 999,
          border: '1px solid var(--border, #334155)',
          background: 'var(--bg-card, #1e293b)',
          color: 'var(--text-primary)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {checklist.ready ? (
          <CheckCircle2 size={14} color="#22c55e" aria-hidden="true" />
        ) : (
          <ListChecks size={14} color="#fbbf24" aria-hidden="true" />
        )}
        {checklist.ready ? 'Ready to test' : `${pending} to finish`}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
    );
  }

  return (
    <aside
      aria-label="Setup checklist"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 5,
        width: 280,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border, #334155)',
        boxShadow: 'var(--shadow-md)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 13, flex: 1 }}>
          {checklist.ready
            ? 'Ready to test'
            : checklist.errorCount > 0
              ? 'Fix these to continue'
              : 'Almost ready: finish these'}
        </strong>
        <button
          type="button"
          className="btn-link"
          onClick={() => setOpen(false)}
          aria-label="Fold the checklist"
          style={{ padding: 0 }}
        >
          <ChevronUp size={15} aria-hidden="true" />
        </button>
      </div>

      <div style={{ marginTop: 6 }}>
        <div style={row}>
          <Tick done={checklist.trigger} />
          <span style={{ flex: 1 }}>Start: a trigger</span>
          {!checklist.trigger && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onAddTrigger}
              style={{ padding: '2px 8px' }}
            >
              <Plus size={12} /> Add
            </button>
          )}
        </div>
        <div style={row}>
          <Tick done={checklist.steps} />
          <span>At least one step (drag it from the left)</span>
        </div>
        <div style={row}>
          <Tick done={checklist.connected} />
          <span>Every step is connected with an arrow</span>
        </div>
        <div style={row}>
          <Tick done={checklist.ready} />
          <span>Everything is filled in</span>
        </div>
      </div>

      {issues.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border, #334155)', paddingTop: 8 }}>
          <div style={{ ...row, color: checklist.errorCount > 0 ? '#f87171' : '#fbbf24', fontWeight: 600 }}>
            <AlertTriangle size={14} aria-hidden="true" />
            {checklist.errorCount > 0
              ? `${checklist.errorCount} thing${checklist.errorCount > 1 ? 's' : ''} to fix`
              : `${checklist.warningCount} thing${checklist.warningCount > 1 ? 's' : ''} to finish`}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {shown.map((issue, i) => (
              <li key={`${issue.message}-${i}`}>
                <button
                  type="button"
                  disabled={!issue.nodeId}
                  onClick={() => issue.nodeId && onFocus(issue.nodeId)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 0,
                    padding: '4px 6px',
                    borderRadius: 6,
                    color: 'inherit',
                    fontSize: 12,
                    lineHeight: 1.4,
                    cursor: issue.nodeId ? 'pointer' : 'default',
                  }}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
          {more > 0 && <span style={{ fontSize: 11.5, opacity: 0.7 }}>+ {more} more</span>}
        </div>
      )}
    </aside>
  );
}
