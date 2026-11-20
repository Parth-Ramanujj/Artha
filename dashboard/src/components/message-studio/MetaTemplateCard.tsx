import { Clock, Megaphone, PencilLine, Send, Workflow, XCircle, Zap } from 'lucide-react';
import type { StudioTemplate, TemplateAutoTest } from '../../types/messageStudio';
import { templatePrice } from '../../utils/templatePricing';

const STATUS: Record<string, { label: string; className: string }> = {
  APPROVED: { label: '✓ Approved', className: 'is-approved' },
  PENDING: { label: '⏳ In review', className: 'is-pending' },
  REJECTED: { label: '✕ Rejected', className: 'is-rejected' },
  PAUSED: { label: '⏸ Paused', className: 'is-rejected' },
  DISABLED: { label: '⛔ Disabled', className: 'is-rejected' },
};

/** Plain-language meaning of Meta's rejection codes. */
const REJECTION_HELP: Record<string, string> = {
  INVALID_FORMAT: 'Something in the layout broke Meta’s rules — often a variable at the start/end, or variables side by side.',
  TAG_CONTENT_MISMATCH: 'The text does not match the category. Promotional text must be Marketing, not Utility.',
  PROMOTIONAL: 'Meta saw promotion in it. Submit it as Marketing.',
  ABUSIVE_CONTENT: 'Meta found wording it considers misleading or harmful. Remove strong claims.',
  INCORRECT_CATEGORY: 'The category was wrong. Pick the other one.',
  SCAM: 'Meta thought it looked like a scam — check links and claims.',
};

export interface CardActions {
  onSend: () => void;
  onCampaign: () => void;
  onAutomation: () => void;
  onButtonAutomations: () => void;
  onFix: () => void;
  onEdit: () => void;
  onRetryTest: (t: TemplateAutoTest) => void;
  retrying: boolean;
}

/** One template with its approval status and the next step that makes sense for it. */
export function MetaTemplateCard({
  template: t,
  test,
  actions,
}: {
  template: StudioTemplate;
  test?: TemplateAutoTest;
  actions: CardActions;
}) {
  const status = STATUS[t.status] ?? { label: t.status, className: '' };
  const price = templatePrice(t.category);

  return (
    <article className={`wt-card ${status.className}`}>
      <header className="wt-card-head">
        <div>
          <h3 className="wt-name">{t.name}</h3>
          <span className="mt-help">
            {t.language} · {t.category.toLowerCase()} · {price.perMessage}
          </span>
        </div>
        <div className="wt-head-right">
          <span className={`wt-status ${status.className}`}>{status.label}</span>
          {/* Meta allows editing approved, rejected and paused templates; not one still in review. */}
          {t.id && t.status !== 'PENDING' && t.status !== 'DISABLED' && (
            <button className="btn-link" onClick={actions.onEdit} aria-label={`Edit ${t.name}`}>
              <PencilLine size={14} /> Edit
            </button>
          )}
        </div>
      </header>

      <p className="wt-body">{t.headerText ? `${t.headerText}\n` : ''}{t.bodyText}</p>
      {t.buttons.length > 0 && (
        <div className="wt-buttons">
          {t.buttons.map((b, i) => (
            <span key={i} className="wt-btn-chip">
              {b.text || 'Copy offer code'}
            </span>
          ))}
        </div>
      )}

      {t.status === 'APPROVED' && (
        <div className="wt-next">
          <span className="wt-next-title">Ready! What do you want to do?</span>
          <div className="wt-actions">
            <button className="btn btn-primary" onClick={actions.onCampaign}>
              <Megaphone size={15} /> Send to many people
            </button>
            <button className="btn btn-secondary" onClick={actions.onSend}>
              <Send size={15} /> Send to one number
            </button>
            {t.buttons.some(b => b.type === 'QUICK_REPLY') && (
              <button className="btn btn-secondary" onClick={actions.onButtonAutomations}>
                <Zap size={15} /> Button automations
              </button>
            )}
            <button className="btn btn-secondary" onClick={actions.onAutomation}>
              <Workflow size={15} /> Send from a workflow
            </button>
          </div>
          <span className="mt-help">{price.free}</span>
        </div>
      )}

      {t.status === 'PENDING' && (
        <div className="wt-next">
          <span className="wt-next-title">
            <Clock size={14} /> Meta is reviewing it
          </span>
          <span className="mt-help">
            Usually a few minutes, at most 24 hours. This page checks again every minute — you can leave it open.
          </span>
        </div>
      )}

      {(t.status === 'REJECTED' || t.status === 'PAUSED' || t.status === 'DISABLED') && (
        <div className="wt-next wt-next-bad">
          <span className="wt-next-title">
            <XCircle size={14} /> {t.status === 'REJECTED' ? 'Not approved' : 'Not usable right now'}
          </span>
          <span className="mt-help">
            {t.status === 'REJECTED'
              ? (REJECTION_HELP[t.rejectedReason ?? ''] ?? `Meta's reason: ${t.rejectedReason ?? 'not given'}.`)
              : 'Meta stopped it because people blocked or reported it. Make a new, softer version.'}
          </span>
          <div className="wt-actions">
            {t.id && t.status !== 'DISABLED' && (
              <button className="btn btn-primary" onClick={actions.onEdit}>
                <PencilLine size={15} /> Edit and resubmit
              </button>
            )}
            <button className="btn btn-secondary" onClick={actions.onFix}>
              <PencilLine size={15} /> Make a new copy
            </button>
          </div>
        </div>
      )}

      {test && (
        <p className={`mt-status ${test.state === 'sent' ? 'is-sent' : test.state === 'waiting' ? '' : 'is-warn'}`}>
          📱 Test to {test.phone}:{' '}
          {test.state === 'waiting' ? 'will be sent when approved (only if free).' : test.note}{' '}
          {test.state === 'not_sent' && (
            <button className="btn-link" disabled={actions.retrying} onClick={() => actions.onRetryTest(test)}>
              {actions.retrying ? 'Checking…' : 'Try again'}
            </button>
          )}
        </p>
      )}
    </article>
  );
}
