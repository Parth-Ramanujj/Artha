/**
 * Fix WhatsApp Web memoization getter error when sending media or resolving contacts in whatsapp-web.js.
 *
 * WhatsApp Web internal memoizers require objects passed to getters to strictly have an `id` property:
 * "Data passed to getter must include an id property (it's how we memoize) but got undefined".
 *
 * In whatsapp-web.js 1.34.7:
 * 1. `window.WWebJS.sendMessage`:
 *    - Destination chat may lack `.id` if newly loaded or malformed, triggering `getIsNewsletter(chat)`.
 *    - In `processMediaData`, `mediaOptions.toJSON()` includes `id: undefined` and private `__x_id: undefined`.
 *      Because `id: newMsgKey` was placed before `...mediaOptions`, the spread clobbers `message.id` with
 *      `undefined` and injects `__x_id`. Inside `addAndSendMsgToChat(chat, message)`, Meta's memoizer throws.
 * 2. `window.WWebJS.getContactModel`:
 *    - Calling `getIsMe(contact)` on an incomplete contact model throws the same memoizer error.
 *
 * This script patches `Utils.js` to strip `__x_id`, protect `message.id`, and guard against undefined `chat.id` / `contact.id`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_WWJS = path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js');
const UTILS_PATH = path.join('src', 'util', 'Injected', 'Utils.js');

const LEGACY_SEND_MESSAGE = `    window.WWebJS.sendMessage = async (chat, content, options = {}) => {
        const { getIsNewsletter, getIsBroadcast } =
            window.require('WAWebChatGetters');`;

const PATCHED_SEND_MESSAGE = `    window.WWebJS.sendMessage = async (chat, content, options = {}) => {
        if (!chat || !chat.id) {
            throw new Error('Unable to send message: destination chat or chat.id is undefined');
        }
        const { getIsNewsletter, getIsBroadcast } =
            window.require('WAWebChatGetters');`;

const LEGACY_MESSAGE_OBJECT = `        const message = {
            ...options,
            id: newMsgKey,
            ack: 0,
            body: content,
            from: from,
            to: chat.id,
            local: true,
            self: 'out',
            t: parseInt(new Date().getTime() / 1000),
            isNewMsg: true,
            type: 'chat',
            ...ephemeralFields,
            ...mediaOptions,
            ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}),
            ...quotedMsgOptions,
            ...locationOptions,
            ...pollOptions,
            ...eventOptions,
            ...vcardOptions,
            ...buttonOptions,
            ...listOptions,
            ...botOptions,
            ...extraOptions,
        };`;

const PATCHED_MESSAGE_OBJECT = `        if (mediaOptions) {
            delete mediaOptions.id;
            delete mediaOptions.__x_id;
        }
        const mediaJson = mediaOptions.toJSON ? mediaOptions.toJSON() : {};
        delete mediaJson.id;
        delete mediaJson.__x_id;

        const message = {
            ...options,
            ack: 0,
            body: content,
            from: from,
            to: chat.id,
            local: true,
            self: 'out',
            t: parseInt(new Date().getTime() / 1000),
            isNewMsg: true,
            type: 'chat',
            ...ephemeralFields,
            ...mediaOptions,
            ...mediaJson,
            ...quotedMsgOptions,
            ...locationOptions,
            ...pollOptions,
            ...eventOptions,
            ...vcardOptions,
            ...buttonOptions,
            ...listOptions,
            ...botOptions,
            ...extraOptions,
            id: newMsgKey,
        };

        delete message.__x_id;
        if (!message.id) {
            message.id = newMsgKey;
        }`;

const LEGACY_GET_CONTACT = `    window.WWebJS.getContactModel = (contact) => {
        let res = contact.serialize();`;

const PATCHED_GET_CONTACT = `    window.WWebJS.getContactModel = (contact) => {
        if (!contact || !contact.id) {
            return null;
        }
        let res = contact.serialize();`;

function normalizeEol(str) {
  return str.replace(/\r\n/g, '\n');
}

function applyBackport(wwjsDir = DEFAULT_WWJS) {
  const utilsFile = path.join(wwjsDir, UTILS_PATH);
  if (!fs.existsSync(utilsFile)) {
    throw new Error(`whatsapp-web.js Utils.js not found at ${utilsFile}`);
  }

  let raw = fs.readFileSync(utilsFile, 'utf8');
  const usesCrlf = raw.includes('\r\n');
  let source = normalizeEol(raw);

  const alreadyPatched =
    source.includes(normalizeEol(PATCHED_MESSAGE_OBJECT)) ||
    source.includes('delete mediaOptions.id');

  if (alreadyPatched) {
    return {
      skipped: true,
      reason: 'installed whatsapp-web.js already has media memoization getter patch',
    };
  }

  let patched = source;

  if (patched.includes(normalizeEol(LEGACY_SEND_MESSAGE))) {
    patched = patched.replace(normalizeEol(LEGACY_SEND_MESSAGE), normalizeEol(PATCHED_SEND_MESSAGE));
  }

  if (patched.includes(normalizeEol(LEGACY_MESSAGE_OBJECT))) {
    patched = patched.replace(normalizeEol(LEGACY_MESSAGE_OBJECT), normalizeEol(PATCHED_MESSAGE_OBJECT));
  } else {
    throw new Error('unsupported Utils.js message object structure; cannot apply media getter patch');
  }

  if (patched.includes(normalizeEol(LEGACY_GET_CONTACT))) {
    patched = patched.replace(normalizeEol(LEGACY_GET_CONTACT), normalizeEol(PATCHED_GET_CONTACT));
  }

  if (usesCrlf) {
    patched = patched.replace(/\n/g, '\r\n');
  }

  fs.writeFileSync(utilsFile, patched, 'utf8');
  return { skipped: false, note: 'whatsapp-web.js media getter and contact memoization patch applied' };
}

function run() {
  const bestEffort = process.argv.includes('--best-effort');
  try {
    const result = applyBackport();
    console.log(
      `patch-wwebjs-media-getter: ${result.skipped ? `skipped — ${result.reason}` : result.note}`,
    );
  } catch (error) {
    if (bestEffort) {
      console.warn(`patch-wwebjs-media-getter: skipped — ${error.message}`);
      return;
    }
    console.error(`patch-wwebjs-media-getter: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) run();

module.exports = {
  applyBackport,
  LEGACY_SEND_MESSAGE,
  PATCHED_SEND_MESSAGE,
  LEGACY_MESSAGE_OBJECT,
  PATCHED_MESSAGE_OBJECT,
  LEGACY_GET_CONTACT,
  PATCHED_GET_CONTACT,
};
