// Shapes shared with the backend Message Studio module (src/modules/message-studio/studio-content.ts).

export type StudioKind =
  | 'text'
  | 'image'
  | 'video'
  | 'document'
  | 'buttons'
  | 'list'
  | 'products'
  | 'template'
  | 'location'
  | 'contact'
  | 'audio'
  | 'sticker'
  | 'address'
  | 'location_request'
  | 'flow'
  | 'reaction';

export type ProductLayout = 'individual' | 'native' | 'carousel';

export type ButtonAction =
  'quick_reply' | 'talk_to_human' | 'browse_products' | 'open_url' | 'view_product' | 'call' | 'view_catalog';

export interface StudioButton {
  id: string;
  label: string;
  action: ButtonAction;
  url?: string;
  phone?: string;
  productId?: string;
}

export interface StudioListRow {
  id: string;
  title: string;
  description?: string;
}

export interface StudioListSection {
  title: string;
  rows: StudioListRow[];
}

export interface StudioMedia {
  source: 'url' | 'upload';
  url?: string;
  base64?: string;
  mimetype?: string;
  filename?: string;
}

export interface StudioProductRef {
  productId: string;
  note?: string;
}

export interface StudioContent {
  text?: string;
  url?: string;
  header?: string;
  footer?: string;
  media?: StudioMedia;
  buttons?: StudioButton[];
  list?: { buttonLabel: string; sections: StudioListSection[] };
  products?: StudioProductRef[];
  productLayout?: ProductLayout;
  template?: {
    name: string;
    language: string;
    variables: string[];
    headerMediaUrl?: string;
    cards?: Array<{ headerMediaUrl?: string; variables: string[] }>;
  };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contact?: { name: string; phone: string };
  addressCountry?: string;
  flow?: { id: string; cta: string; screen: string };
  reaction?: { emoji: string };
}

export type Readiness = 'ready' | 'needs_attention' | 'template_required' | 'catalog_required' | 'unsupported';

export interface ReadinessIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface StudioCapabilities {
  sessionId: string;
  engine: string;
  connected: boolean;
  cloudApi: boolean;
  catalogConfigured: boolean;
}

export interface StudioProduct {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  productUrl: string | null;
  inStock: boolean;
  retailerId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  readiness: Readiness;
  issues: ReadinessIssue[];
  deliveryNote?: string;
  capabilities: StudioCapabilities;
  products: Array<
    Pick<
      StudioProduct,
      'id' | 'name' | 'price' | 'currency' | 'imageUrl' | 'productUrl' | 'inStock' | 'retailerId' | 'archived'
    >
  >;
}

export interface StudioTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  bodyText: string;
  bodyVariableCount: number;
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  headerText?: string;
  footerText?: string;
  buttons: Array<{ type: string; text: string }>;
  isCarousel: boolean;
  carouselCards?: Array<{ headerFormat: 'IMAGE' | 'VIDEO' | 'NONE'; bodyVariableCount: number }>;
  rejectedReason?: string;
  /** NAMED templates use {{first_name}}-style variables, listed in bodyVariables in order. */
  parameterFormat?: 'NAMED';
  bodyVariables?: string[];
  /** The one variable a TEXT header may hold ("1" or a name). */
  headerVariable?: string;
}

/** The template builder form, as POST /message-studio/templates takes it. */
export type MetaButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'VOICE_CALL' | 'COPY_CODE' | 'FLOW';
export type MetaHeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
export type StudioMediaMime = 'image/jpeg' | 'image/png' | 'video/mp4' | 'application/pdf';

export interface NewMetaTemplate {
  sessionId: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  parameterFormat?: 'POSITIONAL' | 'NAMED';
  headerFormat?: MetaHeaderFormat;
  headerText?: string;
  headerExample?: string;
  headerMedia?: { base64: string; mimetype: StudioMediaMime; filename: string };
  ttlSeconds?: number;
  body: string;
  bodyExamples?: string[];
  footer?: string;
  buttons?: Array<{
    type: MetaButtonType;
    text: string;
    url?: string;
    phone?: string;
    code?: string;
    flowId?: string;
    flowScreen?: string;
  }>;
  /** Send to this phone once approved (only when free). */
  autoTestPhone?: string;
}

/** A template waiting to be sent to the test phone after approval, and what happened. */
export interface TemplateAutoTest {
  sessionId: string;
  name: string;
  language: string;
  phone: string;
  state: 'waiting' | 'sent' | 'not_sent' | 'rejected' | 'expired';
  note?: string;
  createdAt: string;
  doneAt?: string;
}

export type StudioMessageStatus = 'draft' | 'ready' | 'archived';

export interface StudioTestResult {
  at: string;
  sessionId: string;
  recipient: string;
  parts: Array<{ type: string; status: 'submitted' | 'failed'; messageId?: string; error?: string }>;
}

export interface StudioMessage {
  id: string;
  name: string;
  kind: StudioKind;
  status: StudioMessageStatus;
  content: StudioContent;
  presetKey: string | null;
  readiness: Readiness;
  lastTest: StudioTestResult | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  usedIn?: Array<{ workflowId: string; name: string; status: string }>;
}

export interface PublishedStudioMessage {
  id: string;
  name: string;
  kind: StudioKind;
  choices: Array<{ id: string; text: string }>;
}
