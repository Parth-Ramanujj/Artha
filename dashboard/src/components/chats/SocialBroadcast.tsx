import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Modal } from '../Modal';
import { socialAutomationApi } from '../../services/api';
import type { SocialPlatform } from '../../types/socialAutomation';

/**
 * One message to every Instagram / Facebook customer who wrote in the last 24 hours. Meta allows business
 * messages only inside that window, so older customers are left out on purpose.
 */
export function SocialBroadcast({ platform, onSent }: { platform: SocialPlatform; onSent: () => void }) {
  const name = { instagram: 'Instagram', facebook: 'Facebook', telegram: 'Telegram', youtube: 'YouTube', x: 'X' }[platform];
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const show = () => {
    setOpen(true);
    setResult(null);
    setCount(null);
    socialAutomationApi
      .broadcastAudience(platform)
      .then(r => setCount(r.count))
      .catch(() => setCount(0));
  };

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const { queued } = await socialAutomationApi.broadcast(platform, text.trim());
      setResult(
        queued
          ? `Sending to ${queued} customer${queued > 1 ? 's' : ''}. Each message appears in its chat within a minute.`
          : 'Nobody wrote in the last 24 hours, so there is no one to send to right now.',
      );
      setText('');
      onSent();
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Broadcast failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={show}>
        <Megaphone size={14} /> Broadcast
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Broadcast on ${name}`}
        footer={
          <div className="sa-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={busy || !text.trim() || !count}>
              {busy ? 'Sending…' : `Send to ${count ?? '…'}`}
            </button>
          </div>
        }
      >
        <p className="social-broadcast-note">
          {count === null
            ? 'Counting customers…'
            : `${count} customer${count === 1 ? '' : 's'} wrote to you on ${name} in the last 24 hours and can receive this.`}{' '}
          {platform === 'telegram'
            ? 'Only chats from the last 24 hours are included.'
            : 'Meta only lets businesses message people within 24 hours of their last message, so older chats are skipped.'}
        </p>
        <label htmlFor="social-broadcast-text" className="social-broadcast-label">
          Message
        </label>
        <textarea
          id="social-broadcast-text"
          className="input"
          rows={4}
          maxLength={1000}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. Today only: 20% off on all products!"
        />
        {result && (
          <p className="social-broadcast-note" role="status">
            {result}
          </p>
        )}
      </Modal>
    </>
  );
}
