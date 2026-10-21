import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchLabel, describeConnections, edgesTouching, insertNodeOnEdge } from './edgeInsert.ts';

const nodes = [
  { id: 'trg', type: 'trigger', data: { label: 'Incoming Message' } },
  {
    id: 'menu',
    type: 'interactive_buttons',
    data: { label: 'Main Menu', config: { buttons: [{ id: 'insurance', text: 'Insurance' }] } },
  },
  { id: 'done', type: 'send_message', data: { label: 'Thanks' } },
];
const edges = [
  { id: 'e1', source: 'trg', target: 'menu', sourceHandle: null, targetHandle: null },
  { id: 'e2', source: 'menu', target: 'done', sourceHandle: 'insurance', targetHandle: 'in' },
];

test('a branch shows the customer-facing button text, a plain edge shows nothing', () => {
  assert.equal(branchLabel(edges[1], nodes), 'Insurance');
  assert.equal(branchLabel(edges[0], nodes), null);
});

test('describes what a step leads to and what leads into it', () => {
  const s = describeConnections('menu', nodes, edges);
  assert.deepEqual(s.incoming, [{ nodeId: 'trg', name: 'Incoming Message', via: null }]);
  assert.deepEqual(s.outgoing, [{ nodeId: 'done', name: 'Thanks', via: 'Insurance' }]);
});

test('inserting on an edge keeps the branch on the first half and the target on the second', () => {
  const newNode = { id: 'ask', type: 'ask_question', data: { label: 'Ask pincode' } };
  const r = insertNodeOnEdge(nodes, edges, 'e2', newNode);
  assert.ok(r);
  assert.equal(r.nodes.length, 4);
  const first = r.edges.find(e => e.target === 'ask')!;
  const second = r.edges.find(e => e.source === 'ask')!;
  assert.equal(first.source, 'menu');
  assert.equal(first.sourceHandle, 'insurance');
  assert.equal(second.target, 'done');
  assert.equal(second.targetHandle, 'in');
  assert.equal(r.edges.some(e => e.id === 'e2'), false, 'old edge removed');
});

test('an unknown edge or a duplicate node id changes nothing', () => {
  const newNode = { id: 'ask', type: 'ask_question', data: { label: 'Ask' } };
  assert.equal(insertNodeOnEdge(nodes, edges, 'nope', newNode), null);
  assert.equal(insertNodeOnEdge(nodes, edges, 'e2', { id: 'menu', type: 'send_message' }), null);
});

test('highlights only the edges touching the selected step', () => {
  assert.deepEqual([...edgesTouching('menu', edges)].sort(), ['e1', 'e2']);
  assert.equal(edgesTouching(null, edges).size, 0);
});
