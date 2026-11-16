import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyStorage } from './legacyStorage.ts';

function memoryStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

test('copies every openwa_ / openwa. key to its artha name', () => {
  const s = memoryStorage({
    openwa_api_key: 'k',
    openwa_sales_pipeline_deals: '[{"id":1}]',
    'openwa.messageStudio.sessionId': 's1',
    unrelated: 'x',
  });
  migrateLegacyStorage(s);
  assert.equal(s.map.get('artha_api_key'), 'k');
  assert.equal(s.map.get('artha_sales_pipeline_deals'), '[{"id":1}]');
  assert.equal(s.map.get('artha.messageStudio.sessionId'), 's1');
  assert.equal(s.map.get('openwa_api_key'), 'k', 'old key is kept');
  assert.equal(s.map.size, 7);
});

test('never overwrites a value already stored under the new name', () => {
  const s = memoryStorage({ openwa_theme: 'dark', artha_theme: 'light' });
  migrateLegacyStorage(s);
  assert.equal(s.map.get('artha_theme'), 'light');
});

test('does nothing when there are no old keys', () => {
  const s = memoryStorage({ artha_language: 'gu' });
  migrateLegacyStorage(s);
  assert.deepEqual([...s.map.entries()], [['artha_language', 'gu']]);
});
