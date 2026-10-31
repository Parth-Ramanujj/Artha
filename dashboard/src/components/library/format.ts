import type { LibraryRun, LibrarySchedule } from '../../types/library';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSchedule(s: LibrarySchedule): string {
  if (s.kind === 'once') return `Once, ${s.at ? new Date(s.at).toLocaleString() : '?'}`;
  if (s.kind === 'daily') return `Every day at ${s.time}`;
  return `${(s.days ?? []).map(d => DAYS[d]).join(', ')} at ${s.time}`;
}

export function runSummary(run: LibraryRun): string {
  const parts: string[] = [];
  if (run.postedToStatus) parts.push('posted to Status');
  if (run.sent) parts.push(`sent to ${run.sent} chat(s)`);
  if (run.skipped) parts.push(`${run.skipped} skipped (opted out)`);
  if (run.failed) parts.push(`${run.failed} failed`);
  const head = parts.length ? parts.join(', ') : 'Nothing was delivered';
  return run.error ? `${head}. Problems: ${run.error}` : `${head[0].toUpperCase()}${head.slice(1)}.`;
}

/** Splits a pasted list (lines, commas, semicolons) into numbers / chat ids. */
export function parseChats(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
