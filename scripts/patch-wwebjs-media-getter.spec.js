'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  applyBackport,
  LEGACY_SEND_MESSAGE,
  PATCHED_SEND_MESSAGE,
  LEGACY_MESSAGE_OBJECT,
  PATCHED_MESSAGE_OBJECT,
  LEGACY_GET_CONTACT,
  PATCHED_GET_CONTACT,
} = require('./patch-wwebjs-media-getter.js');

function makeDependency(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-media-getter-'));
  const utils = path.join(root, 'src', 'util', 'Injected', 'Utils.js');
  fs.mkdirSync(path.dirname(utils), { recursive: true });
  fs.writeFileSync(utils, source, 'utf8');
  return { root, utils };
}

test('patches media message building and contact model getter safely', () => {
  const sample = `before\n${LEGACY_SEND_MESSAGE}\nmiddle\n${LEGACY_MESSAGE_OBJECT}\nafter\n${LEGACY_GET_CONTACT}\nend\n`;
  const { root, utils } = makeDependency(sample);

  const result = applyBackport(root);
  assert.equal(result.skipped, false);
  const content = fs.readFileSync(utils, 'utf8');
  assert.ok(content.includes('delete mediaOptions.id;'));
  assert.ok(content.includes('delete message.__x_id;'));
  assert.ok(content.includes('Unable to send message: destination chat or chat.id is undefined'));
  assert.ok(content.includes('if (!contact || !contact.id)'));
});

test('is idempotent when already patched', () => {
  const sample = `before\n${PATCHED_SEND_MESSAGE}\nmiddle\n${PATCHED_MESSAGE_OBJECT}\nafter\n${PATCHED_GET_CONTACT}\nend\n`;
  const { root, utils } = makeDependency(sample);

  const result = applyBackport(root);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /already has media memoization getter patch/);
});

test('rejects unexpected Utils.js structure', () => {
  const { root } = makeDependency('window.WWebJS.sendMessage = function() {};');
  assert.throws(() => applyBackport(root), /unsupported Utils\.js message object structure/);
});
