import { useSessionsQuery } from '../../hooks/queries';

/** "Send from" WhatsApp number picker shared by the Greetings and Summary tabs. */
export function SessionPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const sessions = useSessionsQuery().data ?? [];
  return (
    <label>
      Send from
      <select className="input" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">Choose a WhatsApp number…</option>
        {sessions.map(s => (
          <option key={s.id} value={s.id}>
            {s.name} {s.phone ? `(+${s.phone})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
