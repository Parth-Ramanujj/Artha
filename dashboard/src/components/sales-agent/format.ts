import type { ProspectRef } from '../../types/salesAgent';

/** "Asha (Smile Dental)" / "Smile Dental" / the phone or email when nothing else is known. */
export function who(p: ProspectRef | null): string {
  if (!p) return 'Deleted prospect';
  const name = p.name || p.companyName || p.phone || p.email;
  return p.name && p.companyName ? `${p.name} (${p.companyName})` : name;
}
