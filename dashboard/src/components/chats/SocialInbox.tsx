import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, MessageCircle, Send } from 'lucide-react';
import { socialAutomationApi } from '../../services/api';
import type { SocialMessage, SocialPlatform, SocialThread } from '../../types/socialAutomation';
import { explainError, timeAgo } from '../social-automation/explainError';
import { QuickReplies } from './QuickReplies';
import { SocialBroadcast } from './SocialBroadcast';
import { AttachButton, AttachmentPreview } from './SocialAttachment';
import './SocialInbox.css';

const POLL_MS = 5000;
const key = (t: { accountId: string; threadId: string }) => `${t.accountId}:${t.threadId}`;

interface SocialInboxProps {
  platform: SocialPlatform;
}

/** Instagram DMs or Facebook Messenger chats, read and answered from the Chats page. */
export function SocialInbox({ platform }: SocialInboxProps) {
  const name = { instagram: 'Instagram', facebook: 'Facebook', telegram: 'Telegram', youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn' }[platform];
  const [threads, setThreads] = useState<SocialThread[] | null>(null);
  const [hasAccount, setHasAccount] = useState(true);
  const [active, setActive] = useState<SocialThread | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const [list, accounts] = await Promise.all([socialAutomationApi.inbox(platform), socialAutomationApi.accounts()]);
      setThreads(list);
      setHasAccount(accounts.some(a => a.platform === platform));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load conversations');
      setThreads(t => t ?? []);
    }
  }, [platform]);

  const loadMessages = useCallback(async (t: SocialThread) => {
    try {
      setMessages(await socialAutomationApi.threadMessages(t.accountId, t.threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages');
    }
  }, []);

  useEffect(() => {
    setThreads(null);
    setActive(null);
    setMessages([]);
    setError(null);
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadThreads();
      if (active) void loadMessages(active);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, loadThreads, loadMessages]);

  useEffect(() => {
    // Braces matter: newer Chrome returns a Promise here, and React would treat it as a cleanup.
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const open = (t: SocialThread) => {
    setActive(t);
    setMessages([]);
    setError(null);
    void loadMessages(t);
  };

  const sendFile = async (file: { base64: string; mimetype: string; filename: string }) => {
    if (!active || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await socialAutomationApi.sendMedia(active.accountId, active.threadId, file);
      setMessages(m => [...m, sent]);
      void loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File not sent');
    } finally {
      setSending(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!active || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await socialAutomationApi.sendMessage(active.accountId, active.threadId, text);
      setMessages(m => [...m, sent]);
      setDraft('');
      void loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message not sent');
    } finally {
      setSending(false);
    }
  };

  const awaitingCount = (threads ?? []).filter(t => t.lastDirection === 'in').length;
  const q = search.trim().toLowerCase();
  const shownThreads = (threads ?? []).filter(
    t =>
      (!onlyAwaiting || t.lastDirection === 'in') &&
      (!q || (t.customerName ?? '').toLowerCase().includes(q) || t.lastText.toLowerCase().includes(q)),
  );

  // Our own messages (file too big, Instagram takes no documents) are clearer than the generic Meta wording.
  const explained = error ? explainError(error) : null;
  const help =
    explained && explained.title === 'Meta returned an error' ? { title: 'Not sent', fix: error ?? '' } : explained;
  const title = (t: SocialThread) => t.customerName || `${name} user ${t.threadId.slice(-4)}`;

  return (
    <div className={`social-inbox ${active ? 'has-active' : ''}`}>
      <aside className="social-inbox-list" aria-label={`${name} conversations`}>
        {help && !active && (
          <p className="social-inbox-error" role="alert">
            <strong>{help.title}.</strong> {help.fix}
          </p>
        )}
        {threads === null ? (
          <p className="social-inbox-empty"><Loader2 size={18} className="animate-spin" /> Loading conversations…</p>
        ) : !hasAccount ? (
          <p className="social-inbox-empty">
            No {name} account is connected. <Link to="/social-automation">Connect it in Social Automation</Link>, then messages appear here.
          </p>
        ) : threads.length === 0 ? (
          <p className="social-inbox-empty">
            {platform === 'telegram' ? (
              <>No Telegram messages yet. Open your bot in Telegram, press Start and send a message to test.</>
            ) : (
              <>
                No {name} messages yet. Send a DM to your {name === 'Instagram' ? 'Instagram account' : 'Facebook Page'} from another account to test.
                If nothing arrives within a minute: in the Meta app, Webhooks → {name === 'Instagram' ? 'Instagram' : 'Page'} → "messages" must be
                Subscribed, then press Test on the account in Social Automation.
              </>
            )}
          </p>
        ) : (
          <>
            <div className="social-inbox-tools">
              <input
                className="input"
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or message"
                aria-label="Search conversations"
              />
              <div className="social-inbox-tools-row">
              <label className="social-inbox-filter">
                <input type="checkbox" checked={onlyAwaiting} onChange={e => setOnlyAwaiting(e.target.checked)} />
                Awaiting reply ({awaitingCount})
              </label>
                <SocialBroadcast platform={platform} onSent={() => void loadThreads()} />
              </div>
            </div>
            {shownThreads.length === 0 ? (
              <p className="social-inbox-empty">No conversation matches.</p>
            ) : (
              <ul>
                {shownThreads.map(t => (
                  <li key={key(t)}>
                    <button type="button" className={active && key(active) === key(t) ? 'active' : ''} onClick={() => open(t)}>
                      <span className="social-inbox-avatar" aria-hidden="true">{title(t).replace('@', '').charAt(0).toUpperCase()}</span>
                      <span className="social-inbox-meta">
                        <strong>{title(t)}</strong>
                        <span>{t.lastDirection === 'out' ? 'You: ' : ''}{t.lastText}</span>
                      </span>
                      <span className="social-inbox-side">
                        <time dateTime={t.lastAt}>{timeAgo(t.lastAt)}</time>
                        {t.lastDirection === 'in' && (
                          <span className="social-inbox-awaiting" title="The customer is waiting for a reply">
                            Reply
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </aside>

      <section className="social-inbox-thread" aria-label="Conversation">
        {!active ? (
          <div className="social-inbox-placeholder">
            <MessageCircle size={40} aria-hidden="true" />
            <p>Select a conversation to read and reply.</p>
          </div>
        ) : (
          <>
            <header className="social-inbox-head">
              <button type="button" className="social-inbox-back" onClick={() => setActive(null)} aria-label="Back to conversations">
                <ArrowLeft size={18} />
              </button>
              <strong>{title(active)}</strong>
              <span>via {active.accountName}</span>
            </header>
            <div className="social-inbox-messages">
              {messages.map(m => (
                <div key={m.id} className={`social-bubble ${m.direction}`}>
                  {m.text && <p>{m.text}</p>}
                  {m.mediaUrl && <AttachmentPreview url={m.mediaUrl} />}
                  <time dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString()}>{timeAgo(m.createdAt)}</time>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {help && (
              <p className="social-inbox-error" role="alert">
                <strong>{help.title}.</strong> {help.fix}
              </p>
            )}
            <form className="social-inbox-composer" onSubmit={e => void send(e)}>
              <QuickReplies draft={draft} onPick={setDraft} />
              <AttachButton
                platform={platform}
                disabled={sending}
                onFile={file => void sendFile(file)}
                onError={setError}
              />
              <input
                className="input"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={`Reply on ${name}…`}
                aria-label="Message"
                maxLength={1000}
              />
              <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()} aria-label="Send">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
