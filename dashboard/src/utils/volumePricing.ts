export interface Tier {
  fromMessages: number;
  discountPercent: number;
}

/** Price of one message after a discount, rounded down to whole paise (the wallet does the same). */
export const discountedPaise = (ratePaise: number, pct: number): number => Math.floor((ratePaise * (100 - pct)) / 100);

/** Discount for the nth paid message of the month: the highest tier it has reached. */
export function tierDiscount(tiers: Tier[], nth: number): number {
  return Math.max(0, ...tiers.filter(t => nth >= t.fromMessages).map(t => t.discountPercent));
}

/** Cost of `volume` paid messages in one month when each message is charged at the tier it reached. */
export function monthCostPaise(volume: number, ratePaise: number, tiers: Tier[]): number {
  const starts = [1, ...tiers.map(t => t.fromMessages).filter(n => n > 1)].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < starts.length; i++) {
    const end = Math.min(volume, (starts[i + 1] ?? Infinity) - 1);
    if (end < starts[i]) continue;
    total += (end - starts[i] + 1) * discountedPaise(ratePaise, tierDiscount(tiers, starts[i]));
  }
  return total;
}
