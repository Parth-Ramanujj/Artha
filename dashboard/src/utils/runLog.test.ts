import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactOf, matchesSearch, summarizeRun } from './runLog.ts';

const workflow = {
  name: 'Sheet Report',
  definition: {
    nodes: [
      { id: 'trg', type: 'trigger', data: { label: 'WhatsApp: report' } },
      { id: 'node-ai', type: 'ai_assistant', data: { label: 'AI Summary' } },
      { id: 'node-mail', type: 'internal_alert', data: { label: 'Email summary' } },
      { id: 'node-remind', type: 'schedule_followup', data: { label: 'Reminder' } },
    ],
  },
};

const failedRun = {
  workflowId: 'wf',
  chatId: '919876543210@c.us',
  status: 'failed',
  failureReason: 'Gmail API has not been used in project',
  triggerData: { contactName: 'Asha', messageBody: 'report' },
  steps: [
    {
      actionId: 'node-ai',
      actionType: 'ai_assistant',
      status: 'success',
      startedAt: '2026-10-24T10:00:00.000Z',
      completedAt: '2026-10-24T10:00:02.500Z',
    },
    { actionId: 'node-mail', actionType: 'internal_alert', status: 'failed', error: 'Gmail API has not been used' },
  ],
};

test('names the step that stopped the run, with its error', () => {
  const s = summarizeRun(failedRun, workflow);
  assert.deepEqual(s.stoppedAt, { label: 'Email summary', error: 'Gmail API has not been used' });
  assert.equal(s.steps[0].durationMs, 2500);
  assert.deepEqual(s.notRun, ['Reminder']);
  assert.equal(s.message, 'report');
});

test('a completed run has no stop point', () => {
  const s = summarizeRun({ ...failedRun, status: 'completed', steps: [failedRun.steps[0]] }, workflow);
  assert.equal(s.stoppedAt, null);
});

test('a run that failed before any step still says why', () => {
  const s = summarizeRun({ ...failedRun, steps: [] }, workflow);
  assert.deepEqual(s.stoppedAt, { label: 'Before the first step', error: failedRun.failureReason });
});

test('shows the name and real number, but hides internal @lid ids', () => {
  assert.equal(contactOf(failedRun), 'Asha · +919876543210');
  assert.equal(contactOf({ ...failedRun, chatId: '2367601@lid', triggerData: { contactName: 'Asha' } }), 'Asha');
});

test('search matches contact, message and error', () => {
  const s = summarizeRun(failedRun, workflow);
  assert.ok(matchesSearch(s, '98765'));
  assert.ok(matchesSearch(s, 'REPORT'));
  assert.ok(matchesSearch(s, 'gmail'));
  assert.ok(!matchesSearch(s, 'hello'));
});
