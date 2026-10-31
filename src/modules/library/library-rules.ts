import type { LibrarySchedule } from './entities/library.entity';

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Offset (ms) of `timeZone` from UTC at the given instant; throws on an unknown zone. */
function zoneOffset(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant of a wall-clock time on a calendar day in `timeZone` (DST-safe: offset re-read at the result). */
function wallToUtc(timeZone: string, y: number, m: number, d: number, hour: number, minute: number): number {
  const guess = Date.UTC(y, m, d, hour, minute);
  const first = guess - zoneOffset(timeZone, guess);
  return guess - zoneOffset(timeZone, first);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Returns why a schedule is unusable, or null when it is fine. */
export function scheduleProblem(schedule: LibrarySchedule, now = new Date()): string | null {
  if (!isValidTimeZone(schedule.timezone)) return 'Unknown timezone';
  if (schedule.kind === 'once') {
    const at = new Date(schedule.at ?? '');
    if (Number.isNaN(at.getTime())) return 'Pick a date and time';
    if (at.getTime() <= now.getTime()) return 'The date and time must be in the future';
    return null;
  }
  if (!TIME_RE.test(schedule.time ?? '')) return 'Pick a time (HH:mm)';
  if (schedule.kind === 'weekly' && !(schedule.days ?? []).some(d => d >= 0 && d <= 6)) return 'Pick at least one day';
  return null;
}

/** Next time the schedule fires strictly after `after`, or null when it never fires again. */
export function nextRunAt(schedule: LibrarySchedule, after: Date): Date | null {
  if (schedule.kind === 'once') {
    const at = new Date(schedule.at ?? '');
    return at.getTime() > after.getTime() ? at : null;
  }
  const m = TIME_RE.exec(schedule.time ?? '');
  if (!m || !isValidTimeZone(schedule.timezone)) return null;
  const [hour, minute] = [Number(m[1]), Number(m[2])];
  const local = new Date(after.getTime() + zoneOffset(schedule.timezone, after.getTime()));
  const days = new Set(schedule.days ?? []);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    if (schedule.kind === 'weekly' && !days.has(day.getUTCDay())) continue;
    const at = wallToUtc(schedule.timezone, day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
    if (at > after.getTime()) return new Date(at);
  }
  return null;
}

/** Normalises a typed phone number or chat id; null when it is neither. */
export function toChatId(raw: string): string | null {
  const v = raw.trim();
  if (/^[\w.-]+@(c\.us|g\.us|s\.whatsapp\.net|newsletter)$/.test(v)) return v;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `${digits}@c.us` : null;
}
