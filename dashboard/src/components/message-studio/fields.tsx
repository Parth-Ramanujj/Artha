import { useId, type ReactNode } from 'react';
import type { ReadinessIssue } from '../../types/messageStudio';
import { VARIABLES } from '../../utils/messageStudio';

/** Messages from the server next to the field they are about. */
export function FieldIssues({ issues, id }: { issues: ReadinessIssue[]; id?: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className="ms-field-issues" id={id}>
      {issues.map((i, n) => (
        <li key={n} className={i.severity === 'error' ? 'ms-field-error' : 'ms-field-warning'}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: ReactNode;
  issues?: ReadinessIssue[];
  required?: boolean;
  type?: string;
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'url';
}

/** A labelled input with an optional "12 / 60" counter and its validation messages. */
export function TextField({
  label,
  value,
  onChange,
  max,
  multiline,
  rows = 4,
  placeholder,
  hint,
  issues = [],
  required,
  type = 'text',
  inputMode,
}: TextFieldProps) {
  const id = useId();
  const over = max !== undefined && value.length > max;
  const describedBy =
    [hint ? `${id}-hint` : '', issues.length ? `${id}-issues` : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    className: `ms-input ${issues.some(i => i.severity === 'error') || over ? 'is-invalid' : ''}`,
    value,
    placeholder,
    'aria-invalid': issues.some(i => i.severity === 'error') || over,
    'aria-describedby': describedBy,
    'aria-required': required,
  };
  return (
    <div className="ms-field">
      <div className="ms-label-row">
        <label htmlFor={id} className="ms-label">
          {label}
          {required ? ' *' : ''}
        </label>
        {max !== undefined && (
          <span className={`ms-counter ${over ? 'is-over' : ''}`} aria-live="polite">
            {value.length} / {max}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={e => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} inputMode={inputMode} onChange={e => onChange(e.target.value)} />
      )}
      {hint && (
        <span className="ms-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      <FieldIssues issues={issues} id={`${id}-issues`} />
    </div>
  );
}

/** A section that holds optional fields, closed until the user wants them. */
export function OptionalSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="ms-optional">
      <button className="ms-optional-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle} type="button">
        {open ? '−' : '+'} {title}
      </button>
      {open && (
        <div id={id} className="ms-optional-body">
          {children}
        </div>
      )}
    </div>
  );
}

/** Chips that append a workflow variable to a text value. */
export function VariableChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="ms-chips" aria-label="Insert a variable">
      {VARIABLES.map(v => (
        <button
          key={v.token}
          type="button"
          className="ms-chip ms-chip-btn"
          onClick={() => onInsert(v.token)}
          title={v.token}
        >
          + {v.label}
        </button>
      ))}
    </div>
  );
}
