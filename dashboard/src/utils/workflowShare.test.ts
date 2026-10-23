import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflowFile, toWorkflowFile, workflowFileName } from './workflowShare.ts';

const wf = {
  name: 'Sheet Report: AI Summary',
  description: 'desc',
  definition: {
    trigger: { type: 'keyword_match', config: { keyword: 'report' } },
    actions: [],
    nodes: [
      {
        id: 'node-mail',
        type: 'internal_alert',
        position: { x: 0, y: 0 },
        data: {
          label: 'Email',
          config: { emailTo: 'me@example.com', emailIntegrationId: 'abc', emailSubject: 'Report', templateMessage: 'Hi' },
        },
      },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b' }],
  },
};

test('export drops account and personal values but keeps the flow', () => {
  const file = toWorkflowFile(wf);
  const config = (file.definition.nodes as { data: { config: Record<string, unknown> } }[])[0].data.config;
  assert.equal(config.emailTo, '');
  assert.equal(config.emailIntegrationId, '');
  assert.equal(config.emailSubject, 'Report');
  assert.deepEqual(file.definition.edges, wf.definition.edges);
  assert.equal(wf.definition.nodes[0].data.config.emailTo, 'me@example.com', 'original untouched');
});

test('an exported file imports back', () => {
  const file = parseWorkflowFile(JSON.stringify(toWorkflowFile(wf)));
  assert.equal(file.name, wf.name);
});

test('other JSON is rejected with a clear message', () => {
  assert.throws(() => parseWorkflowFile('{"a":1}'), /not an exported workflow/);
  assert.throws(() => parseWorkflowFile('nope'), /not valid JSON/);
});

test('file names are safe', () => {
  assert.equal(workflowFileName('Sheet Report: AI Summary + Email'), 'sheet-report-ai-summary-email.workflow.json');
});
