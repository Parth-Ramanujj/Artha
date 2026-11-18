import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaCache } from './messageMediaCache.ts';

const setup = (max: number) => {
  const fetched: string[] = [];
  const revoked: string[] = [];
  const load = createMediaCache(
    async (_s, id) => {
      fetched.push(id);
      if (id === 'bad') throw new Error('404');
      return new Blob([id]);
    },
    () => `blob:${fetched[fetched.length - 1]}`,
    url => revoked.push(url),
    max,
  );
  return { load, fetched, revoked };
};

test('fetches each attachment once and re-uses its object URL', async () => {
  const { load, fetched } = setup(10);
  assert.equal(await load('s', 'a'), 'blob:a');
  assert.equal(await load('s', 'a'), 'blob:a');
  assert.deepEqual(fetched, ['a']);
});

test('evicts and revokes the least-recently-used URL past the cap', async () => {
  const { load, fetched, revoked } = setup(2);
  await load('s', 'a');
  await load('s', 'b');
  await load('s', 'a'); // touch a → b is now the oldest
  await load('s', 'c');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(revoked, ['blob:b']);
  await load('s', 'a'); // still cached
  assert.deepEqual(fetched, ['a', 'b', 'c']);
});

test('a failed fetch is not cached, so it can be retried', async () => {
  const { load, fetched } = setup(10);
  await assert.rejects(load('s', 'bad'));
  await new Promise(r => setImmediate(r));
  await assert.rejects(load('s', 'bad'));
  assert.deepEqual(fetched, ['bad', 'bad']);
});
