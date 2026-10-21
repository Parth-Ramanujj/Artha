import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Plus } from 'lucide-react';
import { messageStudioApi } from '../../services/api';

export interface StudioStepConfig {
  studioMessageId?: string;
  studioMessageName?: string;
  waitForReply?: boolean;
  timeoutMinutes?: number;
}

interface StudioMessagePickerProps {
  config: StudioStepConfig;
  onChange: (patch: Record<string, unknown>) => void;
}

const linkRow = { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' } as const;

/** Inspector fields for a "Studio Message" step: which published message, and whether to wait. */
export function StudioMessagePicker({ config, onChange }: StudioMessagePickerProps) {
  const published = useQuery({ queryKey: ['message-studio', 'published'], queryFn: messageStudioApi.published });
  const messages = published.data ?? [];
  const selected = messages.find(m => m.id === config.studioMessageId);
  const missing = Boolean(config.studioMessageId) && published.isSuccess && !selected;
  const choices = selected?.choices ?? [];

  const pick = (id: string) => {
    const m = messages.find(x => x.id === id);
    onChange({
      studioMessageId: id,
      studioMessageName: m?.name ?? '',
      studioKind: m?.kind ?? '',
      // Snapshot of the reply options: the canvas draws one branch per option.
      choices: m?.choices ?? [],
    });
  };

  return (
    <div className="wf-inspector-section">
      <div className="wf-field-group">
        <label className="wf-field-label" htmlFor="wf-studio-message">
          Message *
        </label>
        {published.isLoading ? (
          <span className="wf-field-hint">
            <Loader2 size={12} className="animate-spin" /> Loading published messages…
          </span>
        ) : (
          <select
            id="wf-studio-message"
            className="wf-field-select"
            value={config.studioMessageId || ''}
            onChange={e => pick(e.target.value)}
          >
            <option value="">Choose a published message…</option>
            {messages.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {published.isError && <span className="wf-field-hint">Could not load Message Studio messages.</span>}
        {missing && (
          <span className="wf-field-hint" role="alert">
            "{config.studioMessageName || 'The selected message'}" is no longer published. Publish it again in Message
            Studio or choose another one.
          </span>
        )}
        {published.isSuccess && messages.length === 0 && (
          <span className="wf-field-hint">No published messages yet. Create one and publish it first.</span>
        )}
        <span className="wf-field-hint">
          Only published messages appear here. Variables such as {'{{trigger.contactName}}'} in the message are filled
          in when it is sent.
        </span>
        <div style={linkRow}>
          {selected && (
            <Link to={`/message-studio/${selected.id}`} className="wf-field-hint" target="_blank" rel="noreferrer">
              <ExternalLink size={12} /> Open in Message Studio
            </Link>
          )}
          <Link to="/message-studio/new" className="wf-field-hint" target="_blank" rel="noreferrer">
            <Plus size={12} /> Create a message
          </Link>
        </div>
      </div>

      {choices.length > 0 && (
        <div className="wf-field-group">
          <label className="wf-field-label">
            <input
              type="checkbox"
              checked={config.waitForReply !== false}
              onChange={e => onChange({ waitForReply: e.target.checked })}
            />{' '}
            Wait for the customer to choose
          </label>
          <span className="wf-field-hint">
            Each option ({choices.map(c => c.text).join(', ')}) gets its own branch on the canvas.
          </span>
          {config.waitForReply !== false && (
            <>
              <label className="wf-field-label" htmlFor="wf-studio-timeout">
                Stop waiting after (minutes)
              </label>
              <input
                id="wf-studio-timeout"
                type="number"
                min={1}
                max={10080}
                className="wf-field-input"
                value={config.timeoutMinutes ?? 60}
                onChange={e => onChange({ timeoutMinutes: Number(e.target.value) || 60 })}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
