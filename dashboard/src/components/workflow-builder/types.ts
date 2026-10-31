/**
 * Free-form per-node-type config blob (JSON shaped by the node's type); the inspector reads it by key.
 * Typed `any` deliberately and only here: a precise union per node type is out of scope for ~40 node kinds.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- user-defined JSON config differing per node type
export type NodeConfig = Record<string, any>;

/** One row of a `set_fields` node's `assignments` config. */
export interface FieldAssignment {
  name?: string;
  value?: string;
}

/** One row of a `webhook_call` node's `responseMapping` config. */
export interface ResponseMapping {
  variable?: string;
  path?: string;
  example?: unknown;
}

export interface WorkflowNodeData {
  label: string;
  type: string;
  config: NodeConfig;
  description?: string;
  [key: string]: unknown;
}

export type CanvasNodeType =
  | 'trigger'
  | 'send_message'
  | 'interactive_buttons'
  | 'ask_question'
  | 'condition_branch'
  | 'wait'
  | 'ai_assistant'
  | 'handoff_to_human'
  | 'add_tag'
  | 'webhook_call'
  | 'set_fields'
  | 'filter'
  | 'stop_workflow'
  | 'google_sheets'
  | 'sheets_lookup'
  | 'send_media'
  | 'search_agents'
  | 'create_lead'
  | 'validate_pincode'
  | 'send_contact_vcard'
  | 'send_document'
  | 'send_voice_note'
  | 'working_hours_gateway'
  | 'internal_alert'
  | 'ab_test_split'
  | 'dnd_manager'
  | 'financial_calculator'
  | 'payment_link'
  | 'ai_document_ocr'
  | 'dynamic_pdf_generator'
  | 'send_carousel_template'
  | 'interactive_cta_template'
  | 'dynamic_language_switcher'
  | 'send_studio_message'
  | 'send_whatsapp_form'
  | 'schedule_followup';

export interface ButtonItem {
  id: string;
  text: string;
}

export interface NodePaletteItem {
  type: CanvasNodeType;
  title: string;
  category: 'message' | 'logic' | 'ai' | 'action';
  description: string;
  iconName: string;
  defaultConfig: NodeConfig;
}
