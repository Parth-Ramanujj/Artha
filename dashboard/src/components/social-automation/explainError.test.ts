import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainError, timeAgo } from './explainError.ts';

test('explains the errors users actually hit', () => {
  assert.match(explainError('The aspect ratio is not supported.').title, /shape/);
  assert.match(explainError('Invalid OAuth access token - Cannot parse access token').title, /token stopped/);
  assert.match(explainError('(#10) Application does not have permission for this action').title, /permission/);
  assert.match(
    explainError('DM failed: The account owner has disabled access to Instagram direct messages').title,
    /DMs/,
  );
  assert.match(explainError('Media fetch failed with status 403').title, /download/);
});

test('falls back to a generic explanation', () => {
  assert.equal(explainError('something odd').title, 'Meta returned an error');
  assert.equal(explainError(null).title, 'Meta returned an error');
});

test('timeAgo', () => {
  const now = Date.parse('2026-11-21T10:00:00Z');
  assert.equal(timeAgo('2026-11-21T09:59:50Z', now), 'just now');
  assert.equal(timeAgo('2026-11-21T09:55:00Z', now), '5 min ago');
  assert.equal(timeAgo('2026-11-21T07:00:00Z', now), '3 h ago');
  assert.equal(timeAgo('2026-11-21T12:00:00Z', now), 'in 2 h');
});
