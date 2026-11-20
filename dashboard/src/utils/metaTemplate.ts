import type {
  MetaButtonType,
  MetaHeaderFormat,
  NewMetaTemplate,
  StudioMediaMime,
  StudioTemplate,
} from '../types/messageStudio';

export type VariableType = 'NUMBER' | 'NAME';

export interface MetaTemplateButtonDraft {
  type: MetaButtonType;
  text: string;
  /** Link (URL), phone number (PHONE_NUMBER) or offer code (COPY_CODE). */
  value: string;
  /** FLOW: Meta flow id of the chosen WhatsApp form. */
  flowId: string;
  /** QUICK_REPLY: sent back automatically when tapped. */
  autoReply: string;
}

export interface MetaTemplateDraft {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  variableType: VariableType;
  headerType: MetaHeaderFormat;
  headerText: string;
  headerExample: string;
  headerMedia: { base64: string; mimetype: StudioMediaMime; filename: string } | null;
  body: string;
  bodyExamples: string[];
  footer: string;
  buttons: MetaTemplateButtonDraft[];
  /** Utility only: seconds Meta keeps trying to deliver; null = WhatsApp's default. */
  ttlSeconds: number | null;
}

export const BUTTON_LIMITS: Partial<Record<MetaButtonType, number>> = {
  URL: 2,
  PHONE_NUMBER: 1,
  VOICE_CALL: 1,
  COPY_CODE: 1,
  FLOW: 1,
};

/** Variables in order of first appearance: "1", "2" … or "first_name" … */
export function templateVariables(text: string, type: VariableType = 'NUMBER'): string[] {
  const re = type === 'NAME' ? /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g : /\{\{\s*(\d+)\s*\}\}/g;
  return [...new Set([...text.matchAll(re)].map(m => m[1]))];
}

/** Distinct {{n}} variables in a template body, as Meta counts them. */
export function countBodyVariables(body: string, type: VariableType = 'NUMBER'): number {
  return templateVariables(body, type).length;
}

/** The placeholder "Add variable" inserts next: {{3}}, or {{variable_3}} for named templates. */
export function nextVariable(body: string, type: VariableType): string {
  const n = countBodyVariables(body, type) + 1;
  return type === 'NAME' ? `{{variable_${n}}}` : `{{${n}}}`;
}

const MEDIA_HEADERS: MetaHeaderFormat[] = ['IMAGE', 'VIDEO', 'DOCUMENT'];

/** What is still missing, in the order the form asks for it — shown as a checklist. */
export function templateChecklist(d: MetaTemplateDraft): Array<{ label: string; done: boolean }> {
  const vars = templateVariables(d.body, d.variableType);
  const wrongSyntax = templateVariables(d.body, d.variableType === 'NAME' ? 'NUMBER' : 'NAME').length > 0;
  const items = [
    { label: 'Template name', done: /^[a-z0-9_]+$/.test(d.name) },
    { label: 'Message written', done: Boolean(d.body.trim()) },
  ];
  if (wrongSyntax) {
    items.push({
      label: d.variableType === 'NAME' ? 'Use {{name_like_this}} variables' : 'Use {{1}} {{2}} variables',
      done: false,
    });
  }
  if (d.variableType === 'NUMBER' && vars.some((v, i) => v !== String(i + 1))) {
    items.push({ label: 'Variables numbered in order {{1}}, {{2}} …', done: false });
  }
  if (/^\s*\{\{[^}]+\}\}|\{\{[^}]+\}\}\s*$/.test(d.body)) {
    items.push({ label: 'Message must not start or end with a variable', done: false });
  }
  if (vars.length) {
    items.push({
      label: `Sample for each variable (${vars.length})`,
      done: d.bodyExamples.slice(0, vars.length).filter(s => s?.trim()).length === vars.length,
    });
  }
  if (d.headerType === 'TEXT') {
    items.push({ label: 'Header text', done: Boolean(d.headerText.trim()) });
    const hv = templateVariables(d.headerText, d.variableType);
    if (hv.length > 1) items.push({ label: 'Header: only one variable', done: false });
    if (hv.length === 1) items.push({ label: 'Sample for the header variable', done: Boolean(d.headerExample.trim()) });
  }
  if (MEDIA_HEADERS.includes(d.headerType)) {
    items.push({ label: `Sample ${d.headerType.toLowerCase()} chosen`, done: Boolean(d.headerMedia) });
  }
  for (const [type, max] of Object.entries(BUTTON_LIMITS)) {
    if (d.buttons.filter(b => b.type === type).length > (max ?? 10)) {
      items.push({ label: `At most ${max} ${BUTTON_LABEL[type as MetaButtonType]} button(s)`, done: false });
    }
  }
  d.buttons.forEach((b, i) => items.push({ label: `Button ${i + 1}: ${BUTTON_LABEL[b.type]}`, done: buttonReady(b) }));
  return items;
}

export const BUTTON_LABEL: Record<MetaButtonType, string> = {
  QUICK_REPLY: 'Custom (quick reply)',
  URL: 'Visit website',
  VOICE_CALL: 'Call on WhatsApp',
  PHONE_NUMBER: 'Call phone number',
  COPY_CODE: 'Copy offer code',
  FLOW: 'Complete form (flow)',
};

function buttonReady(b: MetaTemplateButtonDraft): boolean {
  switch (b.type) {
    case 'URL':
      return Boolean(b.text.trim()) && /^https:\/\/\S+$/.test(b.value);
    case 'PHONE_NUMBER':
      return Boolean(b.text.trim()) && /^\+?\d{7,15}$/.test(b.value);
    case 'COPY_CODE':
      return /^[A-Za-z0-9_-]{1,15}$/.test(b.value);
    case 'FLOW':
      return Boolean(b.text.trim()) && Boolean(b.flowId);
    default:
      return Boolean(b.text.trim());
  }
}

/** Checks the form the way Meta will, and builds the request body. */
export function buildMetaTemplate(
  sessionId: string,
  d: MetaTemplateDraft,
): { ok: true; value: NewMetaTemplate } | { ok: false; error: string } {
  const missing = templateChecklist(d).find(i => !i.done);
  if (missing) return { ok: false, error: missing.label };
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(d.language)) return { ok: false, error: 'Pick a language' };

  const vars = templateVariables(d.body, d.variableType);
  const headerHasVar = d.headerType === 'TEXT' && templateVariables(d.headerText, d.variableType).length === 1;
  return {
    ok: true,
    value: {
      sessionId,
      name: d.name,
      language: d.language,
      category: d.category,
      ...(d.variableType === 'NAME' ? { parameterFormat: 'NAMED' as const } : {}),
      headerFormat: d.headerType,
      body: d.body.trim(),
      ...(vars.length ? { bodyExamples: d.bodyExamples.slice(0, vars.length).map(s => s.trim()) } : {}),
      ...(d.headerType === 'TEXT' ? { headerText: d.headerText.trim() } : {}),
      ...(headerHasVar ? { headerExample: d.headerExample.trim() } : {}),
      // Copy only the fields the API accepts (the picker also carries a local preview URL).
      ...(MEDIA_HEADERS.includes(d.headerType) && d.headerMedia
        ? {
            headerMedia: {
              base64: d.headerMedia.base64,
              mimetype: d.headerMedia.mimetype,
              filename: d.headerMedia.filename,
            },
          }
        : {}),
      ...(d.category === 'UTILITY' && d.ttlSeconds ? { ttlSeconds: d.ttlSeconds } : {}),
      ...(d.footer.trim() ? { footer: d.footer.trim() } : {}),
      ...(d.buttons.length
        ? {
            buttons: d.buttons.map(b => ({
              type: b.type,
              text: b.type === 'COPY_CODE' ? 'Copy offer code' : b.text.trim(),
              ...(b.type === 'URL' ? { url: b.value } : {}),
              ...(b.type === 'PHONE_NUMBER' ? { phone: b.value } : {}),
              ...(b.type === 'COPY_CODE' ? { code: b.value } : {}),
              ...(b.type === 'FLOW' ? { flowId: b.flowId, flowScreen: 'SCREEN_1' } : {}),
            })),
          }
        : {}),
    },
  };
}

/**
 * Starts a new draft from an existing (e.g. rejected) template so it can be fixed and resubmitted.
 * Meta keeps rejected names, so the copy gets a new one; links, numbers and media must be re-entered.
 */
export function draftFromTemplate(t: StudioTemplate): Partial<MetaTemplateDraft> {
  const base = t.name.replace(/_v\d+$/, '');
  const version = Number(/_v(\d+)$/.exec(t.name)?.[1] ?? 1) + 1;
  const known: MetaButtonType[] = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'VOICE_CALL', 'COPY_CODE', 'FLOW'];
  return {
    name: `${base}_v${version}`,
    language: t.language,
    category: t.category.toUpperCase() === 'UTILITY' ? 'UTILITY' : 'MARKETING',
    variableType: t.parameterFormat === 'NAMED' ? 'NAME' : 'NUMBER',
    headerType: (['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'] as const).includes(t.headerFormat)
      ? t.headerFormat
      : 'NONE',
    headerText: t.headerText ?? '',
    body: t.bodyText,
    footer: t.footerText ?? '',
    buttons: t.buttons
      .filter(b => known.includes(b.type as MetaButtonType))
      .map(b => ({ type: b.type as MetaButtonType, text: b.text, value: '', flowId: '', autoReply: '' })),
  };
}

type WorkflowDef = Record<string, unknown> & {
  trigger?: { type?: string; config?: Record<string, unknown> };
  nodes?: Array<{ type?: string; data?: { config?: Record<string, unknown> } }>;
};

const splitKeywords = (raw: unknown) =>
  (typeof raw === 'string' ? raw : '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

/** The keywords a keyword-triggered workflow listens for (lower-cased); empty for other triggers. */
export function workflowKeywords(def: WorkflowDef): string[] {
  return def.trigger?.type === 'keyword_match'
    ? splitKeywords(def.trigger.config?.keyword).map(k => k.toLowerCase())
    : [];
}

/**
 * The same workflow definition with `keyword` added to (or removed from) its keyword trigger — and to
 * the visual trigger node, so the builder shows the same list. A button tap arrives as its label.
 */
export function withKeyword(def: WorkflowDef, keyword: string, add: boolean): WorkflowDef {
  const word = keyword.replace(/,/g, ' ').trim();
  const update = (raw: unknown) => {
    const list = splitKeywords(raw).filter(k => k.toLowerCase() !== word.toLowerCase());
    return (add ? [...list, word] : list).join(', ');
  };
  return {
    ...def,
    trigger: { ...def.trigger, config: { ...def.trigger?.config, keyword: update(def.trigger?.config?.keyword) } },
    ...(def.nodes
      ? {
          nodes: def.nodes.map(n =>
            n.type === 'trigger'
              ? { ...n, data: { ...n.data, config: { ...n.data?.config, keyword: update(n.data?.config?.keyword) } } }
              : n,
          ),
        }
      : {}),
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
