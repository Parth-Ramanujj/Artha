import type { Session } from '../../services/api';
import type { StudioCapabilities } from '../../types/messageStudio';

interface SessionSelectProps {
  sessions: Session[];
  value: string;
  onChange: (id: string) => void;
  capabilities?: StudioCapabilities;
}

/** Picks the WhatsApp number to check and test against, and says what it supports. */
export function SessionSelect({ sessions, value, onChange, capabilities }: SessionSelectProps) {
  if (sessions.length === 0) {
    return (
      <span className="ms-session-hint">No WhatsApp number connected yet — add one in Sessions to send tests.</span>
    );
  }
  const engine = capabilities?.cloudApi ? 'Cloud API' : capabilities ? 'WhatsApp Web' : '';
  return (
    <div className="ms-session">
      <label htmlFor="ms-session-select" className="ms-session-label">
        Check for
      </label>
      <select id="ms-session-select" className="ms-select" value={value} onChange={e => onChange(e.target.value)}>
        {sessions.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.status !== 'ready' ? ' (offline)' : ''}
          </option>
        ))}
      </select>
      {engine && (
        <span
          className={`ms-chip ${capabilities?.cloudApi ? 'ms-chip-success' : ''}`}
          title="What this number can send"
        >
          {engine}
          {capabilities?.cloudApi ? (capabilities.catalogConfigured ? ' · catalog' : ' · no catalog') : ''}
        </span>
      )}
    </div>
  );
}
