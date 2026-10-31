/** Conversation tag set when a customer opts out; automated outreach must skip these chats. */
export const DND_TAG = 'dnd';

/** Default words that opt a customer out (whole-word match); shared by the workflow DND step and auto-STOP. */
export const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'bandh', 'rad', 'રદ', 'બંધ', 'dnd'];

/** Words that undo an opt-out, as promised in the opt-out confirmation ("send START"). */
const OPT_IN_WORDS = new Set(['start', 'શરૂ', 'चालू', 'शुरू']);

export function hasDndTag(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(DND_TAG);
}

export function isOptInMessage(body: string | undefined): boolean {
  return OPT_IN_WORDS.has(
    (body ?? '')
      .trim()
      .toLowerCase()
      .replace(/[.!]+$/, ''),
  );
}

/** SQL filter excluding DND chats; tags is a simple-json (text) column on every driver. */
export function notDndSql(alias: string): string {
  return `(${alias}.tags IS NULL OR ${alias}.tags NOT LIKE '%"${DND_TAG}"%')`;
}
