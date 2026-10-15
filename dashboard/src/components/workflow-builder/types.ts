export interface WorkflowNodeData {
  label: string;
  type: string;
  config: Record<string, any>;
  description?: string;
  [key: string]: any;
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
  | 'dynamic_language_switcher';

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
  defaultConfig: Record<string, any>;
}
