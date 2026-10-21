import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutNodes } from './autoLayout.ts';

test('a straight chain goes top to bottom, one node per row', () => {
  const pos = layoutNodes(
    [{ id: 't' }, { id: 'a' }, { id: 'b' }],
    [
      { source: 't', target: 'a' },
      { source: 'a', target: 'b' },
    ],
  );
  assert.ok(pos.t.y < pos.a.y && pos.a.y < pos.b.y);
  assert.equal(pos.t.y, 0);
});

test('branches sit side by side on the same row and never overlap', () => {
  const pos = layoutNodes(
    [{ id: 't' }, { id: 'x' }, { id: 'y' }, { id: 'z' }],
    [
      { source: 't', target: 'x' },
      { source: 't', target: 'y' },
      { source: 't', target: 'z' },
    ],
  );
  assert.equal(pos.x.y, pos.y.y);
  assert.equal(pos.y.y, pos.z.y);
  const xs = [pos.x.x, pos.y.x, pos.z.x];
  assert.equal(new Set(xs).size, 3);
  assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > 0, 'centred under the start');
});

test('a join node sits below every input (longest path)', () => {
  const pos = layoutNodes(
    [{ id: 't' }, { id: 'a' }, { id: 'b' }, { id: 'join' }],
    [
      { source: 't', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 't', target: 'join' },
      { source: 'b', target: 'join' },
    ],
  );
  assert.ok(pos.join.y > pos.b.y);
});

test('a cycle does not loop forever and every node gets a position', () => {
  const pos = layoutNodes(
    [{ id: 't' }, { id: 'a' }, { id: 'b' }],
    [
      { source: 't', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ],
  );
  assert.deepEqual(Object.keys(pos).sort(), ['a', 'b', 't']);
});

test('dangling edges to unknown nodes are ignored', () => {
  const pos = layoutNodes([{ id: 't' }], [{ source: 't', target: 'ghost' }]);
  assert.deepEqual(Object.keys(pos), ['t']);
});

test('a tall node pushes the row below it down so nothing overlaps', () => {
  const pos = layoutNodes(
    [
      { id: 't', width: 280, height: 150 },
      { id: 'menu', width: 280, height: 600 },
      { id: 'next', width: 280, height: 150 },
    ],
    [
      { source: 't', target: 'menu' },
      { source: 'menu', target: 'next' },
    ],
  );
  assert.ok(pos.next.y >= pos.menu.y + 600, 'next row starts below the tall menu');
});

test('siblings in a row keep their real widths apart', () => {
  const pos = layoutNodes(
    [
      { id: 't', width: 280, height: 150 },
      { id: 'a', width: 400, height: 150 },
      { id: 'b', width: 400, height: 150 },
    ],
    [
      { source: 't', target: 'a' },
      { source: 't', target: 'b' },
    ],
  );
  assert.ok(pos.b.x - pos.a.x >= 400, 'b starts after a finishes');
});

test('an empty canvas gives no positions', () => {
  assert.deepEqual(layoutNodes([], []), {});
});
