import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { SocialAccount, SocialCommentLog, SocialCommentRule, SocialOverview, SocialPost } from '../../types/socialAutomation';
import { explainError, timeAgo } from './explainError';

type Level = 'ok' | 'warn' | 'error' | 'wait';
export type HealthAction = 'connect' | 'accounts' | 'rules' | 'activity' | 'guide';

interface Check {
  level: Level;
  title: string;
  detail?: string;
  action?: { label: string; to: HealthAction };
}

interface HealthPanelProps {
  overview: SocialOverview | null;
  accounts: SocialAccount[];
  rules: SocialCommentRule[];
  logs: SocialCommentLog[];
  posts: SocialPost[];
  onAction: (to: HealthAction) => void;
}

const ICON = { ok: CheckCircle2, warn: AlertCircle, error: XCircle, wait: Clock };

type AccountMeta = { lastError?: string; webhookError?: string; messagesError?: string };

function meta(acc: SocialAccount): AccountMeta {
  try {
    return JSON.parse(acc.metadata || '{}') as AccountMeta;
  } catch {
    return {};
  }
}

/** Every condition that stops posting or auto-replies, worded for the shop owner, worst first. */
function healthChecks({ overview, accounts, rules, logs, posts }: Omit<HealthPanelProps, 'onAction'>): Check[] {
  const checks: Check[] = [];
  if (accounts.length === 0) {
    checks.push({
      level: 'error',
      title: 'No Instagram account connected yet',
      detail: 'Nothing can be posted or answered until an account is connected.',
      action: { label: 'Connect account', to: 'connect' },
    });
  }
  for (const acc of accounts) {
    const m = meta(acc);
    if (acc.status !== 'connected') {
      const e = explainError(m.lastError);
      checks.push({ level: 'error', title: `${acc.accountName}: ${e.title}`, detail: e.fix, action: { label: 'Open accounts', to: 'accounts' } });
    } else if (m.webhookError) {
      checks.push({
        level: 'warn',
        title: `${acc.accountName}: comment alerts are off`,
        detail: `Meta won't tell Artha about new comments. ${explainError(m.webhookError).fix}`,
        action: { label: 'Open accounts', to: 'accounts' },
      });
    } else if (m.messagesError) {
      checks.push({
        level: 'warn',
        title: `${acc.accountName}: DMs can't reach Artha`,
        detail: `Comments work, but Meta refused to send messages to this server. ${explainError(m.messagesError).fix}`,
        action: { label: 'Open accounts', to: 'accounts' },
      });
    } else {
      checks.push({ level: 'ok', title: `${acc.accountName} is connected (${acc.platform})` });
    }
  }
  const hook = overview?.webhook;
  if (hook?.lastUnmatched) {
    checks.push({
      level: 'error',
      title: `Meta sent a ${hook.lastUnmatched.platform} message for an account that isn't connected here (${timeAgo(hook.lastUnmatched.at)})`,
      detail: `It was for ID ${hook.lastUnmatched.accountId}. Connect that account, or fix the Instagram Business Account ID / Page ID on the existing one (Connected Accounts → Edit).`,
      action: { label: 'Open accounts', to: 'accounts' },
    });
  }
  if (accounts.length > 0 && hook && 'lastDelivery' in hook) {
    checks.push(
      hook.lastDelivery
        ? {
            level: 'ok',
            title: `Meta is reaching this server: last delivery ${timeAgo(hook.lastDelivery.at)}`,
            detail: `${hook.lastDelivery.object}: ${hook.lastDelivery.comments} comment(s), ${hook.lastDelivery.messages} message(s).`,
          }
        : {
            level: 'wait',
            title: `Meta hasn't sent anything to this server since it started ${timeAgo(hook.serverStartedAt)}`,
            detail: 'If you commented or sent a DM after that: in the Meta app, Webhooks → Instagram and Page must have "comments", "feed" and "messages" Subscribed, and the app must be Live. While the app has only Standard Access, Meta delivers DMs only from people who have a role on the app (add the tester under App roles → Roles → Instagram Testers).',
            action: { label: 'Open Setup Guide', to: 'guide' },
          },
    );
  }
  if (overview?.webhook && !overview.webhook.secretConfigured) {
    checks.push({
      level: 'error',
      title: 'META_APP_SECRET is not set on the server',
      detail: 'Every comment Meta sends is refused for safety. Add the App secret in your server settings (Render → Environment) and redeploy.',
      action: { label: 'How to fix', to: 'guide' },
    });
  } else if (overview?.webhook?.lastRejected?.reason === 'signature') {
    checks.push({
      level: 'error',
      title: `A comment from Meta was refused ${timeAgo(overview.webhook.lastRejected.at)}`,
      detail: "The App secret on the server doesn't match your Meta app. Copy the current App secret (Meta app → App settings → Basic) into META_APP_SECRET and redeploy.",
    });
  }
  if (!rules.some(r => r.enabled)) {
    checks.push({
      level: 'warn',
      title: 'No auto-reply rule is turned on',
      detail: 'Comments are recorded, but nobody gets a reply.',
      action: { label: 'Add a rule', to: 'rules' },
    });
  }
  if (accounts.length > 0) {
    checks.push(
      logs.length === 0
        ? {
            level: 'wait',
            title: 'Waiting for the first comment from Meta',
            detail: 'Comment on your post from a different Instagram account. If it does not appear in Activity within a minute: in the Meta app, Webhooks → Instagram → "comments" must be Subscribed, the app must be Live, and the Instagram account must be public.',
            action: { label: 'Open Setup Guide', to: 'guide' },
          }
        : { level: 'ok', title: `Comments are arriving: last one ${timeAgo(logs[0].createdAt)}` },
    );
  }
  const failed = posts.filter(p => p.status === 'failed').length;
  if (failed > 0) {
    checks.push({
      level: 'warn',
      title: `${failed} post${failed > 1 ? 's' : ''} failed to publish`,
      detail: 'Activity shows the reason and how to fix it.',
      action: { label: 'See activity', to: 'activity' },
    });
  }
  const order: Level[] = ['error', 'warn', 'wait', 'ok'];
  return checks.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
}

export function HealthPanel(props: HealthPanelProps) {
  const checks = healthChecks(props);
  const problems = checks.filter(c => c.level === 'error' || c.level === 'warn').length;
  const overall: Level = checks.some(c => c.level === 'error') ? 'error' : problems ? 'warn' : checks.some(c => c.level === 'wait') ? 'wait' : 'ok';
  const headline = {
    ok: 'Everything is working',
    wait: 'Set up. Waiting for activity',
    warn: `${problems} thing${problems > 1 ? 's' : ''} need${problems > 1 ? '' : 's'} attention`,
    error: `${problems} problem${problems > 1 ? 's' : ''} stop${problems > 1 ? '' : 's'} automation`,
  }[overall];
  const Head = ICON[overall];

  return (
    <section className={`sa-health ${overall}`} aria-label="Automation health">
      <h2 className="sa-health-head">
        <Head size={18} aria-hidden="true" /> {headline}
      </h2>
      <ul className="sa-health-list">
        {checks.map(c => {
          const Icon = ICON[c.level];
          return (
            <li key={c.title} className={`sa-health-item ${c.level}`}>
              <Icon size={16} aria-hidden="true" className="sa-health-icon" />
              <div className="sa-health-text">
                <strong>{c.title}</strong>
                {c.detail && <span>{c.detail}</span>}
              </div>
              {c.action && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => props.onAction(c.action!.to)}>
                  {c.action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
