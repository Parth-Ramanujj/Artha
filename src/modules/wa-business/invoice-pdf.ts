import type { InvoiceItem } from './entities/invoice.entity';

export interface InvoiceTotals {
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}

export interface InvoicePdfInput {
  number: string;
  date: Date;
  sellerName: string;
  sellerGstin?: string | null;
  sellerAddress?: string | null;
  customerName: string;
  phone: string;
  items: InvoiceItem[];
  gstPercent: number;
  status: string;
}

/** Totals in paise; GST is split evenly into CGST + SGST on the PDF (intra-state supply). */
export function invoiceTotals(items: InvoiceItem[], gstPercent: number): InvoiceTotals {
  const subtotalPaise = items.reduce((s, i) => s + Math.round(i.qty * i.price * 100), 0);
  const gstPaise = Math.round((subtotalPaise * gstPercent) / 100);
  return { subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise };
}

export const rupees = (paise: number) =>
  `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// shortcut: the built-in Helvetica font has no ₹ or Indian scripts, so those print as "Rs." / "?";
// embed a Unicode font (or render HTML to PDF) if customers need names in Gujarati/Hindi.
const pdfText = (s: string) =>
  s
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[\\()]/g, m => `\\${m}`);

/**
 * A one-page A4 invoice as a PDF, written by hand (no PDF library): Helvetica text and a few lines.
 * Long item lists are cut at 25 rows.
 */
export function buildInvoicePdf(inv: InvoicePdfInput): Buffer {
  const t = invoiceTotals(inv.items, inv.gstPercent);
  const ops: string[] = [];
  const text = (x: number, y: number, s: string, size = 10, bold = false, right = false) => {
    // Right-aligned text: Helvetica averages ~0.5em per character, good enough for numbers.
    const px = right ? x - pdfText(s).length * size * 0.5 : x;
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${px.toFixed(1)} ${y} Td (${pdfText(s)}) Tj ET`);
  };
  const line = (y: number) => ops.push(`0.8 G 40 ${y} m 555 ${y} l S 0 G`);

  let y = 790;
  text(40, y, inv.gstPercent > 0 ? 'TAX INVOICE' : 'RECEIPT', 18, true);
  text(555, y, inv.status === 'paid' ? 'PAID' : 'PAYMENT DUE', 12, true, true);
  y -= 30;
  text(40, y, inv.sellerName, 12, true);
  text(555, y, `Invoice no: ${inv.number}`, 10, false, true);
  y -= 15;
  if (inv.sellerAddress) text(40, y, inv.sellerAddress.slice(0, 90));
  text(555, y, `Date: ${inv.date.toLocaleDateString('en-IN')}`, 10, false, true);
  y -= 15;
  if (inv.sellerGstin) text(40, y, `GSTIN: ${inv.sellerGstin}`);
  y -= 30;
  text(40, y, 'Bill to', 9, true);
  y -= 15;
  text(40, y, `${inv.customerName}  (+${inv.phone.replace(/\D/g, '')})`);
  y -= 30;

  text(40, y, 'Item', 10, true);
  text(380, y, 'Qty', 10, true, true);
  text(470, y, 'Rate', 10, true, true);
  text(555, y, 'Amount', 10, true, true);
  y -= 8;
  line(y);
  for (const it of inv.items.slice(0, 25)) {
    y -= 18;
    text(40, y, it.name.slice(0, 55));
    text(380, y, String(it.qty), 10, false, true);
    text(470, y, rupees(Math.round(it.price * 100)), 10, false, true);
    text(555, y, rupees(Math.round(it.qty * it.price * 100)), 10, false, true);
  }
  y -= 10;
  line(y);

  const row = (label: string, paise: number, bold = false) => {
    y -= 18;
    text(470, y, label, 10, bold, true);
    text(555, y, rupees(paise), 10, bold, true);
  };
  row('Subtotal', t.subtotalPaise);
  if (inv.gstPercent > 0) {
    const half = Math.round(t.gstPaise / 2);
    row(`CGST ${inv.gstPercent / 2}%`, half);
    row(`SGST ${inv.gstPercent / 2}%`, t.gstPaise - half);
  }
  row('Total', t.totalPaise, true);
  text(40, 60, 'Thank you for your business. This is a computer-generated invoice.', 8);

  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
