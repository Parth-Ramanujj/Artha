import type { CSSProperties } from 'react';
import type { AiCallOutcome, AiCallStatus } from '../../services/api';

export const STATUS_META: Record<AiCallStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: '#64748b' },
  dialing: { label: 'Dialing', color: '#3b82f6' },
  ringing: { label: 'Ringing', color: '#3b82f6' },
  in_progress: { label: 'On call', color: '#8b5cf6' },
  completed: { label: 'Completed', color: '#22c55e' },
  no_answer: { label: 'No answer', color: '#f59e0b' },
  busy: { label: 'Busy', color: '#f59e0b' },
  failed: { label: 'Failed', color: '#ef4444' },
  canceled: { label: 'Cancelled', color: '#94a3b8' },
  skipped: { label: 'Skipped (DND)', color: '#94a3b8' },
};

export const OUTCOME_LABEL: Record<AiCallOutcome, string> = {
  interested: 'Interested',
  callback: 'Wants a call back',
  not_interested: 'Not interested',
  wrong_number: 'Wrong number',
  do_not_call: 'Do not call',
  no_conversation: 'No conversation',
};

export const SENTIMENT_META = {
  positive: { label: 'Positive', color: '#22c55e', emoji: '🙂' },
  neutral: { label: 'Neutral', color: '#64748b', emoji: '😐' },
  negative: { label: 'Negative', color: '#ef4444', emoji: '🙁' },
} as const;

export const ACTIVE_STATUSES: AiCallStatus[] = ['queued', 'dialing', 'ringing', 'in_progress'];

export const formatWhen = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
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
