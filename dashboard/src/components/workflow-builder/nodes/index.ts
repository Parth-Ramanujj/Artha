import { TriggerNode } from './TriggerNode';
import { MessageNode } from './MessageNode';
import { ButtonsNode } from './ButtonsNode';
import { QuestionNode } from './QuestionNode';
import { BranchNode } from './BranchNode';
import { DelayNode } from './DelayNode';
import { AiNode } from './AiNode';
import { HandoffNode } from './HandoffNode';
import { TagNode } from './TagNode';
import { WebhookNode } from './WebhookNode';
import { SetFieldsNode } from './SetFieldsNode';
import { FilterNode } from './FilterNode';
import { StopNode } from './StopNode';
import { GoogleSheetsNode } from './GoogleSheetsNode';
import { MediaNode } from './MediaNode';
import { SearchAgentsNode } from './SearchAgentsNode';
import { CreateLeadNode } from './CreateLeadNode';
import { ValidatePincodeNode } from './ValidatePincodeNode';
import { ContactVCardNode } from './ContactVCardNode';
import { WorkingHoursNode } from './WorkingHoursNode';
import { InternalAlertNode } from './InternalAlertNode';
import { ABTestNode } from './ABTestNode';
import { FinancialCalcNode } from './FinancialCalcNode';
import { PaymentLinkNode } from './PaymentLinkNode';
import { AiOcrNode } from './AiOcrNode';
import { CarouselTemplateNode } from './CarouselTemplateNode';

export const nodeTypes = {
  trigger: TriggerNode,
  send_message: MessageNode,
  interactive_buttons: ButtonsNode,
  ask_question: QuestionNode,
  condition_branch: BranchNode,
  wait: DelayNode,
  ai_assistant: AiNode,
  handoff_to_human: HandoffNode,
  add_tag: TagNode,
  webhook_call: WebhookNode,
  set_fields: SetFieldsNode,
  filter: FilterNode,
  stop_workflow: StopNode,
  google_sheets: GoogleSheetsNode,
  send_media: MediaNode,
  search_agents: SearchAgentsNode,
  create_lead: CreateLeadNode,
  validate_pincode: ValidatePincodeNode,
  send_contact_vcard: ContactVCardNode,
  send_document: MediaNode,
  send_voice_note: MediaNode,
  working_hours_gateway: WorkingHoursNode,
  internal_alert: InternalAlertNode,
  ab_test_split: ABTestNode,
  dnd_manager: StopNode,
  financial_calculator: FinancialCalcNode,
  payment_link: PaymentLinkNode,
  ai_document_ocr: AiOcrNode,
  dynamic_pdf_generator: MediaNode,
  send_carousel_template: CarouselTemplateNode,
  interactive_cta_template: ButtonsNode,
  dynamic_language_switcher: BranchNode,
};

export {
  TriggerNode,
  MessageNode,
  ButtonsNode,
  QuestionNode,
  BranchNode,
  DelayNode,
  AiNode,
  HandoffNode,
  TagNode,
  WebhookNode,
  SetFieldsNode,
  FilterNode,
  StopNode,
  GoogleSheetsNode,
  MediaNode,
  SearchAgentsNode,
  CreateLeadNode,
  ValidatePincodeNode,
  ContactVCardNode,
  WorkingHoursNode,
  InternalAlertNode,
  ABTestNode,
  FinancialCalcNode,
  PaymentLinkNode,
  AiOcrNode,
  CarouselTemplateNode,
};
