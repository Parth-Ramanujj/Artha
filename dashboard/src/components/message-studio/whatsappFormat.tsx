import type { ReactNode } from 'react';
import { VARIABLES } from '../../utils/messageStudio';

/** WhatsApp *bold* _italic_ ~strike~ `mono` and {{variables}}, as React nodes (no HTML injection). */
export function formatWhatsApp(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\{\{[^}]+\}\}|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const inner = tok.slice(1, -1);
    if (tok.startsWith('{{')) {
      const known = VARIABLES.find(v => v.token === tok);
      out.push(
        <span key={key++} className="wa-var" title={tok}>
          {known ? known.label : tok.slice(2, -2)}
        </span>,
      );
    } else if (tok[0] === '*') out.push(<strong key={key++}>{formatWhatsApp(inner)}</strong>);
    else if (tok[0] === '_') out.push(<em key={key++}>{formatWhatsApp(inner)}</em>);
    else if (tok[0] === '~') out.push(<s key={key++}>{formatWhatsApp(inner)}</s>);
    else out.push(<code key={key++}>{inner}</code>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
