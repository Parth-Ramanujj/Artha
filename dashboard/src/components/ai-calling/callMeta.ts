import type { CSSProperties } from 'react';
import i18n from '../../i18n';
import type { AiCallStatus } from '../../services/api';

// Labels live in the locale files under aiCalling.status.* / aiCalling.outcome.* / aiCalling.sentiment.*.
export const STATUS_COLOR: Record<AiCallStatus, string> = {
  queued: '#64748b',
  dialing: '#3b82f6',
  ringing: '#3b82f6',
  in_progress: '#8b5cf6',
  completed: '#22c55e',
  no_answer: '#f59e0b',
  busy: '#f59e0b',
  failed: '#ef4444',
  canceled: '#94a3b8',
  skipped: '#94a3b8',
};

export const SENTIMENT_META = {
  positive: { color: '#22c55e', emoji: '🙂' },
  neutral: { color: '#64748b', emoji: '😐' },
  negative: { color: '#ef4444', emoji: '🙁' },
} as const;

export const ACTIVE_STATUSES: AiCallStatus[] = ['queued', 'dialing', 'ringing', 'in_progress'];

export const formatWhen = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(i18n.language, {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

export const formatDuration = (seconds: number) =>
  seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';

export const panel: CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
};

export const cellStyle: CSSProperties = {
  padding: '11px 14px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
};

export const headStyle: CSSProperties = {
  ...cellStyle,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)',
};

export const label: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 };

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
