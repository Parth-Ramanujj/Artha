export const EXPIRY_UNITS = ['minutes', 'hours', 'days', 'never'] as const;
export type ExpiryUnit = (typeof EXPIRY_UNITS)[number];

const UNIT_MS: Record<Exclude<ExpiryUnit, 'never'>, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/**
 * ISO expiry for "valid for <amount> <unit>" from `now`; undefined for "never".
 * null when the amount is not a whole number ≥ 1 (the form keeps Create disabled then).
 */
export function expiresAtFrom(amount: string, unit: ExpiryUnit, now = Date.now()): string | undefined | null {
  if (unit === 'never') return undefined;
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1) return null;
  return new Date(now + n * UNIT_MS[unit]).toISOString();
}
