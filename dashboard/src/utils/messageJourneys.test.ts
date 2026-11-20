import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WhatsAppLogEvent } from '../services/api';
import { buildJourneys, journeyStats, took } from './messageJourneys.ts';

let n = 0;
const ev = (kind: string, at: string, extra: Partial<WhatsAppLogEvent> = {}): WhatsAppLogEvent => ({
  id: String(++n),
  sessionId: 's1',
  kind,
  level: 'info',
  waMessageId: null,
  phone: '919601271988',
  summary: kind,
  details: null,
  createdAt: `2026-11-20T22:${at}Z`,
  ...extra,
});

test('journeys: a send and its status reports become one message, newest stage wins', () => {
  const { journeys, activity } = buildJourneys([
    ev('status.read', '25:48', { waMessageId: 'w1' }),
    ev('status.delivered', '24:50', {
      waMessageId: 'w1',
      details: { pricing: { category: 'marketing', billable: true } },
    }),
    ev('status.sent', '24:48', { waMessageId: 'w1' }),
    ev('send.accepted', '24:38', {
      waMessageId: 'w1',
      summary: 'Sent template “greeting” to 919601271988',
      details: { request: { type: 'template', template: { name: 'greeting' } } },
    }),
    ev('webhook.account_update', '20:00'),
  ]);
  assert.equal(journeys.length, 1);
  assert.deepEqual(
    {
      title: journeys[0].title,
      stage: journeys[0].stage,
      category: journeys[0].category,
      billable: journeys[0].billable,
    },
    { title: 'greeting', stage: 'read', category: 'marketing', billable: true },
  );
  assert.equal(took(journeys[0].startedAt, journeys[0].at.delivered), '12 s');
  assert.deepEqual(
    activity.map(a => a.kind),
    ['webhook.account_update'],
  );
});

test('journeys: failures keep the code, reason and fix; refused sends are journeys too', () => {
  const { journeys } = buildJourneys([
    ev('send.accepted', '00:01', { waMessageId: 'w2' }),
    ev('status.failed', '00:05', {
      waMessageId: 'w2',
      summary: 'Failed for 916352701839: (131042) Business eligibility payment issue',
      details: { errors: [{ code: 131042 }], explanation: { why: 'payment', fix: 'add a card' } },
    }),
    ev('send.rejected', '00:09', { summary: 'Meta refused the template “x” to 91: Invalid parameter' }),
  ]);
  const failed = journeys.find(j => j.waMessageId === 'w2')!;
  assert.deepEqual(failed.failure, {
    code: '131042',
    reason: '(131042) Business eligibility payment issue',
    why: 'payment',
    fix: 'add a card',
  });
  const refused = journeys.find(j => j.stage === 'refused')!;
  assert.equal(refused.failure?.reason, 'Invalid parameter');
  assert.deepEqual(journeyStats(journeys), { total: 2, delivered: 0, read: 0, failed: 2, pending: 0, deliveryRate: 0 });
});
