/** Triggers the server lets a rule scope to a deal stage (see assertLifecycleConditions on the API). */
export const STAGE_CAPABLE_TRIGGERS = ['no_reply', 'conversation_idle'];

export const DEAL_STAGE_OPTIONS = [
  { id: 'lead', label: 'New Leads' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'proposal', label: 'Proposal Sent' },
  { id: 'negotiation', label: 'Negotiation' },
] as const;

type Conditions = Record<string, unknown> | null | undefined;

/** Form values from a saved rule: the stage, and the follow-up steps after the first message. */
export function lifecycleFromConditions(conditions: Conditions): { dealStage: string; steps: string[] } {
  const dealStage = typeof conditions?.dealStage === 'string' ? conditions.dealStage : '';
  const messages = Array.isArray(conditions?.messages) ? conditions.messages.map(String) : [];
  return { dealStage, steps: messages.slice(1) };
}

/**
 * Conditions to send for a non-morning rule, or undefined to leave the saved ones untouched.
 * Keeps any other condition (e.g. chatIds) and removes stage/steps the user cleared.
 */
export function buildLifecycleConditions(input: {
  existing: Conditions;
  trigger: string;
  message: string;
  dealStage: string;
  steps: string[];
}): Record<string, unknown> | undefined {
  const { existing, trigger, message, dealStage, steps } = input;
  const base: Record<string, unknown> = { ...(existing ?? {}) };
  const hadLifecycle = base.dealStage !== undefined || base.messages !== undefined;
  delete base.dealStage;
  delete base.messages;

  let added = false;
  if (STAGE_CAPABLE_TRIGGERS.includes(trigger)) {
    if (dealStage) {
      base.dealStage = dealStage;
      added = true;
    }
    const extra = steps.map(s => s.trim()).filter(Boolean);
    if (extra.length > 0) {
      base.messages = [message.trim(), ...extra];
      added = true;
    }
  }
  return added || hadLifecycle ? base : undefined;
}
