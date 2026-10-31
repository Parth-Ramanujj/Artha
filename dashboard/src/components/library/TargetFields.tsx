import { useSessionsQuery } from '../../hooks/queries';
import type { LibraryTarget } from '../../types/library';
import { parseChats } from './format';

interface Props {
  value: LibraryTarget;
  chatsText: string;
  onChange: (value: LibraryTarget) => void;
  onChatsText: (text: string) => void;
}

/** Where a post goes: which number sends it, WhatsApp Status, and which chats. */
export function TargetFields({ value, chatsText, onChange, onChatsText }: Props) {
  const sessions = useSessionsQuery().data ?? [];
  const count = parseChats(chatsText).length;
  return (
    <fieldset>
      <legend>Where to post</legend>
      <label>
        WhatsApp number
        <select
          className="input"
          value={value.sessionId}
          onChange={e => onChange({ ...value, sessionId: e.target.value })}
        >
          <option value="">Choose a number</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.status === 'ready' ? '' : ` (${s.status})`}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-check">
        <input
          type="checkbox"
          checked={value.postToStatus}
          onChange={e => onChange({ ...value, postToStatus: e.target.checked })}
        />
        Post to my WhatsApp Status
      </label>
      <label>
        Also send as a message to (phone numbers with country code, or group ids; one per line)
        <textarea
          className="input"
          rows={4}
          placeholder={'919876543210\n919812345678\n1203630xxxxxxxx@g.us'}
          value={chatsText}
          onChange={e => onChatsText(e.target.value)}
        />
      </label>
      <p className="sa-help">
        {count ? `${count} chat(s). ` : ''}Messages go out a couple of seconds apart; contacts who opted out (DND) are
        skipped.
      </p>
    </fieldset>
  );
}
