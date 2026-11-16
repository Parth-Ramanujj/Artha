import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expiresAtFrom } from './expiry.ts';

const now = Date.parse('2026-01-01T00:00:00.000Z');

test('expiresAtFrom: minutes, hours and days from now', () => {
  assert.equal(expiresAtFrom('5', 'minutes', now), '2026-01-01T00:05:00.000Z');
  assert.equal(expiresAtFrom('2', 'hours', now), '2026-01-01T02:00:00.000Z');
  assert.equal(expiresAtFrom('30', 'days', now), '2026-01-31T00:00:00.000Z');
});

test('expiresAtFrom: never has no expiry', () => {
  assert.equal(expiresAtFrom('', 'never', now), undefined);
});

test('expiresAtFrom: rejects empty, zero, negative and fractional amounts', () => {
  for (const bad of ['', '0', '-1', '1.5', 'abc']) {
    assert.equal(expiresAtFrom(bad, 'minutes', now), null, bad);
  }
});
