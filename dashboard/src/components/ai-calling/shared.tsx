import type { ReactNode } from 'react';
import type { AiCall } from '../../services/api';
import { STATUS_META } from './callMeta';

export function Pill({ color, children, title }: { color: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: `${color}1f`,
        border: `1px solid ${color}55`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function StatusPill({ call }: { call: AiCall }) {
  const meta = STATUS_META[call.status];
  return (
    <Pill color={meta.color} title={call.error ?? undefined}>
      {meta.label}
    </Pill>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        background: 'var(--bg-secondary)',
        border: '1px dashed var(--border)',
        borderRadius: 12,
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ marginBottom: 8, opacity: 0.6 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {hint && <div style={{ fontSize: 13, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
