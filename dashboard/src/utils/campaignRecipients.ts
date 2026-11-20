/**
 * Parses the campaign recipients box. Accepts plain numbers separated by commas, semicolons or new
 * lines ("9198…, 9197…") and also one "number, name" pair per line (e.g. pasted from a CSV), where a
 * non-numeric part right after a number becomes that number's name for {{name}}.
 */
export function parseCampaignRecipients(text: string): { chatIds: string[]; names: string[] } {
  const chatIds: string[] = [];
  const names: string[] = [];
  for (const line of text.split(/[\n;]+/)) {
    for (const raw of line.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const isNumber = part.includes('@') || /^\+?[\d\s()-]{7,}$/.test(part);
      if (isNumber) {
        chatIds.push(part);
        names.push('');
      } else if (chatIds.length && !names[names.length - 1]) {
        names[names.length - 1] = part;
      }
    }
  }
  return { chatIds, names };
}
