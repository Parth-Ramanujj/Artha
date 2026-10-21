import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepsToBubbles, triggerSuggestions, stepTraceLabel } from './simulatorMessages.ts';

test('a text message becomes a text bubble; an empty one adds nothing', () => {
  const bubbles = stepsToBubbles([
    { actionId: 'a', actionType: 'send_message', status: 'success', output: { text: 'Hello Asha' } },
    { actionId: 'b', actionType: 'send_message', status: 'success', output: {} },
  ]);
  assert.equal(bubbles.length, 1);
  assert.deepEqual(bubbles[0], { key: 'a', kind: 'text', text: 'Hello Asha' });
});

test('interactive buttons become a bubble with the button labels', () => {
  const [bubble] = stepsToBubbles([
    {
      actionId: 'menu',
      actionType: 'interactive_buttons',
      status: 'success',
      output: { message: 'Pick one', buttons: ['Insurance', 'Mutual Fund'] },
    },
  ]);
  assert.equal(bubble.kind, 'buttons');
  assert.equal(bubble.text, 'Pick one');
  assert.deepEqual(bubble.buttons, ['Insurance', 'Mutual Fund']);
});

test('a question prompt shows as a text bubble', () => {
  const [bubble] = stepsToBubbles([
    { actionId: 'q', actionType: 'ask_question', status: 'success', output: { question: 'Your pincode?' } },
  ]);
  assert.equal(bubble.text, 'Your pincode?');
});

test('sheets lookup shows the row when replied, else a found/not-found note', () => {
  const found = stepsToBubbles([
    { actionId: 's', actionType: 'sheets_lookup', status: 'success', output: { branch: 'found', rowText: 'Name: Asha' } },
  ]);
  assert.equal(found[0].text, 'Name: Asha');
  const notFound = stepsToBubbles([
    { actionId: 's', actionType: 'sheets_lookup', status: 'success', output: { branch: 'not_found' } },
  ]);
  assert.equal(notFound[0].kind, 'note');
  assert.match(notFound[0].text ?? '', /not found/i);
});

test('a failed step is shown as a warning note', () => {
  const [bubble] = stepsToBubbles([
    { actionId: 'x', actionType: 'send_message', status: 'failed', error: 'no session' },
  ]);
  assert.equal(bubble.kind, 'note');
  assert.match(bubble.text ?? '', /failed/i);
});

test('non-messaging steps and odd data add no bubbles and never throw', () => {
  assert.deepEqual(stepsToBubbles([{ actionType: 'filter', status: 'success' }]), []);
  assert.deepEqual(stepsToBubbles([{ actionType: 'set_fields' }, null, undefined]), []);
  assert.deepEqual(stepsToBubbles(null), []);
  assert.deepEqual(stepsToBubbles('nonsense'), []);
});

test('media steps carry their kind and caption', () => {
  const [bubble] = stepsToBubbles([
    { actionId: 'm', actionType: 'send_media', status: 'success', output: { mediaType: 'image', caption: 'See this' } },
  ]);
  assert.equal(bubble.kind, 'media');
  assert.equal(bubble.mediaKind, 'image');
  assert.equal(bubble.text, 'See this');
});

test('trigger suggestions come from keyword triggers, else friendly samples', () => {
  assert.deepEqual(
    triggerSuggestions([{ type: 'trigger', data: { config: { triggerType: 'keyword_match', keyword: 'hi, hello, start' } } }]),
    ['hi', 'hello', 'start'],
  );
  assert.deepEqual(triggerSuggestions([{ type: 'trigger', data: { config: { triggerType: 'message_received' } } }]), ['Hi', 'Hello']);
  assert.deepEqual(triggerSuggestions([]), ['Hi', 'Hello']);
});

test('step trace label is short and marks failures', () => {
  assert.deepEqual(stepTraceLabel({ actionType: 'send_message', status: 'success' }, 0), {
    label: '1. send message',
    ok: true,
  });
  assert.deepEqual(stepTraceLabel({ actionType: 'sheets_lookup', status: 'failed', output: { branch: 'not_found' } }, 2), {
    label: '3. sheets lookup → not_found',
    ok: false,
  });
});
