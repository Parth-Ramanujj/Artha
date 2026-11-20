/**
 * Approximate price Meta charges per delivered template message to an Indian (+91) number, in INR.
 * shortcut: hard-coded from Meta's India rate card (per-message pricing, mid-2025); Meta changes rates —
 * update here, or read them from Meta's pricing API, if the numbers drift.
 */
export const INDIA_TEMPLATE_RATES_INR: Record<string, number> = {
  MARKETING: 0.78,
  UTILITY: 0.12,
  AUTHENTICATION: 0.12,
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Price per message and, when recipients are known, the campaign total. */
export function templatePrice(category: string, recipients = 0): { perMessage: string; total?: string; free: string } {
  const rate = INDIA_TEMPLATE_RATES_INR[category.toUpperCase()] ?? INDIA_TEMPLATE_RATES_INR.MARKETING;
  // Since 1 Oct 2026 every template is charged inside the 24h window; only a Click-to-WhatsApp ad window is free.
  const free = 'Charged even inside the 24-hour window (free only for people who came from a Click-to-WhatsApp ad).';
  return {
    perMessage: `≈ ${inr(rate)} / message`,
    ...(recipients > 0 ? { total: `≈ ${inr(rate * recipients)} for ${recipients} people` } : {}),
    free,
  };
}
