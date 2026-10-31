import { useState } from 'react';
import { Send } from 'lucide-react';
import { Modal } from '../Modal';
import { libraryApi } from '../../services/api';
import type { LibraryItem, LibraryTarget } from '../../types/library';
import { TargetFields } from './TargetFields';
import { parseChats, runSummary } from './format';

/** Sends one post right away to Status and/or chats. */
export function PostNowModal({
  item,
  onClose,
  onDone,
}: {
  item: LibraryItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<LibraryTarget>({ sessionId: '', postToStatus: true, chatIds: [] });
  const [chats, setChats] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const chatIds = parseChats(chats);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await libraryApi.postNow(item.id, { ...target, chatIds });
      setResult(runSummary(run));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Post now: ${item.title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !target.sessionId || (!target.postToStatus && !chatIds.length)}
            onClick={() => void send()}
          >
            <Send size={14} /> {busy ? 'Posting…' : 'Post now'}
          </button>
        </>
      }
    >
      <div className="sa-form">
        <TargetFields value={target} chatsText={chats} onChange={setTarget} onChatsText={setChats} />
        {error && (
          <p className="sa-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="sa-notice" role="status">
            {result}
          </p>
        )}
      </div>
    </Modal>
  );
}
