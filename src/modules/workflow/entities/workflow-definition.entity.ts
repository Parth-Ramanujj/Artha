import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum WorkflowStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DISABLED = 'disabled',
}

export enum TriggerType {
  MESSAGE_RECEIVED = 'message_received',
  KEYWORD_MATCH = 'keyword_match',
  NEW_CONTACT = 'new_contact',
  CONVERSATION_ASSIGNED = 'conversation_assigned',
  CONVERSATION_STATUS_CHANGED = 'conversation_status_changed',
  SCHEDULED = 'scheduled',
  MESSAGE_FAILED = 'message_failed',
}

export enum ConditionType {
  BUSINESS_MATCH = 'business_match',
  SESSION_MATCH = 'session_match',
  KEYWORD_EXACT = 'keyword_exact',
  KEYWORD_CONTAINS = 'keyword_contains',
  CONVERSATION_STATUS = 'conversation_status',
  CONTACT_TAG = 'contact_tag',
  WORKING_HOURS = 'working_hours',
}

export enum ActionType {
  SEND_MESSAGE = 'send_message',
  SEND_TEMPLATE = 'send_template',
  INTERACTIVE_BUTTONS = 'interactive_buttons',
  INTERACTIVE_LIST = 'interactive_list',
  ASK_QUESTION = 'ask_question',
  CONDITION_BRANCH = 'condition_branch',
  WAIT_FOR_REPLY = 'wait_for_reply',
  AI_ASSISTANT = 'ai_assistant',
  ASSIGN_CONVERSATION = 'assign_conversation',
  UPDATE_CONVERSATION_STATUS = 'update_conversation_status',
  ADD_TAG = 'add_tag',
  REMOVE_TAG = 'remove_tag',
  CREATE_CONTACT = 'create_contact',
  UPDATE_CONTACT = 'update_contact',
  SCHEDULE_FOLLOWUP = 'schedule_followup',
  HANDOFF_TO_HUMAN = 'handoff_to_human',
  PAUSE_AUTOMATION = 'pause_automation',
  WEBHOOK_CALL = 'webhook_call',
  WAIT = 'wait',
  TYPING_INDICATOR = 'typing_indicator',
  MARK_AS_READ = 'mark_as_read',
  SEND_REACTION = 'send_reaction',
  SEND_LOCATION = 'send_location',
  SET_FIELDS = 'set_fields',
  FILTER = 'filter',
  STOP_WORKFLOW = 'stop_workflow',
  GOOGLE_SHEETS = 'google_sheets',
  SEND_MEDIA = 'send_media',
  SEARCH_AGENTS = 'search_agents',
  CREATE_LEAD = 'create_lead',
  VALIDATE_PINCODE = 'validate_pincode',
  SEND_CONTACT_VCARD = 'send_contact_vcard',
  SEND_DOCUMENT = 'send_document',
  SEND_VOICE_NOTE = 'send_voice_note',
  WORKING_HOURS_GATEWAY = 'working_hours_gateway',
  INTERNAL_ALERT = 'internal_alert',
  AB_TEST_SPLIT = 'ab_test_split',
  DND_MANAGER = 'dnd_manager',
  FINANCIAL_CALCULATOR = 'financial_calculator',
  PAYMENT_LINK = 'payment_link',
  AI_DOCUMENT_OCR = 'ai_document_ocr',
  DYNAMIC_PDF_GENERATOR = 'dynamic_pdf_generator',
  SEND_CAROUSEL_TEMPLATE = 'send_carousel_template',
  INTERACTIVE_CTA_TEMPLATE = 'interactive_cta_template',
  DYNAMIC_LANGUAGE_SWITCHER = 'dynamic_language_switcher',
}

export interface WorkflowTrigger {
  type: TriggerType;
  config: Record<string, unknown>;
}

export interface WorkflowCondition {
  type: ConditionType;
  config: Record<string, unknown>;
  negate?: boolean;
}

export interface WorkflowAction {
  id: string;
  type: ActionType;
  config: Record<string, unknown>;
  onError?: 'stop' | 'skip' | 'retry';
  maxRetries?: number;
}

export interface VisualWorkflowNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data: {
    label?: string;
    config: Record<string, unknown>;
  };
}

export interface VisualWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface WorkflowDefinitionSchema {
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  nodes?: VisualWorkflowNode[];
  edges?: VisualWorkflowEdge[];
}

@Entity('workflow_definitions')
@Unique('UQ_workflow_slug_business', ['businessId', 'slug'])
export class WorkflowDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  businessId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: WorkflowStatus.DRAFT })
  status: WorkflowStatus;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: jsonColumnType() })
  definition: WorkflowDefinitionSchema;

  @Column({ type: 'integer', default: 100 })
  maxActionsPerRun: number;

  @Column({ type: 'integer', default: 300 })
  maxExecutionSeconds: number;

  @Column({ type: 'integer', default: 3 })
  maxRetries: number;

  @Column({ type: 'integer', default: 5 })
  maxConcurrentRuns: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  publishedBy: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  publishedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
