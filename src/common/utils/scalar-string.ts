/**
 * Text of a loosely typed (JSON, spreadsheet) value. Strings, numbers and booleans are written as they
 * are; null/undefined give `fallback`; anything else (objects, arrays) is not text and gives ''
 * rather than "[object Object]".
 */
export function scalarToString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return '';
}
