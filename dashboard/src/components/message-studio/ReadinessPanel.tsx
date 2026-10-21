import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { Readiness, ReadinessIssue } from '../../types/messageStudio';
import { READINESS_META } from '../../utils/messageStudio';

interface ReadinessPanelProps {
  readiness?: Readiness;
  issues: ReadinessIssue[];
  deliveryNote?: string;
  checking: boolean;
  sampleText: boolean;
}

const ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };

/** What still stands between this message and a test send, in plain words. */
export function ReadinessPanel({ readiness, issues, deliveryNote, checking, sampleText }: ReadinessPanelProps) {
  // Preset sample text blocks testing and publishing, so a technically valid message isn't "ready" yet.
  const shown: Readiness | undefined = readiness === 'ready' && sampleText ? 'needs_attention' : readiness;
  const meta = shown ? READINESS_META[shown] : null;
  const Icon = meta ? ICON[meta.tone] : Info;
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return (
    <section
      className={`ms-readiness ms-tone-${meta?.tone ?? 'info'}`}
      aria-live="polite"
      aria-labelledby="ms-readiness-title"
    >
      <div className="ms-readiness-head">
        <Icon size={18} aria-hidden="true" />
        <strong id="ms-readiness-title">{checking && !meta ? 'Checking…' : (meta?.label ?? 'Checking…')}</strong>
        {checking && meta && <span className="ms-muted">checking…</span>}
      </div>
      {errors.length > 0 && (
        <ul className="ms-readiness-list">
          {errors.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      )}
      {sampleText && (
        <p className="ms-readiness-note">The text still contains “[Sample]” preset text — replace it before sending.</p>
      )}
      {deliveryNote && <p className="ms-readiness-note">{deliveryNote}</p>}
      {warnings.map((i, n) => (
        <p key={n} className="ms-readiness-note">
          {i.message}
        </p>
      ))}
    </section>
  );
}
