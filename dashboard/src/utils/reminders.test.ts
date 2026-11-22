import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromLocalInputValue, groupReminders, isServerDealId, snoozeUntil, toLocalInputValue } from './reminders.ts';

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi);

test('groupReminders splits by overdue, later today and after today, soonest first', () => {
  const now = at(2026, 11, 21, 12);
  const items = [
    { id: 'tomorrow', dueAt: at(2026, 11, 22, 9).toISOString() },
    { id: 'tonight', dueAt: at(2026, 11, 21, 23, 30).toISOString() },
    { id: 'yesterday', dueAt: at(2026, 11, 20, 9).toISOString() },
    { id: 'this-morning', dueAt: at(2026, 11, 21, 9).toISOString() },
  ];
  const g = groupReminders(items, now);
  assert.deepEqual(
    g.overdue.map(i => i.id),
    ['yesterday', 'this-morning'],
  );
  assert.deepEqual(
    g.today.map(i => i.id),
    ['tonight'],
  );
  assert.deepEqual(
    g.upcoming.map(i => i.id),
    ['tomorrow'],
  );
});

test('snoozeUntil is tomorrow 10:00 local', () => {
  const s = snoozeUntil(at(2026, 11, 30, 18));
  assert.equal(s.getDate(), 1);
  assert.equal(s.getMonth(), 11);
  assert.equal(s.getHours(), 10);
  assert.equal(s.getMinutes(), 0);
});

test('isServerDealId accepts only server UUIDs', () => {
  assert.equal(isServerDealId('3f2b1c4d-1111-4a2b-9c3d-123456789abc'), true);
  assert.equal(isServerDealId('deal-1732150000000'), false);
  assert.equal(isServerDealId('d1'), false);
  assert.equal(isServerDealId(null), false);
});

test('local input value round-trips through ISO', () => {
  const d = at(2026, 1, 5, 7, 4);
  const v = toLocalInputValue(d);
  assert.equal(v, '2026-01-05T07:04');
  assert.equal(fromLocalInputValue(v), d.toISOString());
  assert.equal(fromLocalInputValue(''), null);
  assert.equal(fromLocalInputValue('nope'), null);
});
