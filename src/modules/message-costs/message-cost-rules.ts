/**
 * Approximate price Meta charges per delivered message to an Indian (+91) number, in INR.
 * shortcut: hard-coded from Meta's India rate card (per-message pricing, mid-2025), matching the
 * dashboard's templatePricing.ts; Meta's real bill (pricing_analytics) is shown next to it.
 */
export const INDIA_RATES_INR: Record<string, number> = {
  marketing: 0.78,
  marketing_lite: 0.78,
  utility: 0.12,
  authentication: 0.12,
  authentication_international: 0.12,
  service: 0,
};

/** Cost of one message as Meta reported it (0 when not billable or the category is free). */
export function estimateInr(category: string | null | undefined, billable: boolean | null | undefined): number {
  if (billable === false || !category) return 0;
  return INDIA_RATES_INR[category.toLowerCase()] ?? INDIA_RATES_INR.marketing;
}

export interface ChargeRow {
  chatId: string | null;
  category: string | null;
  pricingType: string | null;
  billable: boolean | null;
  status: string;
  errorCode: number | null;
  estimatedInr: number;
  createdAt: Date;
}

export interface CostSuggestion {
  id: 'marketing_share' | 'paid_in_window' | 'failed_numbers' | 'too_frequent' | 'no_replies';
  title: string;
  detail: string;
  /** Rough INR that could be saved over the same period (0 when it is about quality, not money). */
  savingInr: number;
  /** Phone numbers to act on (cleaned / excluded), at most 50. */
  numbers?: string[];
}

const DAY = 24 * 60 * 60 * 1000;
const phone = (chatId: string) => chatId.replace(/@.*$/, '');
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns the period's charges and incoming-message times into money-saving advice.
 * `incoming` maps chatId → sorted timestamps (ms) of messages the person sent us.
 */
export function buildCostSuggestions(
  charges: ChargeRow[],
  incoming: Map<string, number[]>,
  now = Date.now(),
): CostSuggestion[] {
  const out: CostSuggestion[] = [];
  const billable = charges.filter(c => c.billable && c.estimatedInr > 0);
  const marketing = billable.filter(c => (c.category ?? '').startsWith('marketing'));

  // 1. Paid for a template while the person's free 24h window was open.
  const paidInWindow = billable.filter(c => {
    if (!c.chatId) return false;
    const sent = c.createdAt.getTime();
    return (incoming.get(c.chatId) ?? []).some(t => t <= sent && sent - t < DAY);
  });
  if (paidInWindow.length) {
    const saving = paidInWindow.reduce((s, c) => s + c.estimatedInr, 0);
    out.push({
      id: 'paid_in_window',
      title: `${paidInWindow.length} paid messages went to people who had just messaged you`,
      detail:
        'Inside the 24-hour window a normal reply is free (and Utility templates are free too). Reply from Chats or skip these people in campaigns instead of sending a paid template.',
      savingInr: round(saving),
    });
  }

  // 2. Marketing is ~6x Utility: worth checking which are really updates.
  if (marketing.length) {
    const extra = marketing.length * ((INDIA_RATES_INR.marketing ?? 0) - (INDIA_RATES_INR.utility ?? 0));
    out.push({
      id: 'marketing_share',
      title: `${Math.round((marketing.length / billable.length) * 100)}% of paid messages are Marketing`,
      detail:
        'If any of these are updates about something the person already did (registration, order, appointment), write them as Utility templates — about 6× cheaper. Use “Check with AI” in the template builder.',
      savingInr: round(extra),
    });
  }

  // 3. Numbers that keep failing (not on WhatsApp, blocked, wrong number).
  const failedBy = new Map<string, number>();
  for (const c of charges)
    if (c.status === 'failed' && c.chatId) failedBy.set(c.chatId, (failedBy.get(c.chatId) ?? 0) + 1);
  const deadNumbers = [...failedBy.entries()].filter(([, n]) => n >= 2).map(([id]) => phone(id));
  if (deadNumbers.length) {
    out.push({
      id: 'failed_numbers',
      title: `${deadNumbers.length} numbers failed more than once`,
      detail:
        'They are probably not on WhatsApp or have blocked you. Remove them from your lists so campaigns finish faster and your number keeps a good quality rating.',
      savingInr: 0,
      numbers: deadNumbers.slice(0, 50),
    });
  }

  // 4. Too many marketing messages to the same person in the last 7 days.
  const weekAgo = now - 7 * DAY;
  const perPerson = new Map<string, number>();
  for (const c of marketing) {
    if (c.chatId && c.createdAt.getTime() >= weekAgo) perPerson.set(c.chatId, (perPerson.get(c.chatId) ?? 0) + 1);
  }
  const tooOften = [...perPerson.entries()].filter(([, n]) => n > 3);
  if (tooOften.length) {
    const extraMsgs = tooOften.reduce((s, [, n]) => s + (n - 3), 0);
    out.push({
      id: 'too_frequent',
      title: `${tooOften.length} people got more than 3 marketing messages this week`,
      detail: 'Meta limits marketing messages per person and people who get too many block you. Keep it to 2–3 a week.',
      savingInr: round(extraMsgs * (INDIA_RATES_INR.marketing ?? 0)),
      numbers: tooOften.map(([id]) => phone(id)).slice(0, 50),
    });
  }

  // 5. Paid 3+ times and never replied in the period.
  const paidBy = new Map<string, { n: number; inr: number }>();
  for (const c of billable) {
    if (!c.chatId) continue;
    const p = paidBy.get(c.chatId) ?? { n: 0, inr: 0 };
    paidBy.set(c.chatId, { n: p.n + 1, inr: p.inr + c.estimatedInr });
  }
  const silent = [...paidBy.entries()].filter(([id, p]) => p.n >= 3 && !(incoming.get(id) ?? []).length);
  if (silent.length) {
    out.push({
      id: 'no_replies',
      title: `${silent.length} people got 3+ paid messages and never replied`,
      detail: 'Pause them for a while or try a different message. Each further message to them is likely wasted money.',
      savingInr: round(silent.reduce((s, [, p]) => s + p.inr / p.n, 0)),
      numbers: silent.map(([id]) => phone(id)).slice(0, 50),
    });
  }

  return out.sort((a, b) => b.savingInr - a.savingInr);
}
