import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_CARDS,
  PRESETS,
  allowedButtonActions,
  bodyLimit,
  cardAvailability,
  defaultContent,
  hasSampleText,
  issuesFor,
  moveItem,
  newButton,
  safeHttpsUrl,
  uniqueSlug,
} from './messageStudio.ts';

const WEB = { sessionId: 's', engine: 'whatsapp-web.js', connected: true, cloudApi: false, catalogConfigured: false };
const CLOUD = { ...WEB, engine: 'cloud-api', cloudApi: true };

test('there is a card for every requested message type', () => {
  assert.deepEqual(
    KIND_CARDS.map(c => c.title),
    [
      'Audio / Voice Note',
      'Sticker',
      'Address Request',
      'Location Request',
      'WhatsApp Flow',
      'Reaction',
      'Text Message',
      'Image + Caption',
      'Video Message',
      'Document / PDF',
      'Quick Reply Buttons',
      'Interactive List',
      'Product Card',
      'Product Catalog / Multi-Product',
      'Product Carousel',
      'Approved Template',
      'Location',
      'Contact Card',
    ],
  );
});

test('cards that need Cloud API, a catalog or a carousel template say so and offer an alternative', () => {
  const byId = Object.fromEntries(KIND_CARDS.map(c => [c.id, c]));
  assert.equal(cardAvailability(byId.text, WEB).available, true);
  assert.equal(cardAvailability(byId.template, WEB).available, false);
  assert.equal(cardAvailability(byId.template, CLOUD).available, true);
  assert.match(cardAvailability(byId.multi_product, CLOUD).reason ?? '', /catalog/);
  assert.equal(cardAvailability(byId.multi_product, { ...CLOUD, catalogConfigured: true }).available, true);
  assert.equal(cardAvailability(byId.carousel, WEB).available, false);
  assert.equal(cardAvailability(byId.carousel, CLOUD).available, true);
  assert.equal(byId.carousel.kind, 'template');
  for (const card of KIND_CARDS.filter(c => c.requires)) assert.ok(card.alternative, `${card.id} offers an alternative`);
});

test('button actions depend on the message type', () => {
  assert.deepEqual(allowedButtonActions('buttons'), ['quick_reply', 'talk_to_human', 'browse_products']);
  assert.ok(allowedButtonActions('image').includes('open_url'));
  assert.deepEqual(allowedButtonActions('location'), []);
  assert.equal(newButton('buttons', []).action, 'quick_reply');
  assert.equal(newButton('text', []).action, 'open_url');
});

test('uniqueSlug makes stable unique ids', () => {
  assert.equal(uniqueSlug('Book a demo!', []), 'book_a_demo');
  assert.equal(uniqueSlug('Yes', ['yes']), 'yes_2');
  assert.equal(uniqueSlug('Yes', ['yes', 'yes_2']), 'yes_3');
  assert.equal(uniqueSlug('हाँ', []), 'option');
});

test('moveItem reorders and ignores impossible moves', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], -1, 0), ['a', 'b']);
});

test('issuesFor matches a field and its children only', () => {
  const issues = [
    { field: 'buttons', message: 'a', severity: 'error' as const },
    { field: 'buttons.1', message: 'b', severity: 'error' as const },
    { field: 'buttonsX', message: 'c', severity: 'error' as const },
  ];
  assert.deepEqual(
    issuesFor(issues, 'buttons').map(i => i.message),
    ['a', 'b'],
  );
  assert.deepEqual(issuesFor(undefined, 'text'), []);
});

test('defaults and limits per type', () => {
  assert.equal(defaultContent('products', { productLayout: 'native' }).productLayout, 'native');
  assert.equal(defaultContent('buttons').buttons?.length, 2);
  assert.equal(bodyLimit('text', {}), 4096);
  assert.equal(bodyLimit('image', {}), 1024);
  assert.equal(bodyLimit('products', { productLayout: 'individual' }), 4096);
  assert.equal(bodyLimit('products', { productLayout: 'native' }), 1024);
});

test('presets cover the requested set and are marked as sample text', () => {
  assert.equal(PRESETS.length, 10);
  const welcome = PRESETS.find(p => p.key === 'welcome')!;
  assert.equal(hasSampleText(welcome.content), true);
  assert.equal(hasSampleText({ text: 'Hello' }), false);
  for (const p of PRESETS) assert.ok(p.todo.length > 0);
});

test('safeHttpsUrl only lets https links through', () => {
  assert.equal(safeHttpsUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('http://insecure.example.com'), null);
  assert.equal(safeHttpsUrl(''), null);
});
