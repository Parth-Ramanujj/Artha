/**
 * Two WhatsApp limits a business runs into, in plain numbers:
 * - the messaging limit: how many different people may get a template message in a rolling 24 hours
 *   (Meta's tier: 250, 1K, 10K, 100K, unlimited);
 * - the free service tier: 1,000 delivered free-form replies per number per month, then charged.
 */

export const FREE_SERVICE_PER_MONTH = 1000;
export const TEMPLATE_CATEGORIES = [
  'marketing',
  'marketing_lite',
  'utility',
  'authentication',
  'authentication_international',
];

/** People per 24 h for Meta's `messaging_limit_tier`; null = unlimited or unknown. */
export function tierLimit(tier: string | null | undefined): number | null {
  const m = /^TIER_(\d+)(K)?$/i.exec(tier ?? '');
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

/** 100 = limit reached, 80 = close to it, null = fine (or no limit known). */
export function alertThreshold(used: number, limit: number | null): 80 | 100 | null {
  if (!limit) return null;
  if (used >= limit) return 100;
  if (used >= limit * 0.8) return 80;
  return null;
}

/** First moment of this month in India time (Meta counts the free tier by the account's time zone). */
export function monthStartIst(now = new Date()): Date {
  // shortcut: assumes the WhatsApp account's time zone is IST; read it from Meta if accounts abroad appear.
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600_000);
}

export interface UsageAlert {
  title: string;
  message: string;
}

export function dailyLimitAlert(level: 80 | 100, used: number, limit: number, phone: string): UsageAlert {
  return level === 100
    ? {
        title: `${phone}: daily messaging limit reached (${used}/${limit} people)`,
        message:
          'Template messages to new people will fail until the rolling 24 hours free up. Replies to people who messaged you still work. Keep quality high and Meta raises the limit automatically.',
      }
    : {
        title: `${phone}: ${used} of ${limit} people messaged in the last 24 hours`,
        message: `You are close to the daily messaging limit. Spread big campaigns over more days so the rest are not refused.`,
      };
}

export function freeServiceAlert(level: 80 | 100, used: number, phone: string): UsageAlert {
  return level === 100
    ? {
        title: `${phone}: the ${FREE_SERVICE_PER_MONTH} free replies for this month are used up`,
        message:
          'From now on every free-form reply (including AI chatbot answers) is charged by Meta until the 1st of next month. Keep a payment method in Meta, or replies stop.',
      }
    : {
        title: `${phone}: ${used} of ${FREE_SERVICE_PER_MONTH} free replies used this month`,
        message: 'After 1,000 delivered replies in a month Meta charges for each one, AI chatbot answers included.',
      };
}
