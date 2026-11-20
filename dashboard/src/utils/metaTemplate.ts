import type { NewMetaTemplate } from '../types/messageStudio';

export interface MetaTemplateDraft {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  headerType: 'NONE' | 'TEXT' | 'IMAGE';
  headerText: string;
  headerImage: { base64: string; mimetype: 'image/jpeg' | 'image/png'; filename: string } | null;
  body: string;
  bodyExamples: string[];
  footer: string;
  /** `value` is the link for URL buttons and the phone number for call buttons. `autoReply` is sent when a quick reply is tapped. */
  buttons: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; value: string; autoReply: string }>;
}

/** Distinct {{n}} variables in a template body, as Meta counts them. */
export function countBodyVariables(body: string): number {
  return new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => m[1])).size;
}

/** Checks the form the way Meta will, and builds the request body. */
export function buildMetaTemplate(
  sessionId: string,
  d: MetaTemplateDraft,
): { ok: true; value: NewMetaTemplate } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!/^[a-z0-9_]+$/.test(d.name)) return fail('Name: use lowercase letters, numbers and _ only.');
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(d.language)) return fail('Language: pick a language.');
  if (d.headerType === 'TEXT' && !d.headerText.trim())
    return fail('Header: write the header text or choose "No header".');
  if (d.headerType === 'IMAGE' && !d.headerImage) return fail('Header: choose an image or choose "No header".');
  const body = d.body.trim();
  if (!body) return fail('Write the message.');
  if (/^\{\{\s*\d+\s*\}\}|\{\{\s*\d+\s*\}\}$/.test(body)) {
    return fail('The message cannot start or end with a {{1}} placeholder. Add a word before/after it.');
  }
  const varCount = countBodyVariables(body);
  const examples = d.bodyExamples.slice(0, varCount).map(s => (s ?? '').trim());
  if (examples.length < varCount || examples.some(s => !s)) return fail('Give an example for every {{n}} placeholder.');
  for (const [i, b] of d.buttons.entries()) {
    if (!b.text.trim()) return fail(`Button ${i + 1}: write its text.`);
    if (b.type === 'URL' && !/^https:\/\/\S+$/.test(b.value)) return fail(`Button ${i + 1}: needs an https:// link.`);
    if (b.type === 'PHONE_NUMBER' && !/^\+?\d{7,15}$/.test(b.value)) {
      return fail(`Button ${i + 1}: needs a phone number with country code.`);
    }
  }
  return {
    ok: true,
    value: {
      sessionId,
      name: d.name,
      language: d.language,
      category: d.category,
      body,
      ...(varCount ? { bodyExamples: examples } : {}),
      ...(d.headerType === 'TEXT' ? { headerText: d.headerText.trim() } : {}),
      // Copy only the fields the API accepts (the picker also carries a local preview URL).
      ...(d.headerType === 'IMAGE' && d.headerImage
        ? {
            headerImage: {
              base64: d.headerImage.base64,
              mimetype: d.headerImage.mimetype,
              filename: d.headerImage.filename,
            },
          }
        : {}),
      ...(d.footer.trim() ? { footer: d.footer.trim() } : {}),
      ...(d.buttons.length
        ? {
            buttons: d.buttons.map(b => ({
              type: b.type,
              text: b.text.trim(),
              ...(b.type === 'URL' ? { url: b.value } : b.type === 'PHONE_NUMBER' ? { phone: b.value } : {}),
            })),
          }
        : {}),
    },
  };
}

/**
 * A published keyword workflow that answers when someone taps a quick reply button: WhatsApp delivers
 * the tap as a message whose text is the button label, so the label is the keyword.
 */
export function buttonReplyWorkflow(templateName: string, buttonText: string, reply: string) {
  return {
    name: `${templateName} · ${buttonText} reply`,
    description: `Auto-reply when someone taps "${buttonText}" on the ${templateName} template.`,
    definition: {
      // The keyword list is comma-separated, so a comma in the label must not split it.
      trigger: { type: 'keyword_match', config: { keyword: buttonText.replace(/,/g, ' ').trim() } },
      nodes: [
        {
          id: 'node-trg',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: `Tapped "${buttonText}"`, config: { triggerType: 'keyword_match', keyword: buttonText } },
        },
        {
          id: 'node-reply',
          type: 'send_message',
          position: { x: 250, y: 200 },
          data: { label: 'Auto-reply', config: { message: reply } },
        },
      ],
      edges: [{ id: 'e-trg-reply', source: 'node-trg', target: 'node-reply' }],
    },
  };
}
