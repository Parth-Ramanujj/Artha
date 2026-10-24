import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Plus } from 'lucide-react';
import { whatsappFormApi } from '../../services/api';

export interface WhatsAppFormStepConfig {
  formId?: string;
  formName?: string;
  bodyText?: string;
  waitForSubmit?: boolean;
  timeoutMinutes?: number;
}

interface WhatsAppFormPickerProps {
  config: WhatsAppFormStepConfig;
  onChange: (patch: Record<string, unknown>) => void;
}

const linkRow = { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' } as const;

/** Inspector fields for a "WhatsApp Form" step: which published form, its message, and whether to wait. */
export function WhatsAppFormPicker({ config, onChange }: WhatsAppFormPickerProps) {
  const formsQuery = useQuery({ queryKey: ['whatsapp-forms'], queryFn: whatsappFormApi.list });
  const forms = (formsQuery.data ?? []).filter(f => f.status === 'published');
  const selected = forms.find(f => f.id === config.formId);
  const missing = Boolean(config.formId) && formsQuery.isSuccess && !selected;
  // Field names of the chosen form, so the hint can show the exact variables it provides.
  const fieldNames = (selected?.definition.screens ?? []).flatMap(s => s.components.map(c => c.name).filter(Boolean));

  return (
    <div className="wf-inspector-section">
      <div className="wf-field-group">
        <label className="wf-field-label" htmlFor="wf-whatsapp-form">
          Form *
        </label>
        {formsQuery.isLoading ? (
          <span className="wf-field-hint">
            <Loader2 size={12} className="animate-spin" /> Loading published forms…
          </span>
        ) : (
          <select
            id="wf-whatsapp-form"
            className="wf-field-select"
            value={config.formId || ''}
            onChange={e => {
              const form = forms.find(f => f.id === e.target.value);
              onChange({ formId: e.target.value, formName: form?.name ?? '' });
            }}
          >
            <option value="">Choose a published form…</option>
            {forms.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        {formsQuery.isError && <span className="wf-field-hint">Could not load WhatsApp Forms.</span>}
        {missing && (
          <span className="wf-field-hint" role="alert">
            "{config.formName || 'The selected form'}" is not published any more. Publish it again or choose another one.
          </span>
        )}
        {formsQuery.isSuccess && forms.length === 0 && (
          <span className="wf-field-hint">No published forms yet. Build one and publish it first.</span>
        )}
        <div style={linkRow}>
          {selected && (
            <Link to={`/whatsapp-forms/${selected.id}`} className="wf-field-hint" target="_blank" rel="noreferrer">
              <ExternalLink size={12} /> Open form
            </Link>
          )}
          <Link to="/whatsapp-forms/new" className="wf-field-hint" target="_blank" rel="noreferrer">
            <Plus size={12} /> Create a form
          </Link>
        </div>
      </div>

      <div className="wf-field-group">
        <label className="wf-field-label" htmlFor="wf-whatsapp-form-body">
          Message above the button
        </label>
        <textarea
          id="wf-whatsapp-form-body"
          className="wf-field-input"
          rows={3}
          maxLength={1024}
          value={config.bodyText ?? ''}
          placeholder={`Please fill in: ${config.formName || 'the form'}`}
          onChange={e => onChange({ bodyText: e.target.value })}
        />
        <span className="wf-field-hint">Variables such as {'{{trigger.contactName}}'} are filled in when it is sent.</span>
      </div>

      <div className="wf-field-group">
        <label className="wf-field-label">
          <input
            type="checkbox"
            checked={config.waitForSubmit !== false}
            onChange={e => onChange({ waitForSubmit: e.target.checked })}
          />{' '}
          Wait for the customer to submit
        </label>
        <span className="wf-field-hint">
          {fieldNames.length
            ? `After they submit, each answer is a variable: ${fieldNames.map(n => `{{${n}}}`).join(', ')}.`
            : 'After they submit, each answer is a variable named after its field, e.g. {{full_name}}.'}
        </span>
        {config.waitForSubmit !== false && (
          <>
            <label className="wf-field-label" htmlFor="wf-whatsapp-form-timeout">
              Stop waiting after (minutes)
            </label>
            <input
              id="wf-whatsapp-form-timeout"
              type="number"
              min={1}
              max={10080}
              className="wf-field-input"
              value={config.timeoutMinutes ?? 1440}
              onChange={e => onChange({ timeoutMinutes: Number(e.target.value) || 1440 })}
            />
          </>
        )}
      </div>
    </div>
  );
}
