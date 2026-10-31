import { nextRunAt, scheduleProblem, toChatId } from './library-rules';

describe('library schedule rules', () => {
  const tz = 'Asia/Kolkata'; // UTC+05:30

  it('daily: later today, else tomorrow, in the schedule timezone', () => {
    const s = { kind: 'daily' as const, time: '09:30', timezone: tz };
    // 03:00 UTC = 08:30 IST → today 09:30 IST = 04:00 UTC
    expect(nextRunAt(s, new Date('2026-11-02T03:00:00Z'))?.toISOString()).toBe('2026-11-02T04:00:00.000Z');
    // exactly at the run time → next day
    expect(nextRunAt(s, new Date('2026-11-02T04:00:00Z'))?.toISOString()).toBe('2026-11-03T04:00:00.000Z');
  });

  it('daily: local date differs from the UTC date', () => {
    // 20:00 UTC Nov 2 = 01:30 IST Nov 3 → 09:30 IST Nov 3
    const s = { kind: 'daily' as const, time: '09:30', timezone: tz };
    expect(nextRunAt(s, new Date('2026-11-02T20:00:00Z'))?.toISOString()).toBe('2026-11-03T04:00:00.000Z');
  });

  it('weekly: only on the picked days', () => {
    // 2026-11-02 is a Monday; pick Wednesday (3) and Friday (5)
    const s = { kind: 'weekly' as const, time: '18:00', days: [3, 5], timezone: tz };
    expect(nextRunAt(s, new Date('2026-11-02T03:00:00Z'))?.toISOString()).toBe('2026-11-04T12:30:00.000Z');
    expect(nextRunAt(s, new Date('2026-11-06T13:00:00Z'))?.toISOString()).toBe('2026-11-11T12:30:00.000Z');
  });

  it('handles a DST zone', () => {
    // New York leaves DST on 2026-11-01: 09:00 local is 13:00Z before, 14:00Z after
    const s = { kind: 'daily' as const, time: '09:00', timezone: 'America/New_York' };
    expect(nextRunAt(s, new Date('2026-10-31T12:00:00Z'))?.toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(nextRunAt(s, new Date('2026-11-01T12:00:00Z'))?.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('once: fires once, then never', () => {
    const s = { kind: 'once' as const, at: '2026-11-05T10:00:00Z', timezone: tz };
    expect(nextRunAt(s, new Date('2026-11-01T00:00:00Z'))?.toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(nextRunAt(s, new Date('2026-11-05T10:00:00Z'))).toBeNull();
  });

  it('rejects bad schedules', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    expect(scheduleProblem({ kind: 'once', at: '2026-10-01T00:00:00Z', timezone: tz }, now)).toMatch(/future/);
    expect(scheduleProblem({ kind: 'daily', time: '25:00', timezone: tz }, now)).toMatch(/time/);
    expect(scheduleProblem({ kind: 'weekly', time: '09:00', days: [], timezone: tz }, now)).toMatch(/day/);
    expect(scheduleProblem({ kind: 'daily', time: '09:00', timezone: 'Mars/Base' }, now)).toMatch(/timezone/);
    expect(scheduleProblem({ kind: 'daily', time: '09:00', timezone: tz }, now)).toBeNull();
  });

  it('normalises chat targets', () => {
    expect(toChatId('+91 98765-43210')).toBe('919876543210@c.us');
    expect(toChatId('120363012345678901@g.us')).toBe('120363012345678901@g.us');
    expect(toChatId('abc')).toBeNull();
  });
});
