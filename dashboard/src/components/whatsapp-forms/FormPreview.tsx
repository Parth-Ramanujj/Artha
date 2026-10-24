import type { FormComponent, FormScreen } from '../../types/whatsappForm';

interface FormPreviewProps {
  screen: FormScreen | undefined;
  isLast: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** A phone-sized picture of one screen. Clicking a component selects it for editing. */
export function FormPreview({ screen, isLast, selectedId, onSelect }: FormPreviewProps) {
  const components = screen?.components ?? [];
  return (
    <div className="wf-phone" aria-label="Screen preview">
      <div className="wf-phone-header">{screen?.title || 'Untitled screen'}</div>
      <div className="wf-phone-body">
        {components.length === 0 && <p className="wf-phone-empty">No fields added to this screen yet.</p>}
        {components.map(c => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            aria-pressed={c.id === selectedId}
            className={`wf-preview-item${c.id === selectedId ? ' is-selected' : ''}`}
            onClick={() => onSelect(c.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
          >
            <PreviewComponent component={c} />
          </div>
        ))}
      </div>
      <div className="wf-phone-footer">
        <span className="wf-phone-button">{isLast ? 'Submit' : 'Continue'}</span>
      </div>
    </div>
  );
}

function PreviewComponent({ component: c }: { component: FormComponent }) {
  if (c.type === 'heading') return <h4 className="wf-preview-heading">{c.text || 'Heading'}</h4>;
  if (c.type === 'text') return <p className="wf-preview-text">{c.text || 'Text'}</p>;
  if (c.type === 'image') {
    return c.src ? (
      <img className="wf-preview-image" src={`data:image/jpeg;base64,${c.src}`} alt="" />
    ) : (
      <div className="wf-preview-image-empty">Upload an image</div>
    );
  }

  const label = (
    <span className="wf-preview-label">
      {c.label || 'Untitled field'}
      {c.required && <span className="wf-required"> *</span>}
    </span>
  );
  switch (c.type) {
    case 'short_text':
      return (
        <label className="wf-preview-field">
          {label}
          <input disabled placeholder="Type here" />
        </label>
      );
    case 'paragraph':
      return (
        <label className="wf-preview-field">
          {label}
          <textarea disabled rows={2} placeholder="Type here" />
        </label>
      );
    case 'dropdown':
      return (
        <label className="wf-preview-field">
          {label}
          <select disabled>
            <option>{c.options?.[0]?.title || 'Choose'}</option>
          </select>
        </label>
      );
    case 'radio':
    case 'checkbox':
      return (
        <fieldset className="wf-preview-field">
          <legend>{label}</legend>
          {(c.options ?? []).map(o => (
            <label key={o.id} className="wf-preview-choice">
              <input type={c.type === 'radio' ? 'radio' : 'checkbox'} disabled /> {o.title || 'Option'}
            </label>
          ))}
        </fieldset>
      );
    case 'date':
      return (
        <label className="wf-preview-field">
          {label}
          <input type="date" disabled />
        </label>
      );
    case 'opt_in':
      return (
        <label className="wf-preview-choice">
          <input type="checkbox" disabled /> {c.label || 'I agree'}
          {c.required && <span className="wf-required"> *</span>}
        </label>
      );
    default:
      return null;
  }
}
