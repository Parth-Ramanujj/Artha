// Pure helpers for Message Studio: message types, presets, limits and small list operations.
// Validation itself lives on the server (POST /message-studio/validate); this file only decides what
// the composer shows.

import type {
  ButtonAction,
  ReadinessIssue,
  Readiness,
  StudioButton,
  StudioCapabilities,
  StudioContent,
  StudioKind,
} from '../types/messageStudio.ts';

export type KindCategory = 'simple' | 'interactive' | 'products' | 'templates' | 'other';

export interface KindCard {
  /** Card id; several cards can open the same kind with a different start (e.g. product layouts). */
  id: string;
  kind: StudioKind;
  title: string;
  description: string;
  example: string;
  category: KindCategory;
  /** Lucide icon name the page maps to a component. */
  icon: string;
  /** What a number needs before this card's format can be sent as-is. */
  requires?: 'cloud' | 'cloud_catalog' | 'carousel_template';
  /** A supported format to use instead when the requirement is missing. */
  alternative?: string;
  start?: StudioContent;
}

export const KIND_CATEGORIES: Array<{ id: KindCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'simple', label: 'Simple Messages' },
  { id: 'interactive', label: 'Interactive Messages' },
  { id: 'products', label: 'Product Showcase' },
  { id: 'templates', label: 'Marketing Templates' },
  { id: 'other', label: 'Media & Other' },
];

export const KIND_CARDS: KindCard[] = [
  {
    id: 'audio',
    kind: 'audio',
    title: 'Audio / Voice Note',
    description: 'An audio file or a recorded voice note.',
    example: '🎙️ Voice note',
    category: 'other',
    icon: 'audio',
  },
  {
    id: 'sticker',
    kind: 'sticker',
    title: 'Sticker',
    description: 'A WebP sticker (static, under 100 KB).',
    example: '😄 Sticker',
    category: 'other',
    icon: 'sticker',
  },
  {
    id: 'address',
    kind: 'address',
    title: 'Address Request',
    description: 'Ask the customer for a delivery address in a form.',
    example: '🏠 Share your address',
    category: 'interactive',
    icon: 'home',
    requires: 'cloud',
    alternative: 'Ask for the address as a text question in a workflow instead.',
  },
  {
    id: 'location_request',
    kind: 'location_request',
    title: 'Location Request',
    description: 'Ask the customer to share their live or current location.',
    example: '📍 Share your location',
    category: 'interactive',
    icon: 'navigation',
    requires: 'cloud',
    alternative: 'Ask the customer to send their location as a text question.',
  },
  {
    id: 'flow',
    kind: 'flow',
    title: 'WhatsApp Flow',
    description: 'A multi-step form (e.g. booking, survey) built in Meta.',
    example: '📝 Book a slot',
    category: 'interactive',
    icon: 'form',
    requires: 'cloud',
    alternative: 'Build the Flow in Meta Business Manager first; you need its Flow ID.',
  },
  {
    id: 'reaction',
    kind: 'reaction',
    title: 'Reaction',
    description: 'React with an emoji to a customer’s message (from a workflow).',
    example: '👍 on their message',
    category: 'other',
    icon: 'smile',
  },
  {
    id: 'text',
    kind: 'text',
    title: 'Text Message',
    description: 'A plain message, with an optional link.',
    example: 'Hi! Thanks for contacting us 👋',
    category: 'simple',
    icon: 'message',
  },
  {
    id: 'image',
    kind: 'image',
    title: 'Image + Caption',
    description: 'A photo with a caption underneath.',
    example: '🖼️ New collection is here!',
    category: 'simple',
    icon: 'image',
  },
  {
    id: 'video',
    kind: 'video',
    title: 'Video Message',
    description: 'A short MP4 video with a caption.',
    example: '🎬 See how it works',
    category: 'other',
    icon: 'video',
  },
  {
    id: 'document',
    kind: 'document',
    title: 'Document / PDF',
    description: 'Send a brochure, price list or invoice.',
    example: '📄 Price-list.pdf',
    category: 'other',
    icon: 'file',
  },
  {
    id: 'buttons',
    kind: 'buttons',
    title: 'Quick Reply Buttons',
    description: 'Up to 3 buttons the customer taps to answer.',
    example: '[Track order] [Talk to us]',
    category: 'interactive',
    icon: 'buttons',
    requires: 'cloud',
    alternative: 'On other numbers the options go as a numbered menu.',
  },
  {
    id: 'list',
    kind: 'list',
    title: 'Interactive List',
    description: 'A menu of up to 10 options behind one button.',
    example: '☰ View options',
    category: 'interactive',
    icon: 'list',
    requires: 'cloud',
    alternative: 'On other numbers the options go as a numbered menu.',
  },
  {
    id: 'product',
    kind: 'products',
    title: 'Product Card',
    description: 'Show one product with its photo, price and link.',
    example: '🛍️ Cotton Kurta · ₹499',
    category: 'products',
    icon: 'bag',
    start: { productLayout: 'individual', products: [] },
  },
  {
    id: 'multi_product',
    kind: 'products',
    title: 'Product Catalog / Multi-Product',
    description: 'Several products from your WhatsApp catalog in one message.',
    example: '🛒 3 products',
    category: 'products',
    icon: 'grid',
    requires: 'cloud_catalog',
    alternative: 'Use Multiple Product Messages instead — works on every number.',
    start: { productLayout: 'native', products: [] },
  },
  {
    id: 'carousel',
    kind: 'template',
    title: 'Product Carousel',
    description: 'Swipeable cards from an approved carousel template.',
    example: '◀ card · card · card ▶',
    category: 'templates',
    icon: 'carousel',
    requires: 'cloud',
    alternative: 'Create a carousel template in Meta Business Manager first.',
  },
  {
    id: 'template',
    kind: 'template',
    title: 'Approved Template',
    description: 'A Meta-approved template — can reach people outside 24 hours.',
    example: '✅ order_update (en_US)',
    category: 'templates',
    icon: 'badge',
    requires: 'cloud',
    alternative: 'Use a Text Message instead.',
  },
  {
    id: 'location',
    kind: 'location',
    title: 'Location',
    description: 'Share your shop or office on the map.',
    example: '📍 Our store',
    category: 'other',
    icon: 'pin',
  },
  {
    id: 'contact',
    kind: 'contact',
    title: 'Contact Card',
    description: 'Share a phone contact the customer can save.',
    example: '👤 Sales team',
    category: 'other',
    icon: 'contact',
  },
];

export const KIND_LABEL: Record<StudioKind, string> = {
  audio: 'Audio',
  sticker: 'Sticker',
  address: 'Address',
  location_request: 'Location request',
  flow: 'Flow',
  reaction: 'Reaction',
  text: 'Text',
  image: 'Image',
  video: 'Video',
  document: 'Document',
  buttons: 'Buttons',
  list: 'List',
  products: 'Products',
  template: 'Template',
  location: 'Location',
  contact: 'Contact',
};

/** Whether a card's format can be sent as-is from this number, and why not. */
export function cardAvailability(
  card: KindCard,
  caps: StudioCapabilities | undefined,
): { available: boolean; reason?: string } {
  if (!card.requires) return { available: true };
  if (!caps?.cloudApi) {
    return { available: false, reason: 'Needs a WhatsApp Cloud API number.' };
  }
  if (card.requires === 'cloud_catalog' && !caps.catalogConfigured) {
    return { available: false, reason: 'Connect your Meta catalog in Product Catalog first.' };
  }
  return { available: true };
}

/** Mirrors the server's WhatsApp limits, for counters next to fields. */
export const LIMITS = {
  text: 4096,
  caption: 1024,
  interactiveBody: 1024,
  header: 60,
  footer: 60,
  replyButtons: 3,
  buttonLabel: 20,
  listButtonLabel: 20,
  listRows: 10,
  rowTitle: 24,
  rowDescription: 72,
  sectionTitle: 24,
  productNote: 120,
  individualProducts: 10,
  nativeProducts: 30,
  mediaBytes: 5 * 1024 * 1024,
} as const;

export const MEDIA_ACCEPT: Record<'image' | 'video' | 'document' | 'audio' | 'sticker', string> = {
  audio: 'audio/ogg,audio/mpeg,audio/mp4,audio/aac,audio/amr',
  sticker: 'image/webp',
  image: 'image/jpeg,image/png,image/webp',
  video: 'video/mp4,video/3gpp',
  document:
    'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain',
};

export function bodyLimit(kind: StudioKind, content: StudioContent): number {
  if (kind === 'text') return LIMITS.text;
  if (kind === 'image' || kind === 'video' || kind === 'document') return LIMITS.caption;
  if (kind === 'products' && (content.productLayout ?? 'individual') === 'individual') return LIMITS.text;
  return LIMITS.interactiveBody;
}

export interface ButtonActionMeta {
  label: string;
  help: string;
  /** Comes back to the bot as a choice. */
  reply: boolean;
}

export const BUTTON_ACTIONS: Record<ButtonAction, ButtonActionMeta> = {
  quick_reply: {
    label: 'Quick Reply',
    help: 'The customer taps it and their choice comes back to your automation, which can answer it.',
    reply: true,
  },
  talk_to_human: {
    label: 'Talk to Human',
    help: 'A quick reply with the fixed id "talk_to_human" — connect it to a hand-off step in your automation.',
    reply: true,
  },
  browse_products: {
    label: 'View Products',
    help: 'A quick reply with the fixed id "browse_products" — connect it to a product message in your automation.',
    reply: true,
  },
  open_url: {
    label: 'Open Website',
    help: 'Opens a web page. It does not place an order or tell your bot that it was tapped.',
    reply: false,
  },
  view_product: {
    label: 'View Product',
    help: "Opens a product's page from your catalog. It does not place an order.",
    reply: false,
  },
  call: {
    label: 'Call Business',
    help: 'Call buttons are only possible inside an approved WhatsApp template.',
    reply: false,
  },
  view_catalog: {
    label: 'View Catalog',
    help: 'Opens your WhatsApp catalog. Needs a Cloud API number with a connected Meta catalog.',
    reply: false,
  },
};

/** Button actions the composer offers for a kind (the server checks the same rule). */
export function allowedButtonActions(kind: StudioKind): ButtonAction[] {
  switch (kind) {
    case 'buttons':
      return ['quick_reply', 'talk_to_human', 'browse_products'];
    case 'text':
    case 'image':
    case 'video':
    case 'document':
      return ['open_url', 'view_product', 'call', 'view_catalog'];
    default:
      return [];
  }
}

/** A stable reply id from a label, unique among the existing ids: "Book a demo" → "book_a_demo". */
export function uniqueSlug(label: string, taken: string[], fallback = 'option'): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || fallback;
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
}

export function newButton(kind: StudioKind, existing: StudioButton[]): StudioButton {
  const action = allowedButtonActions(kind)[0] ?? 'quick_reply';
  const label = BUTTON_ACTIONS[action].reply ? `Option ${existing.length + 1}` : 'Learn more';
  return {
    id: uniqueSlug(
      label,
      existing.map(b => b.id),
    ),
    label,
    action,
  };
}

/** Moves one item; out-of-range moves return the list unchanged. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Issues for a field and anything under it ("buttons" matches "buttons.0"). */
export function issuesFor(issues: ReadinessIssue[] | undefined, field: string): ReadinessIssue[] {
  return (issues ?? []).filter(i => i.field === field || i.field.startsWith(`${field}.`));
}

export const READINESS_META: Record<Readiness, { label: string; tone: 'success' | 'warning' | 'error' | 'info' }> = {
  ready: { label: 'Ready to Test', tone: 'success' },
  needs_attention: { label: 'Needs Attention', tone: 'warning' },
  template_required: { label: 'Template Approval Required', tone: 'info' },
  catalog_required: { label: 'Catalog Setup Required', tone: 'info' },
  unsupported: { label: 'Unsupported Format', tone: 'error' },
};

/** Empty content for a kind, with the card's start values on top. */
export function defaultContent(kind: StudioKind, start?: StudioContent): StudioContent {
  const base: Record<StudioKind, StudioContent> = {
    text: { text: '' },
    image: { text: '', media: { source: 'url', url: '' } },
    video: { text: '', media: { source: 'url', url: '' } },
    document: { text: '', media: { source: 'url', url: '' } },
    buttons: {
      text: '',
      buttons: [
        { id: 'yes', label: 'Yes', action: 'quick_reply' },
        { id: 'no', label: 'No', action: 'quick_reply' },
      ],
    },
    list: {
      text: '',
      list: { buttonLabel: 'View options', sections: [{ title: '', rows: [{ id: 'option_1', title: 'Option 1' }] }] },
    },
    products: { text: '', productLayout: 'individual', products: [] },
    template: { template: { name: '', language: 'en_US', variables: [] } },
    location: { location: { latitude: 0, longitude: 0, name: '', address: '' } },
    contact: { contact: { name: '', phone: '' } },
    audio: { media: { source: 'url', url: '' } },
    sticker: { media: { source: 'url', url: '' } },
    address: { text: '', addressCountry: 'IN' },
    location_request: { text: '' },
    flow: { text: '', flow: { id: '', cta: 'Start', screen: '' } },
    reaction: { reaction: { emoji: '👍' } },
  };
  return { ...base[kind], ...(start ?? {}) };
}

export interface Preset {
  key: string;
  name: string;
  description: string;
  kind: StudioKind;
  content: StudioContent;
  /** What the user still has to do; sample text is clearly sample text. */
  todo: string;
}

export const SAMPLE_PREFIX = '[Sample] ';

export const PRESETS: Preset[] = [
  {
    key: 'welcome',
    name: 'Welcome Message',
    description: 'Greet new customers and offer the main options.',
    kind: 'buttons',
    todo: 'Edit the greeting and the three options.',
    content: {
      text: `${SAMPLE_PREFIX}Hi {{trigger.contactName}}! 👋 Welcome to our store. How can we help you today?`,
      buttons: [
        { id: 'browse_products', label: 'View Products', action: 'browse_products' },
        { id: 'track_order', label: 'Track my order', action: 'quick_reply' },
        { id: 'talk_to_human', label: 'Talk to us', action: 'talk_to_human' },
      ],
    },
  },
  {
    key: 'product_recommendation',
    name: 'Product Recommendation',
    description: 'Recommend a few products with photos and prices.',
    kind: 'products',
    todo: 'Select the products to recommend.',
    content: { text: `${SAMPLE_PREFIX}We think you'll love these 💚`, productLayout: 'individual', products: [] },
  },
  {
    key: 'daily_offers',
    name: 'Daily Offers',
    description: 'A banner image with a link to today’s deals.',
    kind: 'image',
    todo: 'Add your offer image and your website link.',
    content: {
      text: `${SAMPLE_PREFIX}🔥 Today only: special prices on our bestsellers!`,
      media: { source: 'url', url: '' },
      buttons: [{ id: 'shop', label: 'Shop offers', action: 'open_url', url: '' }],
    },
  },
  {
    key: 'product_details',
    name: 'Product Details',
    description: 'One product with a “View Product” button.',
    kind: 'text',
    todo: 'Pick the product the button opens.',
    content: {
      text: `${SAMPLE_PREFIX}Here are the details you asked for 👇`,
      buttons: [{ id: 'view', label: 'View Product', action: 'view_product' }],
    },
  },
  {
    key: 'browse_categories',
    name: 'Browse Categories',
    description: 'A list menu of your product categories.',
    kind: 'list',
    todo: 'Rename the categories to match your shop.',
    content: {
      text: `${SAMPLE_PREFIX}What are you shopping for today?`,
      list: {
        buttonLabel: 'Browse',
        sections: [
          {
            title: 'Categories',
            rows: [
              { id: 'new_arrivals', title: 'New arrivals' },
              { id: 'bestsellers', title: 'Bestsellers' },
              { id: 'sale', title: 'On sale', description: 'Up to 50% off' },
            ],
          },
        ],
      },
    },
  },
  {
    key: 'order_confirmation',
    name: 'Order Confirmation',
    description: 'Confirm an order (approved template on Cloud API).',
    kind: 'template',
    todo: 'Choose your approved order-confirmation template and fill its variables.',
    content: { template: { name: '', language: 'en_US', variables: [] } },
  },
  {
    key: 'shipping_update',
    name: 'Shipping Update',
    description: 'Tell the customer their order is on the way.',
    kind: 'text',
    todo: 'Add your tracking link.',
    content: {
      text: `${SAMPLE_PREFIX}Good news {{trigger.contactName}}! 🚚 Your order is on its way.`,
      buttons: [{ id: 'track', label: 'Track shipment', action: 'open_url', url: '' }],
    },
  },
  {
    key: 'customer_support',
    name: 'Customer Support',
    description: 'Let customers pick what they need help with.',
    kind: 'list',
    todo: 'Edit the support topics.',
    content: {
      text: `${SAMPLE_PREFIX}Sorry to hear you need help. What is it about?`,
      list: {
        buttonLabel: 'Choose topic',
        sections: [
          {
            title: 'Support',
            rows: [
              { id: 'order_issue', title: 'Problem with an order' },
              { id: 'returns', title: 'Returns & refunds' },
              { id: 'talk_to_human', title: 'Talk to a person' },
            ],
          },
        ],
      },
    },
  },
  {
    key: 'talk_to_human',
    name: 'Talk to Human',
    description: 'Offer a hand-off to your team.',
    kind: 'buttons',
    todo: 'Connect the “Talk to us” branch to a hand-off step in your automation.',
    content: {
      text: `${SAMPLE_PREFIX}Would you like to chat with someone from our team?`,
      buttons: [
        { id: 'talk_to_human', label: 'Yes, talk to us', action: 'talk_to_human' },
        { id: 'no_thanks', label: 'No, thanks', action: 'quick_reply' },
      ],
    },
  },
  {
    key: 'promo_showcase',
    name: 'Promotional Product Showcase',
    description: 'An intro line followed by your featured products.',
    kind: 'products',
    todo: 'Select your featured products.',
    content: {
      text: `${SAMPLE_PREFIX}✨ Featured this week — tap a link to order.`,
      productLayout: 'individual',
      products: [],
    },
  },
];

/** True while the text still contains preset sample copy the user has not replaced. */
export function hasSampleText(content: StudioContent): boolean {
  return [content.text, content.header, content.footer].some(t => (t ?? '').includes(SAMPLE_PREFIX.trim()));
}

/** "₹499" — display only; the server sends the stored price. */
export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(price) ? 0 : 2,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

/** Reads a file as base64 (without the data: prefix). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/** Only absolute https links are shown as images or links in the preview (no javascript:, data: …). */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Workflow variables the composer offers; they are filled in when an automation sends the message. */
export const VARIABLES = [
  { token: '{{trigger.contactName}}', label: 'Customer name' },
  { token: '{{trigger.phone}}', label: 'Phone' },
  { token: '{{trigger.message}}', label: 'Their last message' },
];
