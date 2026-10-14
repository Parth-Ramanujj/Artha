import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeUpstreamNodes,
  insertVariableToken,
  extractVariableReferences,
  validateWorkflow,
} from './workflowBuilderUtils.ts';

test('computeUpstreamNodes: returns only valid upstream ancestor nodes in a DAG', () => {
  // Graph: trigger -> extract -> http -> send
  const nodes = [
    { id: 'trigger', type: 'trigger', data: { label: 'WhatsApp Trigger' } },
    { id: 'extract', type: 'set_fields', data: { label: 'Extract Contact Details' } },
    { id: 'http', type: 'webhook_call', data: { label: 'HTTP Request' } },
    { id: 'send', type: 'send_message', data: { label: 'Send WhatsApp Message' } },
    { id: 'unrelated', type: 'send_message', data: { label: 'Unconnected Branch' } },
  ];

  const edges = [
    { source: 'trigger', target: 'extract' },
    { source: 'extract', target: 'http' },
    { source: 'http', target: 'send' },
  ];

  // Upstream of 'http' should be ['extract', 'trigger']
  const upstreamOfHttp = computeUpstreamNodes('http', nodes, edges);
  assert.equal(upstreamOfHttp.length, 2);
  const ids = upstreamOfHttp.map(n => n.id);
  assert.ok(ids.includes('extract'), 'Should include direct parent extract');
  assert.ok(ids.includes('trigger'), 'Should include grandparent trigger');
  assert.ok(!ids.includes('send'), 'Must NOT include downstream node send');
  assert.ok(!ids.includes('unrelated'), 'Must NOT include unrelated node');

  // Upstream of 'trigger' (root) should be empty
  const upstreamOfTrigger = computeUpstreamNodes('trigger', nodes, edges);
  assert.deepEqual(upstreamOfTrigger, []);
});

test('computeUpstreamNodes: safely handles circular cycles without infinite looping', () => {
  const nodes = [
    { id: 'n1', type: 'step' },
    { id: 'n2', type: 'step' },
  ];
  const edges = [
    { source: 'n1', target: 'n2' },
    { source: 'n2', target: 'n1' }, // Cycle
  ];

  const upstream = computeUpstreamNodes('n2', nodes, edges);
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].id, 'n1');
});

test('insertVariableToken: inserts at end when no cursor position is provided', () => {
  const result = insertVariableToken('Hello ', 'trigger.contact.name');
  assert.equal(result.text, 'Hello {{trigger.contact.name}}');
  assert.equal(result.nextCursor, 'Hello {{trigger.contact.name}}'.length);
});

test('insertVariableToken: preserves text before and after the exact cursor position', () => {
  const original = 'Hello , welcome back!';
  // Cursor is right between "Hello " and ", welcome" (index 6)
  const result = insertVariableToken(original, 'trigger.contact.name', 6, 6);
  assert.equal(result.text, 'Hello {{trigger.contact.name}}, welcome back!');
  assert.equal(result.nextCursor, 6 + '{{trigger.contact.name}}'.length);
});

test('insertVariableToken: cleanly replaces highlighted selection range', () => {
  const original = 'URL: https://api.com/users/PLACEHOLDER/details';
  const start = original.indexOf('PLACEHOLDER');
  const end = start + 'PLACEHOLDER'.length;

  const result = insertVariableToken(original, 'steps.http.output.userId', start, end);
  assert.equal(result.text, 'URL: https://api.com/users/{{steps.http.output.userId}}/details');
});

test('insertVariableToken: does not double wrap tokens that already have curly braces', () => {
  const result = insertVariableToken('Status: ', '{{trigger.message.id}}', 8, 8);
  assert.equal(result.text, 'Status: {{trigger.message.id}}');
});

test('insertVariableToken: supports multiple variables within a single string without clobbering', () => {
  let val = 'Name: ';
  let res = insertVariableToken(val, 'trigger.contact.name');
  val = res.text + ' | Phone: ';
  res = insertVariableToken(val, 'trigger.contact.phone');
  assert.equal(res.text, 'Name: {{trigger.contact.name}} | Phone: {{trigger.contact.phone}}');
});

test('extractVariableReferences: correctly finds and extracts all variable tokens in a template', () => {
  const text = 'Hello {{trigger.contact.name}}, your order {{steps.order.output.id}} is {{status}}!';
  const refs = extractVariableReferences(text);
  assert.deepEqual(refs, [
    'trigger.contact.name',
    'steps.order.output.id',
    'status',
  ]);
});

test('validateWorkflow: detects missing triggers, disconnected nodes, and unclosed expressions', () => {
  // Test empty workflow
  const emptyRes = validateWorkflow([], []);
  assert.equal(emptyRes.isValid, false);
  assert.ok(emptyRes.errors.some(e => e.message.includes('empty')));

  // Test workflow missing trigger
  const noTriggerNodes = [
    { id: 's1', type: 'send_message', data: { label: 'Send' } },
  ];
  const noTriggerRes = validateWorkflow(noTriggerNodes, []);
  assert.equal(noTriggerRes.isValid, false);
  assert.ok(noTriggerRes.errors.some(e => e.message.includes('WhatsApp Trigger')));

  // Test disconnected node warning
  const validNodes = [
    { id: 't1', type: 'trigger', data: { label: 'Trigger' } },
    { id: 's1', type: 'send_message', data: { label: 'Send', config: { message: 'Hi {{trigger.name}}' } } },
    { id: 'orphan', type: 'ai_assistant', data: { label: 'Isolated AI' } },
  ];
  const validEdges = [{ source: 't1', target: 's1' }];
  const warnRes = validateWorkflow(validNodes, validEdges);
  assert.ok(warnRes.errors.some(e => e.severity === 'warning' && e.message.includes('disconnected')));

  // Test unclosed variable expression error
  const brokenSyntaxNodes = [
    { id: 't1', type: 'trigger', data: { label: 'Trigger' } },
    { id: 's1', type: 'send_message', data: { label: 'Send', config: { message: 'Hi {{trigger.name' } } },
  ];
  const brokenRes = validateWorkflow(brokenSyntaxNodes, [{ source: 't1', target: 's1' }]);
  assert.equal(brokenRes.isValid, false);
  assert.ok(brokenRes.errors.some(e => e.message.includes('unclosed variable expression')));
});
