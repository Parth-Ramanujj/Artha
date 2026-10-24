import type {
  ComponentKind,
  FieldKind,
  FormComponent,
  FormDefinition,
  FormScreen,
  WhatsAppFormSubmission,
} from '../types/whatsappForm';

export const FIELD_KINDS: FieldKind[] = ['short_text', 'paragraph', 'dropdown', 'radio', 'checkbox', 'date', 'opt_in'];
export const CHOICE_KINDS: ComponentKind[] = ['dropdown', 'radio', 'checkbox'];
export const IMAGE_MAX_BYTES = 500 * 1024;

const DEFAULT_LABEL: Record<ComponentKind, string> = {
  short_text: 'Short answer',
  paragraph: 'Long answer',
  dropdown: 'Choose one',
  radio: 'Pick one',
  checkbox: 'Pick any',
  date: 'Date',
  opt_in: 'I agree to be contacted',
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
};

export const newId = (): string => Math.random().toString(36).slice(2, 10);

export const isFieldKind = (kind: ComponentKind): kind is FieldKind => FIELD_KINDS.includes(kind as FieldKind);

/** Turns a label into a valid Flow field name: lower case, letters, digits and _. */
export function fieldNameFrom(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) return 'field';
  return /^[a-z_]/.test(slug) ? slug : `f_${slug}`;
}

/** A field name no other field in the form uses yet (adds _2, _3 … when needed). */
export function uniqueFieldName(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  return name;
}

export function allFieldNames(definition: FormDefinition): Set<string> {
  const names = new Set<string>();
  for (const screen of definition.screens) {
    for (const c of screen.components) if (c.name) names.add(c.name);
  }
  return names;
}

export function createComponent(kind: ComponentKind, definition: FormDefinition, label?: string): FormComponent {
  const id = newId();
  if (!isFieldKind(kind)) {
    if (kind === 'image') return { id, type: kind };
    return { id, type: kind, text: kind === 'heading' ? 'Welcome' : 'Some text' };
  }

  const text = label ?? DEFAULT_LABEL[kind];
  const component: FormComponent = {
    id,
    type: kind,
    label: text,
    name: uniqueFieldName(fieldNameFrom(text), allFieldNames(definition)),
    required: false,
  };
  if (kind === 'short_text') component.inputType = 'text';
  if (CHOICE_KINDS.includes(kind)) {
    component.options = [
      { id: newId(), title: 'Option 1' },
      { id: newId(), title: 'Option 2' },
    ];
  }
  return component;
}

export function createScreen(index: number): FormScreen {
  return { id: newId(), title: `Screen ${index}`, components: [] };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Problems that would stop a publish. Mirrors the server's rules so the builder can show them up front. */
export function draftIssues(definition: FormDefinition, name: string): string[] {
  const issues: string[] = [];
  if (!name.trim()) issues.push('Give the form a name.');
  const seen = new Set<string>();
  definition.screens.forEach((screen, si) => {
    const where = `Screen ${si + 1}`;
    if (!screen.title.trim()) issues.push(`${where}: give it a title.`);
    if (screen.components.length === 0) issues.push(`${where}: add at least one component.`);
    for (const c of screen.components) {
      if (c.type === 'heading' || c.type === 'text') {
        if (!c.text?.trim()) issues.push(`${where}: a ${c.type === 'heading' ? 'heading' : 'text'} block is empty.`);
      } else if (c.type === 'image') {
        if (!c.src) issues.push(`${where}: upload an image.`);
      } else {
        if (!c.label?.trim()) issues.push(`${where}: a field has no label.`);
        if (c.name && seen.has(c.name)) issues.push(`Field name "${c.name}" is used more than once.`);
        if (c.name) seen.add(c.name);
        if (CHOICE_KINDS.includes(c.type) && (c.options ?? []).length === 0) {
          issues.push(`${where}: "${c.label}" needs at least one option.`);
        }
        if ((c.options ?? []).some(o => !o.title.trim())) issues.push(`${where}: "${c.label}" has an empty option.`);
      }
    }
  });
  return issues;
}

/** The answer as one readable cell: checkbox picks joined, missing answers blank. */
export function answerText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/** Every field name that appears in any submission, in first-seen order: the response table's columns. */
export function submissionColumns(rows: WhatsAppFormSubmission[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row.answers)) if (!columns.includes(key)) columns.push(key);
  }
  return columns;
}

/** The customer's phone number from a chat id ("919876543210@c.us" → "919876543210"). */
export const phoneOf = (chatId: string): string => chatId.replace(/@.*$/, '');

/** Submissions as CSV (RFC 4180 quoting) for Excel or Google Sheets. */
export function submissionsToCsv(rows: WhatsAppFormSubmission[]): string {
  const columns = submissionColumns(rows);
  const cell = (raw: string) => {
    // Customer text starting with = + - @ would run as a formula in Excel / Sheets (CSV injection).
    const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [['submitted_at', 'phone', ...columns].map(cell).join(',')];
  for (const row of rows) {
    lines.push([row.createdAt, phoneOf(row.chatId), ...columns.map(c => answerText(row.answers[c]))].map(cell).join(','));
  }
  return lines.join('\r\n');
}
