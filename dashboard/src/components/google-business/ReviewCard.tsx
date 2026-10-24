import { useState } from 'react';
import { EyeOff, Send, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { googleBusinessApi } from '../../services/api';
import type { GbpReview } from '../../types/googleBusiness';

const STATUS_LABEL: Record<GbpReview['status'], string> = {
  new: 'not answered',
  pending_review: 'draft ready',
  replied: 'answered',
  failed: 'failed',
  skipped: 'skipped',
};

/** One review with its draft (editable) or the live answer. */
export function ReviewCard({
  review: r,
  run,
}: {
  review: GbpReview;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [text, setText] = useState(r.draft);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await run(fn);
    setBusy(false);
  };
  const open = r.status !== 'replied';

  return (
    <li className="sa-card">
      <div className="sa-card-head">
        <strong>{r.reviewerName || 'Google user'}</strong>
        <span aria-label={`${r.stars} of 5 stars`} style={{ color: '#f5a623', letterSpacing: 1 }}>
          {'★'.repeat(r.stars)}
          {'☆'.repeat(5 - r.stars)}
        </span>
        <span className="sa-chip">{STATUS_LABEL[r.status]}</span>
        {r.locationTitle && <span className="sa-chip">{r.locationTitle}</span>}
        {r.reviewedAt && <span className="sa-muted">{new Date(r.reviewedAt).toLocaleString()}</span>}
      </div>
      <p className="sa-body">{r.comment || <em className="sa-muted">Rating only, no text</em>}</p>

      {r.status === 'replied' && (
        <>
          <p className="sa-subject">
            Your reply
            {r.repliedBy === 'autopilot'
              ? ' (sent automatically)'
              : r.repliedBy === 'google'
                ? ' (sent outside this app)'
                : ''}
          </p>
          <p className="sa-body">{r.replyText}</p>
          <div className="sa-row-actions">
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Remove this reply from Google? It is kept here as a draft.')) {
                  void act(() => googleBusinessApi.deleteReply(r.id));
                }
              }}
            >
              <Trash2 size={14} /> Remove reply
            </button>
          </div>
        </>
      )}

      {open && r.status !== 'skipped' && (
        <>
          <label className="sa-form">
            <span className="sa-subject">Reply</span>
            <textarea
              className="input"
              rows={4}
              value={text}
              placeholder="Write a reply, or let the AI draft one"
              onChange={e => setText(e.target.value)}
            />
          </label>
          {r.error && <p className="sa-warn">{r.error}</p>}
          <div className="sa-row-actions">
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !text.trim()}
              onClick={() => void act(() => googleBusinessApi.publish(r.id, text))}
            >
              <Send size={14} /> Publish on Google
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const updated = await googleBusinessApi.redraft(r.id);
                  setText(updated.draft);
                })
              }
            >
              <Sparkles size={14} /> {text.trim() ? 'Rewrite with AI' : 'Draft with AI'}
            </button>
            {text !== r.draft && text.trim() && (
              <button
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => void act(() => googleBusinessApi.saveDraft(r.id, text))}
              >
                Save draft
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void act(() => googleBusinessApi.skip(r.id, true))}
            >
              <EyeOff size={14} /> Skip
            </button>
          </div>
        </>
      )}

      {r.status === 'skipped' && (
        <div className="sa-row-actions">
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void act(() => googleBusinessApi.skip(r.id, false))}
          >
            <Undo2 size={14} /> Answer after all
          </button>
        </div>
      )}
    </li>
  );
}
