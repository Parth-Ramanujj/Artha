/**
 * Meta's most common reasons a Cloud API message was accepted but never arrived, in plain words with
 * what to do about it. Unknown codes fall back to Meta's own error text.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const KNOWN: Record<number, { why: string; fix: string }> = {
  131026: {
    why: 'WhatsApp could not deliver to this number.',
    fix: 'Check the number has WhatsApp, uses a recent app version, and is written with country code (91…).',
  },
  131047: {
    why: 'More than 24 hours passed since this person last messaged you, so a normal message is not allowed.',
    fix: 'Send an approved template instead, or ask them to message you first.',
  },
  131049: {
    why: 'Meta held back this marketing message to protect the person from too many marketing messages.',
    fix: 'Try again after a day, send fewer marketing messages to them, or use a Utility template if it is an update.',
  },
  131050: {
    why: 'This person has turned off marketing messages from businesses.',
    fix: 'Do not send them marketing templates. Utility updates still work.',
  },
  131042: {
    why: 'Meta could not charge your account (no valid payment method or a billing problem).',
    fix: 'Open WhatsApp Manager → Payment settings and add or fix your payment method.',
  },
  131056: {
    why: 'Too many messages to the same person in a short time.',
    fix: 'Wait a few minutes before messaging this person again.',
  },
  131051: { why: 'This message type is not supported.', fix: 'Use a different message type.' },
  131053: {
    why: 'The media (image/video/document) could not be uploaded or downloaded.',
    fix: 'Upload the file again.',
  },
  132000: {
    why: 'The number of values does not match the template’s variables.',
    fix: 'Fill every {{variable}} of the template.',
  },
  132001: {
    why: 'This template does not exist in that language, or is not approved yet.',
    fix: 'Check the template name and language on the WhatsApp Templates page.',
  },
  132007: {
    why: 'The values break Meta’s template rules.',
    fix: 'Remove links or unusual characters from the values.',
  },
  132012: {
    why: 'A value has the wrong format for the template.',
    fix: 'Check each value matches what the template expects.',
  },
  132015: { why: 'The template is paused because of low quality.', fix: 'Make a new, softer version of the template.' },
  132016: { why: 'The template was disabled by Meta.', fix: 'Create a new template.' },
  130472: {
    why: 'Meta is running an experiment on this person’s account and blocked this marketing message.',
    fix: 'Nothing to fix on your side; try a different person.',
  },
  131031: { why: 'Your WhatsApp Business account is locked.', fix: 'Check WhatsApp Manager for a policy notice.' },
  368: {
    why: 'Your account is temporarily blocked for a policy violation.',
    fix: 'Check WhatsApp Manager for details.',
  },
};

export function explainDeliveryError(code: number | null, metaText: string | null): { why: string; fix: string } {
  const known = code !== null ? KNOWN[code] : undefined;
  if (known) return known;
  return {
    why: metaText || (code ? `WhatsApp reported error ${code}.` : 'WhatsApp reported that the message failed.'),
    fix: code ? `Look up error ${code} in Meta's Cloud API error codes.` : 'Try again, or check the number.',
  };
}
