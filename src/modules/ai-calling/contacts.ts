import ExcelJS from 'exceljs';
import { validateAnswer } from '../workflow/workflow-executor.service';

export interface CallContact {
  phone: string;
  name: string | null;
}

export interface ParsedContacts {
  contacts: CallContact[];
  invalid: number;
  duplicates: number;
}

const MAX_ROWS = 10_000;
const PHONE_HEADERS =
  /^(phone|mobile|number|contact|whatsapp|cell|tel|phone ?no|mobile ?no|મોબાઇલ|મોબાઈલ|ફોન|નંબર|मोबाइल|फोन|फ़ोन|नंबर)/i;
const NAME_HEADERS = /^(name|full ?name|customer|client|first ?name|નામ|नाम)/i;

/** E.164 for a number written any common way: 98765 43210, 098765-43210, +91 98765 43210, 919876543210. */
export function toE164(raw: string | number | null | undefined): string | null {
  const text = String(raw ?? '')
    .replace(/\.0+$/, '')
    .trim();
  if (!text) return null;
  const digits = validateAnswer('phone', /^\d{12,15}$/.test(text) && !text.startsWith('91') ? `+${text}` : text);
  return digits ? `+${digits}` : null;
}

/** The WhatsApp chat id for an E.164 number. */
export function chatIdFor(e164: string): string {
  return `${e164.replace(/\D/g, '')}@c.us`;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellText(value.result);
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(r => r.text).join('');
    if (value instanceof Date) return value.toISOString();
    return '';
  }
  return typeof value === 'string' ? value : String(value);
}

/** Splits CSV text into rows, honouring quoted fields with commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const delimiter =
    (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim()));
}

/** Picks the phone and name columns from a header row, or by looking at the values when there is none. */
export function contactsFromRows(rows: string[][]): ParsedContacts {
  const header = rows[0] ?? [];
  let phoneCol = header.findIndex(h => PHONE_HEADERS.test(h.trim()));
  let nameCol = header.findIndex(h => NAME_HEADERS.test(h.trim()));
  const hasHeader = phoneCol >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  if (!hasHeader) {
    const width = Math.max(0, ...body.slice(0, 20).map(r => r.length));
    let best = -1;
    let bestScore = 0;
    for (let col = 0; col < width; col++) {
      const score = body.slice(0, 20).filter(r => toE164(r[col])).length;
      if (score > bestScore) {
        best = col;
        bestScore = score;
      }
    }
    phoneCol = best;
    nameCol = phoneCol >= 0 ? (body[0]?.findIndex((v, i) => i !== phoneCol && /\p{L}/u.test(v ?? '')) ?? -1) : -1;
  }

  const seen = new Set<string>();
  const contacts: CallContact[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const row of body.slice(0, MAX_ROWS)) {
    const phone = phoneCol >= 0 ? toE164(row[phoneCol]) : null;
    if (!phone) {
      invalid++;
      continue;
    }
    if (seen.has(phone)) {
      duplicates++;
      continue;
    }
    seen.add(phone);
    const name = nameCol >= 0 ? (row[nameCol] ?? '').trim().slice(0, 120) : '';
    contacts.push({ phone, name: name || null });
  }
  return { contacts, invalid, duplicates };
}

/** Reads numbers (and names) from an .xlsx or .csv upload. */
export async function parseContactsFile(fileName: string, buffer: Buffer): Promise<ParsedContacts> {
  if (/\.xlsx$/i.test(fileName)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { contacts: [], invalid: 0, duplicates: 0 };
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      if (rows.length > MAX_ROWS) return;
      const values = row.values as ExcelJS.CellValue[];
      rows.push(values.slice(1).map(cellText));
    });
    return contactsFromRows(rows);
  }
  if (/\.(csv|txt)$/i.test(fileName)) {
    const text = buffer.toString('utf-8');
    return contactsFromRows(parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text));
  }
  throw new Error('Upload an .xlsx or .csv file');
}
