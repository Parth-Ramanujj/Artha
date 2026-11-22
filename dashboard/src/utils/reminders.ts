export interface DueItem {
  dueAt: string;
}

export interface ReminderGroups<T extends DueItem> {
  overdue: T[];
  today: T[];
  upcoming: T[];
}

/** Splits open reminders by the viewer's local day: before now, later today, and after today. */
export function groupReminders<T extends DueItem>(items: T[], now: Date): ReminderGroups<T> {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const groups: ReminderGroups<T> = { overdue: [], today: [], upcoming: [] };
  const sorted = [...items].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  for (const item of sorted) {
    const due = new Date(item.dueAt).getTime();
    if (due < now.getTime()) groups.overdue.push(item);
    else if (due <= endOfToday.getTime()) groups.today.push(item);
    else groups.upcoming.push(item);
  }
  return groups;
}

/** Snooze target: tomorrow at 10:00 local time. */
export function snoozeUntil(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(10, 0, 0, 0);
  return next;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deals saved only in the browser (offline fallback / demo data) have no server id and cannot carry reminders. */
export function isServerDealId(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID.test(id);
}

/** Value for <input type="datetime-local"> in the viewer's local time. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a datetime-local value (local time) to an ISO string, or null when blank or invalid. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
