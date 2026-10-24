import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { ChoiceOption, FormComponent } from '../../types/whatsappForm';
import { CHOICE_KINDS, IMAGE_MAX_BYTES, newId } from '../../utils/whatsappForm';

interface ComponentInspectorProps {
  component: FormComponent;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<FormComponent>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

const KIND_NAME: Record<FormComponent['type'], string> = {
  short_text: 'Short text input',
  paragraph: 'Paragraph',
  dropdown: 'Dropdown',
  radio: 'Radio buttons',
  checkbox: 'Checkboxes',
  date: 'Date picker',
  opt_in: 'Opt-in / consent',
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
};

/** Edits the selected component: its label, field name, options, or content. */
export function ComponentInspector({
  component: c,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onRemove,
}: ComponentInspectorProps) {
  return (
    <section className="wf-panel wf-inspector" aria-label="Selected component">
      <header className="wf-panel-head">
        <h3>{KIND_NAME[c.type]}</h3>
      </header>

      {c.type === 'heading' || c.type === 'text' ? (
        <label className="wf-field">
          <span>Text</span>
          <textarea rows={3} maxLength={c.type === 'heading' ? 80 : 4096} value={c.text ?? ''} onChange={e => onChange({ text: e.target.value })} />
        </label>
      ) : c.type === 'image' ? (
        <ImageField src={c.src} onChange={src => onChange({ src })} />
      ) : (
        <>
          <label className="wf-field">
            <span>Label</span>
            <input maxLength={120} value={c.label ?? ''} onChange={e => onChange({ label: e.target.value })} />
          </label>
          <label className="wf-field">
            <span>Field name</span>
            <input
              value={c.name ?? ''}
              onChange={e => onChange({ name: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
              aria-describedby="wf-name-help"
            />
            <small id="wf-name-help" className="wf-help">
              The key the answer is saved under. Letters, numbers and _ only; unique in the form.
            </small>
          </label>
          {c.type === 'short_text' && (
            <label className="wf-field">
              <span>Keyboard</span>
              <select value={c.inputType ?? 'text'} onChange={e => onChange({ inputType: e.target.value as FormComponent['inputType'] })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
              </select>
            </label>
          )}
          {c.type !== 'opt_in' && (
            <label className="wf-check">
              <input type="checkbox" checked={Boolean(c.required)} onChange={e => onChange({ required: e.target.checked })} /> Required
            </label>
          )}
          {CHOICE_KINDS.includes(c.type) && (
            <OptionsEditor options={c.options ?? []} onChange={options => onChange({ options })} />
          )}
        </>
      )}

      <div className="wf-inspector-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Move up">
          <ArrowUp size={14} />
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Move down">
          <ArrowDown size={14} />
        </button>
        <button type="button" className="btn btn-danger" onClick={onRemove}>
          <Trash2 size={14} /> Remove
        </button>
      </div>
    </section>
  );
}

function OptionsEditor({ options, onChange }: { options: ChoiceOption[]; onChange: (o: ChoiceOption[]) => void }) {
  const update = (id: string, title: string) => onChange(options.map(o => (o.id === id ? { ...o, title } : o)));
  return (
    <div className="wf-field">
      <span>Options (max 30 characters each)</span>
      {options.map((o, i) => (
        <div key={o.id} className="wf-option-row">
          <input
            aria-label={`Option ${i + 1}`}
            maxLength={30}
            value={o.title}
            onChange={e => update(o.id, e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            aria-label={`Remove option ${i + 1}`}
            disabled={options.length <= 1}
            onClick={() => onChange(options.filter(x => x.id !== o.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={() => onChange([...options, { id: newId(), title: `Option ${options.length + 1}` }])}>
        <Plus size={14} /> Add option
      </button>
    </div>
  );
}

function ImageField({ src, onChange }: { src?: string; onChange: (src: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Use a JPEG or PNG image');
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setError(`Images must be under ${IMAGE_MAX_BYTES / 1024} KB`);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  };
  return (
    <div className="wf-field">
      <label>
        <span>Image (JPEG or PNG, max {IMAGE_MAX_BYTES / 1024} KB)</span>
        <input type="file" accept="image/jpeg,image/png" onChange={e => pick(e.target.files?.[0])} />
      </label>
      {error && <small className="wf-error" role="alert">{error}</small>}
      {src && <img className="wf-preview-image" src={`data:image/jpeg;base64,${src}`} alt="Uploaded preview" />}
    </div>
  );
}
