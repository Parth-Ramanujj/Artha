/**
 * What still needs attention in a workflow, in plain words. Pure: it only reads the canvas, so the
 * live checklist and the "Check" button always agree.
 */
export interface WorkflowIssue {
  level: 'error' | 'warning';
  message: string;
  /** The step to jump to when the user clicks this issue. */
  nodeId?: string;
}

interface CanvasNodeLike {
  id: string;
  type?: string;
  data?: unknown;
}

interface CanvasEdgeLike {
  source: string;
  target: string;
}

export function collectWorkflowIssues(nodes: CanvasNodeLike[], edges: CanvasEdgeLike[]): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const error = (message: string, nodeId?: string) => issues.push({ level: 'error', message, nodeId });
  const warning = (message: string, nodeId?: string) => issues.push({ level: 'warning', message, nodeId });

  if (!nodes.some(n => n.type === 'trigger')) {
    error('Add a trigger first. It starts the flow when a customer writes to you.');
  }

  for (const n of nodes) {
    const data = (n.data ?? {}) as { label?: string; config?: Record<string, unknown> };
    const label = data.label || n.id;
    const cfg: Record<string, unknown> = data.config ?? {};

    if (n.type === 'webhook_call' && !cfg.url) {
      error(`"${label}" needs a web address (URL) to call.`, n.id);
    }
    if (n.type === 'send_message' && !cfg.message) {
      warning(`"${label}" has no message text yet.`, n.id);
    }
    if (n.type === 'sheets_lookup' && (!cfg.integrationId || !cfg.spreadsheetId)) {
      error(`"${label}" needs a Google account and a spreadsheet chosen.`, n.id);
    }
    if (n.type === 'send_studio_message' && !cfg.studioMessageId) {
      error(`"${label}" needs a saved message chosen.`, n.id);
    }
    if (n.type === 'send_whatsapp_form' && !cfg.formId) {
      error(`"${label}" needs a published WhatsApp Form chosen.`, n.id);
    }
    if (n.type === 'interactive_buttons' && (!Array.isArray(cfg.buttons) || cfg.buttons.length === 0)) {
      error(`"${label}" needs at least one button.`, n.id);
    }
    // The engine reads the question from `question`, `prompt` or `message`; any of them counts.
    if (n.type === 'ask_question' && !cfg.question && !cfg.prompt && !cfg.message) {
      warning(`"${label}" has no question text yet.`, n.id);
    }
    if (n.type !== 'trigger' && !edges.some(e => e.target === n.id)) {
      warning(`"${label}" is not connected. Drag from the step before it to this one.`, n.id);
    }
  }

  return issues;
}

/** The four setup steps shown on the canvas, computed from the current nodes and edges. */
export function setupChecklist(nodes: CanvasNodeLike[], edges: CanvasEdgeLike[], issues: WorkflowIssue[]) {
  const hasTrigger = nodes.some(n => n.type === 'trigger');
  const steps = nodes.filter(n => n.type !== 'trigger');
  const allConnected = steps.every(n => edges.some(e => e.target === n.id));
  const errorCount = issues.filter(i => i.level === 'error').length;
  const warningCount = issues.filter(i => i.level === 'warning').length;
  return {
    trigger: hasTrigger,
    steps: steps.length > 0,
    connected: steps.length > 0 && allConnected,
    // Ready only when nothing is left to fix AND nothing is left to finish (warnings included).
    ready: hasTrigger && steps.length > 0 && errorCount === 0 && warningCount === 0,
    errorCount,
    warningCount,
  };
}
