/** Comma-separated trigger keywords, trimmed and lower-cased. */
export function parseKeywords(raw: unknown): string[] {
  return (typeof raw === 'string' ? raw : '')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
}

/** Whole word or phrase, so the keyword "hi" matches "Hi there" but not "this" or "which". */
export function containsKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{M}\\p{N}])`, 'iu').test(text);
}
