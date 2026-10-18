import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';

// History replayed on reconnect also arrives as message:received, so callers bound how old a message may be.
export const LEAD_MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000;
export const WORKFLOW_MAX_MESSAGE_AGE_MS = 2 * 60 * 60 * 1000;

/** A chat the bot can sensibly answer: a privacy-id user, or a real phone number (not e.g. "0@c.us"). */
export function isReachablePersonalChat(chatId: string): boolean {
  if (chatId.endsWith('@lid')) return true;
  const phone = /^(\d+)@c\.us$/.exec(chatId)?.[1];
  return !!phone && phone.length >= 7;
}

/** A recent message from a customer in a one-to-one chat — not ours, not a group, channel or status. */
export function isFreshPersonalMessage(msg: IncomingMessage, maxAgeMs: number, now = Date.now()): boolean {
  if (msg.fromMe || msg.isGroup || msg.isStatusBroadcast || msg.kind !== 'individual') return false;
  if (msg.timestamp && now - msg.timestamp * 1000 > maxAgeMs) return false;
  return isReachablePersonalChat(msg.chatId);
}
