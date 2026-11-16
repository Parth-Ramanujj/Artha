import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FEATURE_IDS, isRouteAllowed } from './features.ts';

test('dashboard FEATURE_IDS match the API feature list', () => {
  const backend = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src', 'modules', 'auth', 'features.ts'),
    'utf8',
  );
  const block = backend.slice(backend.indexOf('FEATURE_CONTROLLER_PATHS = {'), backend.indexOf('} as const satisfies'));
  const backendIds = [...block.matchAll(/^ {2}(\w+): \[/gm)].map(m => m[1]);
  assert.deepEqual([...FEATURE_IDS].sort(), backendIds.sort());
});

test('isRouteAllowed: core routes always, feature routes only when approved, null = all', () => {
  assert.equal(isRouteAllowed('/sessions', []), true);
  assert.equal(isRouteAllowed('/campaigns', []), false);
  assert.equal(isRouteAllowed('/campaigns', ['campaigns']), true);
  assert.equal(isRouteAllowed('/campaign-analytics', ['campaigns']), true);
  assert.equal(isRouteAllowed('/ai-calling', ['campaigns']), false);
  assert.equal(isRouteAllowed('/ai-calling', null), true);
});
