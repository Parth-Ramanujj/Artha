import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLifecycleConditions, lifecycleFromConditions } from './followupLifecycle.ts';

const build = (over: Partial<Parameters<typeof buildLifecycleConditions>[0]>) =>
  buildLifecycleConditions({ existing: null, trigger: 'no_reply', message: 'Hi', dealStage: '', steps: [], ...over });

test('a plain rule sends no conditions, so saved ones stay untouched', () => {
  assert.equal(build({}), undefined);
  assert.equal(build({ existing: { chatIds: ['a'] } }), undefined);
});

test('stage and steps are added, first message leads the list, blanks dropped', () => {
  assert.deepEqual(build({ dealStage: 'proposal', steps: ['Two', '  ', 'Three '] }), {
    dealStage: 'proposal',
    messages: ['Hi', 'Two', 'Three'],
  });
});

test('other conditions are kept and cleared lifecycle keys are removed', () => {
  const existing = { chatIds: ['a'], dealStage: 'proposal', messages: ['Hi', 'Two'] };
  assert.deepEqual(build({ existing }), { chatIds: ['a'] });
  assert.deepEqual(build({ existing, dealStage: 'negotiation' }), { chatIds: ['a'], dealStage: 'negotiation' });
});

test('a trigger that cannot honour a stage drops it instead of sending a rule the API rejects', () => {
  assert.equal(build({ trigger: 'cart_abandoned', dealStage: 'proposal', steps: ['x'] }), undefined);
  assert.deepEqual(build({ trigger: 'cart_abandoned', existing: { dealStage: 'proposal' } }), {});
});

test('lifecycleFromConditions reads back stage and the steps after the first message', () => {
  assert.deepEqual(lifecycleFromConditions({ dealStage: 'proposal', messages: ['Hi', 'Two'] }), {
    dealStage: 'proposal',
    steps: ['Two'],
  });
  assert.deepEqual(lifecycleFromConditions(null), { dealStage: '', steps: [] });
});
