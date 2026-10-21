import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ButtonAction, ReadinessIssue, StudioButton, StudioKind, StudioProduct } from '../../types/messageStudio';
import {
  BUTTON_ACTIONS,
  LIMITS,
  allowedButtonActions,
  issuesFor,
  moveItem,
  newButton,
  uniqueSlug,
} from '../../utils/messageStudio';
import { FieldIssues, TextField } from './fields';

interface ButtonBuilderProps {
  kind: StudioKind;
  buttons: StudioButton[];
  onChange: (buttons: StudioButton[]) => void;
  issues: ReadinessIssue[];
  products: StudioProduct[];
}

/** Reply ids that mean something to automations are fixed, so a hand-off branch keeps working. */
const FIXED_IDS: Partial<Record<ButtonAction, string>> = {
  talk_to_human: 'talk_to_human',
  browse_products: 'browse_products',
};

/** Centre panel: the buttons under the message, in order. */
export function ButtonBuilder({ kind, buttons, onChange, issues, products }: ButtonBuilderProps) {
  const actions = allowedButtonActions(kind);
  if (actions.length === 0) return null;
  const max = kind === 'buttons' ? LIMITS.replyButtons : 1;
  const others = (i: number) => buttons.filter((_, n) => n !== i).map(b => b.id);

  const update = (i: number, patch: Partial<StudioButton>) => {
    const current = buttons[i];
    const next = { ...current, ...patch };
    if (patch.action && FIXED_IDS[patch.action]) next.id = FIXED_IDS[patch.action]!;
    else if (patch.action && FIXED_IDS[current.action]) next.id = uniqueSlug(next.label, others(i));
    // The reply id follows the label until someone renames it on purpose.
    if (patch.label !== undefined && !FIXED_IDS[next.action] && current.id === uniqueSlug(current.label, others(i))) {
      next.id = uniqueSlug(patch.label, others(i));
    }
    onChange(buttons.map((b, n) => (n === i ? next : b)));
  };

  return (
    <section className="ms-builder" aria-labelledby="ms-buttons-heading">
      <div className="ms-builder-head">
        <h3 id="ms-buttons-heading" className="ms-section-title">
          {kind === 'buttons' ? 'Reply buttons' : 'Button (optional)'}
        </h3>
        <span className="ms-counter">
          {buttons.length} / {max}
        </span>
      </div>
      <FieldIssues issues={issuesFor(issues, 'buttons').filter(i => i.field === 'buttons')} />

      <ol className="ms-item-list">
        {buttons.map((b, i) => {
          const meta = BUTTON_ACTIONS[b.action];
          return (
            <li key={i} className="ms-item">
              <div className="ms-item-head">
                <span className="ms-item-num" aria-hidden="true">
                  {i + 1}
                </span>
                <select
                  className="ms-select"
                  aria-label={`Button ${i + 1} action`}
                  value={b.action}
                  onChange={e => update(i, { action: e.target.value as ButtonAction })}
                >
                  {actions.map(a => (
                    <option key={a} value={a}>
                      {BUTTON_ACTIONS[a].label}
                    </option>
                  ))}
                </select>
                <div className="ms-item-tools">
                  <button
                    type="button"
                    className="ms-icon-btn"
                    aria-label={`Move button ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => onChange(moveItem(buttons, i, i - 1))}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="ms-icon-btn"
                    aria-label={`Move button ${i + 1} down`}
                    disabled={i === buttons.length - 1}
                    onClick={() => onChange(moveItem(buttons, i, i + 1))}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="ms-icon-btn ms-danger"
                    aria-label={`Remove button ${i + 1}`}
                    onClick={() => onChange(buttons.filter((_, n) => n !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <TextField
                label="Button label"
                required
                max={LIMITS.buttonLabel}
                value={b.label}
                onChange={label => update(i, { label })}
              />
              {b.action === 'open_url' && (
                <TextField
                  label="Website link (https)"
                  required
                  type="url"
                  placeholder="https://"
                  value={b.url ?? ''}
                  onChange={url => update(i, { url })}
                />
              )}
              {b.action === 'view_product' && (
                <label className="ms-field">
                  <span className="ms-label">Product *</span>
                  <select
                    className="ms-select"
                    value={b.productId ?? ''}
                    onChange={e => update(i, { productId: e.target.value })}
                  >
                    <option value="">Choose a product…</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id} disabled={!p.productUrl}>
                        {p.name}
                        {p.productUrl ? '' : ' — no product link'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="ms-hint">
                {meta.help}
                {meta.reply && (
                  <>
                    {' '}
                    Reply id: <code>{b.id}</code>
                  </>
                )}
              </span>
              <FieldIssues issues={issuesFor(issues, `buttons.${i}`)} />
            </li>
          );
        })}
      </ol>

      {buttons.length < max && (
        <button
          type="button"
          className="btn btn-secondary ms-add"
          onClick={() => onChange([...buttons, newButton(kind, buttons)])}
        >
          <Plus size={14} /> Add button
        </button>
      )}
    </section>
  );
}
