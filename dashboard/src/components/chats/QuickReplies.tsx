import { useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cannedResponseApi, type CannedResponse } from '../../services/api';

interface QuickRepliesProps {
  /** The composer text; "/short" filters by shortcut like in WhatsApp chats. */
  draft: string;
  onPick: (content: string) => void;
}

/** Canned responses for the Instagram / Facebook composer: a button, or type "/" plus a shortcut. */
export function QuickReplies({ draft, onPick }: QuickRepliesProps) {
  const [items, setItems] = useState<CannedResponse[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if ((open || draft.startsWith('/')) && items === null) {
      cannedResponseApi
        .list({ limit: 100 })
        .then(setItems)
        .catch(() => setItems([]));
    }
  }, [open, draft, items]);

  const query = draft.startsWith('/') ? draft.slice(1).toLowerCase() : '';
  const slash = draft.startsWith('/') && !draft.includes(' ');
  const shown = (items ?? []).filter(
    c => !query || c.shortcut.toLowerCase().includes(query) || c.title.toLowerCase().includes(query),
  );
  const visible = open || slash;

  const pick = (c: CannedResponse) => {
    onPick(c.content);
    setOpen(false);
  };

  return (
    <div className="quick-replies">
      <button
        type="button"
        className="btn btn-secondary"
        aria-label="Quick replies"
        aria-expanded={visible}
        title="Quick replies (or type / and a shortcut)"
        onClick={() => setOpen(o => !o)}
      >
        <MessageSquareText size={16} />
      </button>
      {visible && (
        <div className="quick-replies-menu" role="listbox" aria-label="Quick replies">
          {items === null ? (
            <p>Loading…</p>
          ) : shown.length === 0 ? (
            <p>
              {items.length === 0 ? (
                <>
                  No quick replies yet. <Link to="/canned-responses">Create them in Canned Responses</Link>.
                </>
              ) : (
                'No quick reply matches.'
              )}
            </p>
          ) : (
            shown.slice(0, 20).map(c => (
              <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => pick(c)}>
                <strong>{c.title}</strong>
                <span>/{c.shortcut} · {c.content.slice(0, 80)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
