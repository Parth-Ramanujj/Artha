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
};
