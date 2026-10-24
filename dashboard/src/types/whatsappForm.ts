// WhatsApp Forms (Meta WhatsApp Flows). Mirrors the backend's flow-definition.ts.

export const FLOW_CATEGORY_OPTIONS = [
  { value: 'OTHER', label: 'Other' },
  { value: 'LEAD_GENERATION', label: 'Lead generation' },
  { value: 'CONTACT_US', label: 'Contact us' },
  { value: 'APPOINTMENT_BOOKING', label: 'Appointment booking' },
  { value: 'SURVEY', label: 'Survey' },
  { value: 'FEEDBACK', label: 'Feedback' },
  { value: 'CUSTOMER_SUPPORT', label: 'Customer support' },
  { value: 'ORDER_MANAGEMENT', label: 'Order management' },
  { value: 'SIGN_UP', label: 'Sign up' },
  { value: 'SIGN_IN', label: 'Sign in' },
] as const;
export type FlowCategory = (typeof FLOW_CATEGORY_OPTIONS)[number]['value'];

export type FieldKind = 'short_text' | 'paragraph' | 'dropdown' | 'radio' | 'checkbox' | 'date' | 'opt_in';
export type DisplayKind = 'heading' | 'text' | 'image';
export type ComponentKind = FieldKind | DisplayKind;

export interface ChoiceOption {
  id: string;
  title: string;
}

export interface FormComponent {
  id: string;
  type: ComponentKind;
  name?: string;
  label?: string;
  required?: boolean;
  inputType?: 'text' | 'number' | 'email' | 'phone';
  options?: ChoiceOption[];
  text?: string;
  src?: string;
}

export interface FormScreen {
  id: string;
  title: string;
  components: FormComponent[];
}

export interface FormDefinition {
  screens: FormScreen[];
}

export type WhatsAppFormStatus = 'draft' | 'published';

export interface WhatsAppForm {
  id: string;
  businessId: string;
  name: string;
  category: FlowCategory;
  status: WhatsAppFormStatus;
  definition: FormDefinition;
  metaFlowId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppFormSubmission {
  id: string;
  formId: string;
  sessionId: string;
  chatId: string;
  answers: Record<string, unknown>;
  createdAt: string;
}

export interface PublishResult {
  published: boolean;
  metaFlowId: string | null;
  errors: string[];
}
