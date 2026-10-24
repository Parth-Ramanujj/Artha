/**
 * Turns a test run's steps into the bubbles a customer would see on WhatsApp. Pure and defensive:
 * it only reads a step's type and output, so it works with any flow and never throws on odd data.
 * The backend runs the flow in dry-run (nothing is really sent); these bubbles are that preview.
 */

export interface SimBubble {
  /** A stable key for React lists. */
  key: string;
  kind: 'text' | 'buttons' | 'list' | 'media' | 'note';
  text?: string;
  /** Quick-reply button labels, for the 'buttons' kind. */
  buttons?: string[];
  /** List rows, for the 'list' kind. */
  items?: string[];
  /** image / video / document / audio, for the 'media' kind. */
  mediaKind?: string;
}

interface StepLike {
  actionId?: string;
  actionType?: string;
  status?: string;
  output?: Record<string, unknown> | null;
  error?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : str((x as { text?: unknown })?.text ?? x))).filter(Boolean) : [];

/** One step → zero or more customer-facing bubbles. Non-messaging steps (filters, lead records…) add none. */
function stepToBubbles(step: StepLike, index: number): SimBubble[] {
  const key = step.actionId || `step-${index}`;
  const type = step.actionType || '';
  const out = (step.output ?? {}) as Record<string, unknown>;

  if (step.status === 'failed') {
    return [{ key, kind: 'note', text: `⚠️ This step failed: ${step.error || 'unknown error'}` }];
  }

  switch (type) {
    case 'send_message':
      return out.text ? [{ key, kind: 'text', text: str(out.text) }] : [];

    case 'interactive_buttons': {
      const buttons = strList(out.buttons);
      return [{ key, kind: 'buttons', text: str(out.message || out.text), buttons }];
    }

    case 'send_studio_message': {
      // Studio dry-run carries no rendered text; show the message name so the path is clear.
      const name = str(out.name || out.studioMessageId);
      return [{ key, kind: 'note', text: name ? `Sends the saved message “${name}”.` : 'Sends a saved Studio message.' }];
    }

    case 'send_whatsapp_form': {
      // A simulated run cannot open or submit the form, so it notes the send and moves on.
      const name = str(out.formName || out.formId);
      return [{ key, kind: 'note', text: name ? `Sends the WhatsApp Form “${name}”.` : 'Sends a WhatsApp Form.' }];
    }

    case 'ask_question':
      return out.prompt || out.question ? [{ key, kind: 'text', text: str(out.prompt || out.question) }] : [];

    case 'send_media':
    case 'send_document':
    case 'send_voice_note':
      return [
        {
          key,
          kind: 'media',
          mediaKind: str(out.mediaType || (type === 'send_document' ? 'document' : type === 'send_voice_note' ? 'audio' : 'image')),
          text: str(out.caption || out.fileName),
        },
      ];

    case 'sheets_lookup': {
      const found = out.branch === 'found' || out.found === true;
      const replied = str(out.rowText || out.replyPreview);
      if (replied) return [{ key, kind: 'text', text: replied }];
      return [
        {
          key,
          kind: 'note',
          text: found ? 'Found the row in the sheet and replies with it.' : 'No matching row — sends the “not found” reply.',
        },
      ];
    }

    case 'search_agents': {
      const count = typeof out.count === 'number' ? out.count : strList(out.agents).length;
      return [{ key, kind: 'note', text: `Finds ${count || 'matching'} advisor(s) and shares them.` }];
    }

    default:
      return [];
  }
}

export function stepsToBubbles(steps: unknown): SimBubble[] {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((s, i) => stepToBubbles((s ?? {}) as StepLike, i));
}

interface NodeLike {
  type?: string;
  data?: { config?: Record<string, unknown> } | null;
}

/**
 * Quick-start chips for the simulator: the keywords that trigger the flow. A keyword trigger lists its
 * words; an "any message" trigger offers a couple of friendly samples.
 */
export function triggerSuggestions(nodes: unknown): string[] {
  const list = Array.isArray(nodes) ? (nodes as NodeLike[]) : [];
  const trigger = list.find(n => n.type === 'trigger');
  const cfg = (trigger?.data?.config ?? {}) as Record<string, unknown>;
  if (str(cfg.triggerType) === 'keyword_match') {
    const words = str(cfg.keyword)
      .split(',')
      .map(w => w.trim())
      .filter(Boolean);
    if (words.length) return words.slice(0, 6);
  }
  return ['Hi', 'Hello'];
}

/** A short, human label for a step in the "what happened" trace. */
export function stepTraceLabel(step: unknown, index: number): { label: string; ok: boolean } {
  const s = (step ?? {}) as StepLike;
  const ok = s.status !== 'failed';
  const type = (s.actionType || 'step').replace(/_/g, ' ');
  const branch = str((s.output as Record<string, unknown> | undefined)?.branch);
  return { label: `${index + 1}. ${type}${branch ? ` → ${branch}` : ''}`, ok };
}
