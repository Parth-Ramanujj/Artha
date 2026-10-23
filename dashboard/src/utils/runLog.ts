/**
 * Turns a stored workflow run into what a person debugging it needs: who wrote what, which step
 * stopped the run and why, and which steps never ran.
 */
type Step = {
  actionId?: string;
  actionType?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  output?: Record<string, unknown>;
  error?: string;
};

type GraphNode = { id: string; type?: string; data?: { label?: string } };

export type RunLike = {
  workflowId: string;
  chatId?: string | null;
  status: string;
  failureReason?: string | null;
  triggerData: Record<string, unknown> | null;
  steps: unknown[];
};

export type RunStepView = {
  label: string;
  type: string;
  status: string;
  error?: string;
  durationMs?: number;
  output?: Record<string, unknown>;
};

export type RunSummary = {
  workflowName: string;
  contact: string;
  message: string;
  isTest: boolean;
  /** The step that failed, or null when the run did not fail at a step. */
  stoppedAt: { label: string; error: string } | null;
  steps: RunStepView[];
  /** Steps of the flow that never ran (not reached, or on a branch that was not taken). */
  notRun: string[];
};

const prettyType = (type: string) => type.replace(/_/g, ' ');

export function contactOf(run: RunLike): string {
  const t = run.triggerData ?? {};
  const name = typeof t.contactName === 'string' ? t.contactName : '';
  const chat = String(run.chatId ?? t.chatId ?? t.from ?? '');
  // @lid ids are WhatsApp-internal, not phone numbers
  const number = /@c\.us$/.test(chat) ? `+${chat.replace(/@.*/, '')}` : '';
  return [name, number].filter(Boolean).join(' · ') || chat.replace(/@.*/, '') || '—';
}

export function summarizeRun(run: RunLike, workflow?: { name: string; definition?: Record<string, unknown> }): RunSummary {
  const nodes = (Array.isArray(workflow?.definition?.nodes) ? workflow.definition.nodes : []) as GraphNode[];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const labelOf = (id?: string, type?: string) =>
    byId.get(id ?? '')?.data?.label || (type ? prettyType(type) : id || 'step');

  const steps = ((run.steps ?? []) as Step[]).map(s => {
    const start = Date.parse(s.startedAt ?? '');
    const end = Date.parse(s.completedAt ?? '');
    return {
      label: labelOf(s.actionId, s.actionType),
      type: s.actionType ?? '',
      status: s.status ?? 'unknown',
      error: s.error,
      durationMs: Number.isFinite(start) && Number.isFinite(end) ? end - start : undefined,
      output: s.output,
    };
  });

  const failed = [...steps].reverse().find(s => s.status === 'failed');
  const ran = new Set(((run.steps ?? []) as Step[]).map(s => s.actionId));
  const notRun = nodes.filter(n => n.type !== 'trigger' && !ran.has(n.id)).map(n => labelOf(n.id, n.type));

  const t = run.triggerData ?? {};
  return {
    workflowName: workflow?.name ?? 'Deleted workflow',
    contact: contactOf(run),
    message: typeof t.messageBody === 'string' ? t.messageBody : '',
    isTest: t.isTest === true,
    stoppedAt:
      failed || run.status === 'failed'
        ? { label: failed?.label ?? 'Before the first step', error: failed?.error || run.failureReason || 'Failed' }
        : null,
    steps,
    notRun,
  };
}

export function matchesSearch(summary: RunSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [summary.contact, summary.message, summary.workflowName, summary.stoppedAt?.error ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}
