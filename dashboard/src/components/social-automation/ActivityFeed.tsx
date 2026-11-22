import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Heart, MessageCircle, Play, Send, XCircle } from 'lucide-react';
import type { SocialCommentLog, SocialCommentRule, SocialPost } from '../../types/socialAutomation';
import { explainError, timeAgo } from './explainError';

type Kind = 'post' | 'comment';
type Tone = 'ok' | 'warn' | 'error' | 'info';

interface Event {
  id: string;
  kind: Kind;
  tone: Tone;
  at: string;
  title: string;
  lines: string[];
  error?: string | null;
  link?: string | null;
  retryId?: string;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'post', label: 'Posts' },
  { id: 'comment', label: 'Comments' },
  { id: 'problem', label: 'Problems' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);
const NAMES: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
};
const where = (p: string) => NAMES[p] ?? p;

function postEvent(p: SocialPost): Event {
  const base = { id: `p-${p.id}`, kind: 'post' as const, lines: p.caption ? [`"${clip(p.caption)}"`] : [] };
  switch (p.status) {
    case 'published':
      return { ...base, tone: 'ok', at: p.publishedAt || p.updatedAt, title: `Post published on ${where(p.platform)}`, link: p.permalink };
    case 'failed':
      return { ...base, tone: 'error', at: p.updatedAt, title: `Post could not be published on ${where(p.platform)}`, error: p.error, retryId: p.id };
    case 'publishing':
      return { ...base, tone: 'info', at: p.updatedAt, title: `Publishing to ${where(p.platform)}… (videos can take up to 3 minutes)` };
    case 'scheduled':
      return { ...base, tone: 'info', at: p.createdAt, title: `Post scheduled for ${p.scheduledAt ? new Date(p.scheduledAt).toLocaleString() : 'later'}`, retryId: p.id };
    default:
      return { ...base, tone: 'info', at: p.createdAt, title: 'Draft saved (not published)', retryId: p.id };
  }
}

function commentEvent(l: SocialCommentLog, rules: SocialCommentRule[]): Event {
  const who = `@${l.fromUserName || 'someone'}`;
  const base = { id: `c-${l.id}`, kind: 'comment' as const, at: l.createdAt, error: l.error };
  const lines = [`"${clip(l.commentText)}"`];
  if (l.status === 'ignored') {
    return { ...base, tone: 'warn', title: `${who} commented on ${where(l.platform)}. No rule matched, so no reply was sent`, lines: [...lines, 'Add these words to a rule if you want to answer comments like this.'] };
  }
  const rule = rules.find(r => r.id === l.ruleId);
  if (rule) lines.push(`Rule used: ${rule.name}`);
  if (l.replyText) lines.push(l.replied ? `Replied: "${clip(l.replyText)}"` : `Reply not sent: "${clip(l.replyText)}"`);
  if (rule?.autoDm && rule.autoDmTemplate) lines.push(l.error?.includes('DM failed') ? 'DM: not sent' : 'DM: sent to the customer');
  if (l.liked) lines.push('Comment liked');
  const tone: Tone = l.status === 'failed' ? 'error' : l.error ? 'warn' : 'ok';
  const title =
    tone === 'error' ? `${who} commented, but the auto-reply failed` : tone === 'warn' ? `${who} commented. Partly handled` : `${who} commented and was answered automatically`;
  return { ...base, tone, title, lines };
}

const TONE_ICON = { ok: CheckCircle2, warn: AlertCircle, error: XCircle, info: Clock };

interface ActivityFeedProps {
  posts: SocialPost[];
  logs: SocialCommentLog[];
  rules: SocialCommentRule[];
  onPublish: (postId: string) => void;
  /** Show only the newest few, without filters (Overview). */
  limit?: number;
}

export function ActivityFeed({ posts, logs, rules, onPublish, limit }: ActivityFeedProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const all = [...posts.map(postEvent), ...logs.map(l => commentEvent(l, rules))].sort((a, b) => b.at.localeCompare(a.at));
  const shown = (limit ? all : all.filter(e => (filter === 'all' ? true : filter === 'problem' ? e.tone === 'error' || e.tone === 'warn' : e.kind === filter))).slice(0, limit ?? 200);

  return (
    <div className="sa-activity">
      {!limit && (
        <div className="sa-activity-filters" role="group" aria-label="Filter activity">
          {FILTERS.map(f => (
            <button key={f.id} type="button" className={`sa-filter ${filter === f.id ? 'active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="sa-help sa-activity-empty">
          {filter === 'problem' ? 'No problems. Everything that ran went through fine.' : 'Nothing has happened yet. Publish a post or wait for a comment, and it will show up here within seconds.'}
        </p>
      ) : (
        <ol className="sa-activity-list">
          {shown.map(e => {
            const Icon = TONE_ICON[e.tone];
            const KindIcon = e.kind === 'post' ? Send : e.lines.some(x => x === 'Comment liked') ? Heart : MessageCircle;
            const help = e.error ? explainError(e.error) : null;
            return (
              <li key={e.id} className={`sa-event ${e.tone}`}>
                <Icon size={18} className="sa-event-icon" aria-label={e.tone} />
                <div className="sa-event-body">
                  <div className="sa-event-head">
                    <KindIcon size={13} aria-hidden="true" />
                    <strong>{e.title}</strong>
                    <time dateTime={e.at} title={new Date(e.at).toLocaleString()}>{timeAgo(e.at)}</time>
                  </div>
                  {e.lines.map(line => <p key={line}>{line}</p>)}
                  {help && (
                    <div className="sa-event-fix">
                      <strong>{help.title}.</strong> {help.fix}
                      <details>
                        <summary>Technical details</summary>
                        <code>{e.error}</code>
                      </details>
                    </div>
                  )}
                  {(e.link || e.retryId) && (
                    <div className="sa-actions">
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                          <ExternalLink size={12} /> View post
                        </a>
                      )}
                      {e.retryId && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPublish(e.retryId!)}>
                          <Play size={12} /> {e.tone === 'error' ? 'Try again' : 'Publish now'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {!limit && <p className="sa-help sa-activity-foot">Shows all posts and the latest 100 comments. Updates by itself every 20 seconds.</p>}
    </div>
  );
}
