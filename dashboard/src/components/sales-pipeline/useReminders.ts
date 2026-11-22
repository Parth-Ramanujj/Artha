import { useCallback, useEffect, useState } from 'react';
import { remindersApi, type ReminderRecord } from '../../services/api';
import { useToast } from '../Toast';
import { snoozeUntil } from '../../utils/reminders';

const REFRESH_MS = 60_000;
const errorText = (e: unknown) => (e instanceof Error && e.message) || 'Network error';

export type NewReminder = Parameters<typeof remindersApi.create>[0];

/** Open reminders for the business, refreshed every minute so auto-raised ones appear without a reload. */
export function useReminders() {
  const toast = useToast();
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReminders((await remindersApi.list({ status: 'open' })) ?? []);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>, done: string): Promise<boolean> => {
    try {
      await action();
      toast.success(done);
      await load();
      return true;
    } catch (e) {
      toast.error('Reminder not saved', errorText(e));
      return false;
    }
  };

  return {
    reminders,
    loading,
    error,
    reload: load,
    create: (data: NewReminder) => run(() => remindersApi.create(data), 'Reminder added'),
    complete: (id: string) => run(() => remindersApi.update(id, { status: 'done' }), 'Reminder done'),
    snooze: (id: string) =>
      run(
        () => remindersApi.update(id, { dueAt: snoozeUntil(new Date()).toISOString() }),
        'Snoozed to tomorrow 10:00',
      ),
    remove: (id: string) => run(() => remindersApi.delete(id), 'Reminder deleted'),
  };
}
