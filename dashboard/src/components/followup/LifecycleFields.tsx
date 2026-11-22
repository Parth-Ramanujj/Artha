import { Plus, X } from 'lucide-react';
import { DEAL_STAGE_OPTIONS } from '../../utils/followupLifecycle';

export interface LifecycleFieldsProps {
  dealStage: string;
  steps: string[];
  maxAttempts: number;
  onChange: (next: { dealStage: string; steps: string[] }) => void;
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
};
const hintStyle = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 };

/** Deal-stage scope and the extra messages for steps 2..n of a follow-up sequence. */
export function LifecycleFields({ dealStage, steps, maxAttempts, onChange }: LifecycleFieldsProps) {
  const setStep = (i: number, value: string) => onChange({ dealStage, steps: steps.map((s, j) => (j === i ? value : s)) });
  const totalMessages = 1 + steps.filter(s => s.trim()).length;

  return (
    <fieldset
      style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, margin: 0, display: 'grid', gap: 12 }}
    >
      <legend style={{ fontSize: 12.5, fontWeight: 700, padding: '0 6px', color: 'var(--text-primary)' }}>
        CRM lifecycle (optional)
      </legend>

      <label style={labelStyle}>
        Only for deals in stage
        <select className="input" value={dealStage} onChange={e => onChange({ dealStage: e.target.value, steps })}>
          <option value="">Any chat (not tied to a deal)</option>
          {DEAL_STAGE_OPTIONS.map(s => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <span style={hintStyle}>
          {dealStage
            ? 'The wait starts when the deal enters this stage. Nudges stop when it moves on, is won or lost, or the customer opts out. The deal owner gets a reminder when the customer replies, or when all nudges go unanswered.'
            : 'Pick a stage to run this as a sales follow-up for that pipeline stage.'}
        </span>
      </label>

      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Next messages <span style={hintStyle}>(step 1 is the message above; each step waits the cooldown)</span>
        </span>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <textarea
              className="input"
              rows={2}
              value={step}
              aria-label={`Message for step ${i + 2}`}
              placeholder={`Step ${i + 2} message`}
              onChange={e => setStep(i, e.target.value)}
              style={{ resize: 'vertical', flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label={`Remove step ${i + 2}`}
              onClick={() => onChange({ dealStage, steps: steps.filter((_, j) => j !== i) })}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => onChange({ dealStage, steps: [...steps, ''] })}
        >
          <Plus size={13} aria-hidden /> Add step {steps.length + 2}
        </button>
        {totalMessages > maxAttempts && (
          <span role="status" style={{ ...hintStyle, color: '#f59e0b' }}>
            Only the first {maxAttempts} message(s) will be sent. Raise Max Follow-up Attempts to {totalMessages} to send
            them all.
          </span>
        )}
      </div>
    </fieldset>
  );
}
