import { nextRunAt } from '../library/library-rules';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_DAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const REF_RE = /\[ref:([a-z0-9]{4,12})\]/i;

export const isValidTime = (v: string): boolean => TIME_RE.test(v);
export const isValidMonthDay = (v: string): boolean => MONTH_DAY_RE.test(v);

/** Next daily fire of `time` in `timezone` strictly after `after`. */
export function nextDaily(time: string, timezone: string, after: Date): Date | null {
  return nextRunAt({ kind: 'daily', time, timezone }, after);
}

/** The local calendar day of `now` in `timezone`: `YYYY-MM-DD` and its `MM-DD`. */
export function localDay(timezone: string, now: Date): { date: string; monthDay: string } {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return { date, monthDay: date.slice(5) };
}

/** UTC bounds of the local day containing `now`. */
export function localDayBounds(timezone: string, now: Date): { start: Date; end: Date } {
  const end = nextDaily('00:00', timezone, now) ?? new Date(now.getTime() + 86_400_000);
  // shortcut: assumes a 24h day, so on a DST-change day the window is off by an hour; fine for a summary.
  return { start: new Date(end.getTime() - 86_400_000), end };
}

export function fillName(template: string, name: string | null | undefined): string {
  return template.replace(/\{name\}/gi, (name ?? '').trim() || 'there').trim();
}

/** Digits of a typed phone number, or null when it cannot be a WhatsApp number. */
export function cleanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function parseRef(body: string | undefined): string | null {
  return REF_RE.exec(body ?? '')?.[1]?.toLowerCase() ?? null;
}

/** wa.me link with the tracking ref appended to the pre-filled text, so the first message carries it. */
export function waLink(phone: string, prefillText: string, ref: string): string {
  const text = `${prefillText.trim()} [ref:${ref}]`.trim();
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** Self-contained floating WhatsApp button; `href` is our own tracking redirect. */
export function widgetScript(href: string, label: string): string {
  const cfg = JSON.stringify({ href, label });
  return `(function(){var c=${cfg};if(document.getElementById('openwa-chat-btn'))return;
var a=document.createElement('a');a.id='openwa-chat-btn';a.href=c.href;a.target='_blank';a.rel='noopener';
a.setAttribute('aria-label',c.label);a.title=c.label;
a.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647;width:56px;height:56px;border-radius:50%;background:#25D366;box-shadow:0 4px 12px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center';
a.innerHTML='<svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.7-.1 1.3z"/></svg>';
(document.body||document.documentElement).appendChild(a);})();`;
}

export interface ComplianceStats {
  sent: number;
  failed: number;
  optIns: number;
  optOuts: number;
  /** Most messages sent in any single hour of the period. */
  peakPerHour: number;
}

/**
 * Estimated 0–100 sender health from what we can see locally. Not Meta's quality rating: failed
 * sends and opt-outs are the closest signals to blocks and reports, bursts are what trip spam checks.
 */
export function healthScore(s: ComplianceStats): {
  score: number;
  level: 'good' | 'watch' | 'risk';
  warnings: string[];
} {
  const warnings: string[] = [];
  let score = 100;
  const failedPct = s.sent ? (s.failed / s.sent) * 100 : 0;
  const optOutPct = s.sent ? (s.optOuts / s.sent) * 100 : 0;
  if (failedPct > 2) {
    score -= Math.min(35, Math.round(failedPct * 3));
    warnings.push(`${failedPct.toFixed(1)}% of messages failed. Remove wrong or inactive numbers from your lists.`);
  }
  if (optOutPct > 0.5) {
    score -= Math.min(35, Math.round(optOutPct * 10));
    warnings.push(
      `${optOutPct.toFixed(1)}% of people you messaged opted out. Send less often, or only to people who asked.`,
    );
  }
  if (s.peakPerHour > 200) {
    score -= Math.min(20, Math.round((s.peakPerHour - 200) / 20));
    warnings.push(`Up to ${s.peakPerHour} messages went out in one hour. Spread big sends over the day.`);
  }
  if (s.sent > 50 && s.optIns === 0) {
    score -= 10;
    warnings.push('No recorded opt-ins. Keep proof that customers agreed to hear from you.');
  }
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 80 ? 'good' : score >= 55 ? 'watch' : 'risk', warnings };
}

export interface SummaryFacts {
  date: string;
  newLeads: number;
  dealsWon: number;
  wonAmount: number;
  complaints: number;
  messagesIn: number;
  messagesOut: number;
  followUps: { name: string; reason: string }[];
}

export function formatSummaryFallback(f: SummaryFacts): string {
  const lines = [
    `*Today's business summary* (${f.date})`,
    '',
    `New leads: ${f.newLeads}`,
    `Deals won: ${f.dealsWon}${f.wonAmount ? ` (₹${f.wonAmount.toLocaleString('en-IN')})` : ''}`,
    `Complaints: ${f.complaints}`,
    `Messages: ${f.messagesIn} received, ${f.messagesOut} sent`,
  ];
  if (f.followUps.length) {
    lines.push('', '*Follow up tomorrow:*', ...f.followUps.map((u, i) => `${i + 1}. ${u.name} – ${u.reason}`));
  }
  return lines.join('\n');
}

export type VoiceIntent = 'lead' | 'booking' | 'complaint' | 'other';
const INTENTS: VoiceIntent[] = ['lead', 'booking', 'complaint', 'other'];

/** Reads `{"intent": "..."}` out of a model reply; anything unexpected becomes 'other'. */
export function parseIntent(content: string): VoiceIntent {
  try {
    const raw = (JSON.parse(/\{[\s\S]*\}/.exec(content)?.[0] ?? '{}') as { intent?: unknown }).intent;
    return INTENTS.includes(raw as VoiceIntent) ? (raw as VoiceIntent) : 'other';
  } catch {
    return 'other';
  }
}
