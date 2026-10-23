import { useQuery } from '@tanstack/react-query';
import { integrationApi } from '../../services/api';

type Connection = { id: string; type: string; name: string };

const EMAIL_TYPES = ['email_smtp', 'google_gmail'];

/** Picks the SMTP or Gmail connection a workflow step sends email through. */
export function EmailConnectionSelect({
  nodeId,
  value,
  onChange,
}: {
  nodeId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const integrations = useQuery({
    queryKey: ['integrations', 'list-for-email'],
    queryFn: async () => (await integrationApi.list()) as Connection[],
  });
  const connections = (integrations.data ?? []).filter(c => EMAIL_TYPES.includes(c.type));

  return (
    <div className="wf-field-group">
      <label className="wf-field-label" htmlFor={`email-conn-${nodeId}`}>
        Email connection
      </label>
      {!integrations.isLoading && connections.length === 0 ? (
        <p className="text-xs text-slate-400">
          No email connection yet. Add <strong>Email (SMTP)</strong> or <strong>Gmail</strong> under Integrations.
        </p>
      ) : (
        <select
          id={`email-conn-${nodeId}`}
          className="wf-field-select"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">Choose a connection…</option>
          {connections.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type === 'email_smtp' ? 'SMTP' : 'Gmail'})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
