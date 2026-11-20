import { Plus, Trash2 } from 'lucide-react';
import type { MetaTemplateDraft } from '../../utils/metaTemplate';

type Button = MetaTemplateDraft['buttons'][number];

const TYPE_HELP: Record<Button['type'], string> = {
  QUICK_REPLY: 'Customer taps it and the text comes back to you as their reply.',
  URL: 'Opens a website, e.g. your registration form.',
  PHONE_NUMBER: 'Starts a phone call to your number.',
};

/** Edits a template's buttons; quick replies can carry the auto-reply sent when they are tapped. */
export function MetaTemplateButtons({
  buttons,
  onChange,
}: {
  buttons: Button[];
  onChange: (buttons: Button[]) => void;
}) {
  const update = (i: number, patch: Partial<Button>) => onChange(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <section className="ms-section" aria-labelledby="mt-buttons-heading">
      <h3 id="mt-buttons-heading" className="ms-section-title">
        Buttons <span className="ms-muted">(optional, up to 10)</span>
      </h3>
      {buttons.map((b, i) => (
        <fieldset key={i} className="ms-field" style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, padding: '0.75rem' }}>
          <legend className="ms-label">Button {i + 1}</legend>
          <div className="ms-row">
            <select
              className="ms-input"
              aria-label={`Button ${i + 1} type`}
              value={b.type}
              onChange={e => update(i, { type: e.target.value as Button['type'], value: '' })}
            >
              <option value="QUICK_REPLY">Quick reply</option>
              <option value="URL">Open website</option>
              <option value="PHONE_NUMBER">Call phone number</option>
            </select>
            <input
              className="ms-input"
              aria-label={`Button ${i + 1} text`}
              placeholder="Button text, e.g. Know More"
              maxLength={25}
              value={b.text}
              onChange={e => update(i, { text: e.target.value })}
            />
            <button className="ms-icon-btn" aria-label={`Remove button ${i + 1}`} onClick={() => onChange(buttons.filter((_, j) => j !== i))}>
              <Trash2 size={15} />
            </button>
          </div>
          <span className="ms-muted">{TYPE_HELP[b.type]}</span>
          {b.type !== 'QUICK_REPLY' && (
            <input
              className="ms-input"
              aria-label={`Button ${i + 1} ${b.type === 'URL' ? 'website link' : 'phone number'}`}
              placeholder={b.type === 'URL' ? 'https://yourwebsite.com/register' : '+919876543210'}
              value={b.value}
              onChange={e => update(i, { value: e.target.value.trim() })}
            />
          )}
          {b.type === 'QUICK_REPLY' && (
            <label className="ms-field">
              <span className="ms-label">Auto-reply when tapped (optional)</span>
              <textarea
                className="ms-input"
                rows={3}
                maxLength={4096}
                placeholder={`What should we send back when someone taps "${b.text || 'this button'}"?`}
                value={b.autoReply}
                onChange={e => update(i, { autoReply: e.target.value })}
              />
              <span className="ms-muted">We set this up for you as an automation. Leave empty to answer by hand.</span>
            </label>
          )}
        </fieldset>
      ))}
      {buttons.length < 10 && (
        <button
          className="btn btn-secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => onChange([...buttons, { type: 'QUICK_REPLY', text: '', value: '', autoReply: '' }])}
        >
          <Plus size={16} /> Add button
        </button>
      )}
    </section>
  );
}
