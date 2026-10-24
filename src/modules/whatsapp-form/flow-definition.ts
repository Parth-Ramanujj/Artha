// WhatsApp Forms: the builder's definition and the Meta WhatsApp Flow JSON it turns into.
// Pure functions only, so the builder's rules are testable without Nest, the DB or Meta.

export const FLOW_CATEGORIES = [
  'SIGN_UP',
  'SIGN_IN',
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'FEEDBACK',
  'ORDER_MANAGEMENT',
  'OTHER',
] as const;
export type FlowCategory = (typeof FLOW_CATEGORIES)[number];

export const FIELD_TYPES = ['short_text', 'paragraph', 'dropdown', 'radio', 'checkbox', 'date', 'opt_in'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const DISPLAY_TYPES = ['heading', 'text', 'image'] as const;
export type DisplayType = (typeof DISPLAY_TYPES)[number];

const CHOICE_TYPES: readonly string[] = ['dropdown', 'radio', 'checkbox'];
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,59}$/;
const OPTION_TITLE_MAX = 30;

export interface ChoiceOption {
  id: string;
  title: string;
}

export interface FieldComponent {
  id: string;
  type: FieldType;
  /** The key the answer is stored under in the form response. */
  name: string;
  label: string;
  required: boolean;
  inputType?: 'text' | 'number' | 'email' | 'phone';
  options?: ChoiceOption[];
}

export interface DisplayComponent {
  id: string;
  type: DisplayType;
  text?: string;
  /** Base64 JPEG/PNG, without a data: prefix. */
  src?: string;
}

export type FormComponent = FieldComponent | DisplayComponent;

export interface FormScreen {
  id: string;
  title: string;
  components: FormComponent[];
}

export interface FormDefinition {
  screens: FormScreen[];
}

const isField = (c: FormComponent): c is FieldComponent => (FIELD_TYPES as readonly string[]).includes(c.type);
const screenId = (index: number): string => `SCREEN_${index + 1}`;

/** The screen a flow opens on. Send messages start here. */
export const firstScreenId = (): string => screenId(0);

/** Human-readable problems with a definition. An empty list means it can be published to Meta. */
export function validateFormDefinition(definition: unknown): string[] {
  const screens = (definition as FormDefinition | undefined)?.screens;
  if (!Array.isArray(screens) || screens.length === 0) return ['Add at least one screen.'];

  const issues: string[] = [];
  const fieldNames = new Set<string>();

  screens.forEach((screen, si) => {
    const where = `Screen ${si + 1}`;
    if (!screen.title?.trim()) issues.push(`${where}: give it a title.`);
    if (!Array.isArray(screen.components) || screen.components.length === 0) {
      issues.push(`${where}: add at least one component.`);
      return;
    }

    for (const c of screen.components) {
      if (c.type === 'heading' || c.type === 'text') {
        if (!c.text?.trim()) issues.push(`${where}: a ${c.type === 'heading' ? 'heading' : 'text'} block is empty.`);
        continue;
      }
      if (c.type === 'image') {
        if (!c.src) issues.push(`${where}: upload an image.`);
        continue;
      }
      if (!isField(c)) {
        issues.push(`${where}: unknown component "${String((c as { type: unknown }).type)}".`);
        continue;
      }

      if (!c.label?.trim()) issues.push(`${where}: a field has no label.`);
      if (!NAME_PATTERN.test(c.name ?? '')) {
        issues.push(`${where}: "${c.name}" is not a valid field name (letters, numbers and _ only).`);
      } else if (fieldNames.has(c.name)) {
        issues.push(`Field name "${c.name}" is used more than once. Field names must be unique across the form.`);
      }
      fieldNames.add(c.name);

      if (CHOICE_TYPES.includes(c.type)) {
        const options = c.options ?? [];
        if (options.length === 0) issues.push(`${where}: "${c.label}" needs at least one option.`);
        for (const o of options) {
          if (!o.title?.trim()) issues.push(`${where}: "${c.label}" has an option without a title.`);
          else if (o.title.length > OPTION_TITLE_MAX) {
            issues.push(`${where}: option "${o.title}" is longer than ${OPTION_TITLE_MAX} characters.`);
          }
        }
      }
    }
  });

  return issues;
}

/** The data type a later screen declares for an answer it receives from an earlier screen. */
function dataSchemaFor(type: FieldType): Record<string, unknown> {
  if (type === 'checkbox') return { type: 'array', items: { type: 'string' }, __example__: [] };
  if (type === 'opt_in') return { type: 'boolean', __example__: true };
  return { type: 'string', __example__: 'example' };
}

function toChild(c: FormComponent): Record<string, unknown> {
  if (!isField(c)) {
    if (c.type === 'heading') return { type: 'TextHeading', text: c.text };
    if (c.type === 'text') return { type: 'TextBody', text: c.text };
    return { type: 'Image', src: c.src, 'scale-type': 'contain' };
  }
  const base = { name: c.name, label: c.label, required: c.required };
  const options = (c.options ?? []).map(o => ({ id: o.id, title: o.title }));
  switch (c.type) {
    case 'short_text':
      return { type: 'TextInput', ...base, 'input-type': c.inputType ?? 'text' };
    case 'paragraph':
      return { type: 'TextArea', ...base };
    case 'dropdown':
      return { type: 'Dropdown', ...base, 'data-source': options };
    case 'radio':
      return { type: 'RadioButtonsGroup', ...base, 'data-source': options };
    case 'checkbox':
      return { type: 'CheckboxGroup', ...base, 'data-source': options };
    case 'date':
      return { type: 'DatePicker', ...base };
    case 'opt_in':
      return { type: 'OptIn', ...base };
  }
}

/**
 * The Flow JSON Meta accepts. Each screen passes every answer collected so far forward: its footer
 * sends the earlier answers as `${data.x}` and its own as `${form.x}`, and declares the earlier ones
 * in `data` so Meta accepts them. The last screen completes the flow.
 */
export function buildFlowJson(definition: FormDefinition): Record<string, unknown> {
  const screens = definition.screens;
  const earlierFields: FieldComponent[] = [];

  const flowScreens = screens.map((screen, index) => {
    const isLast = index === screens.length - 1;
    const ownFields = screen.components.filter(isField);

    const payload: Record<string, string> = {};
    for (const f of earlierFields) payload[f.name] = `\${data.${f.name}}`;
    for (const f of ownFields) payload[f.name] = `\${form.${f.name}}`;

    const data: Record<string, unknown> = {};
    for (const f of earlierFields) data[f.name] = dataSchemaFor(f.type);

    const footer = isLast
      ? { type: 'Footer', label: 'Submit', 'on-click-action': { name: 'complete', payload } }
      : {
          type: 'Footer',
          label: 'Continue',
          'on-click-action': { name: 'navigate', next: { type: 'screen', name: screenId(index + 1) }, payload },
        };

    earlierFields.push(...ownFields);

    return {
      id: screenId(index),
      title: screen.title,
      ...(isLast ? { terminal: true } : {}),
      ...(Object.keys(data).length ? { data } : {}),
      layout: {
        type: 'SingleColumnLayout',
        children: [...screen.components.map(toChild), footer],
      },
    };
  });

  const routingModel = Object.fromEntries(
    screens.slice(0, -1).map((_, index) => [screenId(index), [screenId(index + 1)]]),
  );

  return {
    version: '6.2',
    ...(screens.length > 1 ? { routing_model: routingModel } : {}),
    screens: flowScreens,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A flow token that names the form it opens, so a submission can be traced back to its form. */
export function makeFlowToken(formId: string, nonce: string): string {
  return `${formId}.${nonce}`;
}

/** The form id inside a token made by makeFlowToken, or null for a token from anywhere else. */
export function formIdFromToken(token: string): string | null {
  const formId = token.split('.')[0] ?? '';
  return UUID_PATTERN.test(formId) ? formId : null;
}

/** The interactive message that opens a published flow on the customer's phone. */
export function buildFlowMessage(input: {
  flowId: string;
  flowToken: string;
  bodyText: string;
  footerText?: string;
  ctaText: string;
}): Record<string, unknown> {
  return {
    type: 'flow',
    body: { text: input.bodyText },
    ...(input.footerText ? { footer: { text: input.footerText } } : {}),
    action: {
      name: 'flow',
      parameters: {
        flow_message_version: '3',
        flow_token: input.flowToken,
        flow_id: input.flowId,
        flow_cta: input.ctaText,
        flow_action: 'navigate',
        flow_action_payload: { screen: firstScreenId() },
      },
    },
  };
}
