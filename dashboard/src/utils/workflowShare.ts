/**
 * Shareable workflow files. Export strips values tied to this account (connections, sheets, saved
 * messages) or to people (emails, phones, payee) and secrets (webhook URLs and headers), so the
 * file can go to anyone; the importer reconnects those in the builder.
 */
export const WORKFLOW_FILE_FORMAT = 'artha-workflow';

const PRIVATE_CONFIG_KEYS = [
  'integrationId',
  'emailIntegrationId',
  'spreadsheetId',
  'studioMessageId',
  'emailTo',
  'recipientPhone',
  'managerPhone',
  'chatId',
  'payeeVpa',
  'webhookUrl',
  'url',
  'headers',
];

export type WorkflowFile = {
  format: typeof WORKFLOW_FILE_FORMAT;
  version: 1;
  name: string;
  description: string | null;
  definition: Record<string, unknown>;
};

type Node = { data?: { config?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

function stripConfig(config: Record<string, unknown> | undefined) {
  if (!config) return config;
  const clean = { ...config };
  for (const key of PRIVATE_CONFIG_KEYS) if (key in clean) clean[key] = '';
  return clean;
}

export function toWorkflowFile(wf: {
  name: string;
  description: string | null;
  definition: Record<string, unknown>;
}): WorkflowFile {
  const def = wf.definition ?? {};
  const nodes = Array.isArray(def.nodes) ? (def.nodes as Node[]) : [];
  const actions = Array.isArray(def.actions) ? (def.actions as { config?: Record<string, unknown> }[]) : [];
  return {
    format: WORKFLOW_FILE_FORMAT,
    version: 1,
    name: wf.name,
    description: wf.description,
    definition: {
      ...def,
      nodes: nodes.map(n => ({ ...n, data: { ...n.data, config: stripConfig(n.data?.config) } })),
      actions: actions.map(a => ({ ...a, config: stripConfig(a.config) })),
    },
  };
}

/** Parses an uploaded file; throws a readable message when it is not a workflow export. */
export function parseWorkflowFile(text: string): WorkflowFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON');
  }
  const file = data as Partial<WorkflowFile>;
  if (file?.format !== WORKFLOW_FILE_FORMAT || typeof file.definition !== 'object' || !file.definition) {
    throw new Error('This is not an exported workflow file');
  }
  if (typeof file.name !== 'string' || !file.name.trim()) throw new Error('The workflow file has no name');
  return file as WorkflowFile;
}

export function workflowFileName(name: string) {
  return `${name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'workflow'}.workflow.json`;
}
