/**
 * What a Message Studio message is made of, and the rules that decide whether it can be sent.
 *
 * Everything here is pure: the service resolves products, templates and the sending number's
 * engine, then asks {@link checkReadiness} what is missing. The same check runs before a test send
 * and before a workflow sends the message, so the dashboard is never the one deciding.
 */

export const STUDIO_KINDS = [
  'text',
  'image',
  'video',
  'document',
  'buttons',
  'list',
  'products',
  'template',
  'location',
  'contact',
  'audio',
  'sticker',
  'address',
  'location_request',
  'flow',
  'reaction',
] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export const PRODUCT_LAYOUTS = ['individual', 'native', 'carousel'] as const;
export type ProductLayout = (typeof PRODUCT_LAYOUTS)[number];

/**
 * What a button does. Quick replies come back to the bot (a workflow branches on them); the
 * internal ones are quick replies with a fixed, allowlisted id the backend knows how to route.
 */
export const BUTTON_ACTIONS = [
  'quick_reply',
  'talk_to_human',
  'browse_products',
  'open_url',
  'view_product',
  'call',
  'view_catalog',
] as const;
export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

const REPLY_ACTIONS: ReadonlySet<ButtonAction> = new Set(['quick_reply', 'talk_to_human', 'browse_products']);
/** Fixed reply ids for the internal actions, so a workflow can route them without guessing. */
export const INTERNAL_REPLY_IDS: Partial<Record<ButtonAction, string>> = {
  talk_to_human: 'talk_to_human',
  browse_products: 'browse_products',
};

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
  /** Uploaded file, base64 without the data: prefix. */
  base64?: string;
  mimetype?: string;
  filename?: string;
}

export interface StudioProductRef {
  productId: string;
  /** Optional extra line under the price, e.g. "Free delivery today". Never replaces stored data. */
  note?: string;
}

export interface StudioContent {
  /** Message text, media caption, intro above products, or list/button body. */
  text?: string;
  /** Optional link appended to a text message. */
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
    /** Carousel templates: one entry per card, in the order Meta shows them. */
    cards?: Array<{ headerMediaUrl?: string; variables: string[] }>;
  };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contact?: { name: string; phone: string };
  /** Address and location-request messages: the country the address form is for (ISO code). */
  addressCountry?: string;
  /** WhatsApp Flow: the Flow id from Meta, the button text and the first screen id. */
  flow?: { id: string; cta: string; screen: string };
  /** Reaction: the emoji put on the customer's message. */
  reaction?: { emoji: string };
}

/** A product as stored in the catalog — the only source of name, price, image and stock. */
export interface ResolvedProduct {
  id: string;
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  productUrl: string | null;
  inStock: boolean;
  retailerId: string | null;
  archived: boolean;
}

/** An approved (or not) Meta template, as Meta reports it. */
export interface TemplateInfo {
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
  /** One entry per carousel card, in order: its header media kind and body variable count. */
  carouselCards?: Array<{ headerFormat: 'IMAGE' | 'VIDEO' | 'NONE'; bodyVariableCount: number }>;
}

export interface SendCapabilities {
  /** The number is on the official WhatsApp Cloud API (buttons, lists, product and template messages). */
  cloudApi: boolean;
  /** A Meta commerce catalog id is saved for this business. */
  catalogConfigured: boolean;
}

export type Readiness = 'ready' | 'needs_attention' | 'template_required' | 'catalog_required' | 'unsupported';

export interface ReadinessIssue {
  /** Which field the problem belongs to, so the composer can show it next to that field. */
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ReadinessResult {
  readiness: Readiness;
  issues: ReadinessIssue[];
  /** How the message will actually go out on this number, in plain words. */
  deliveryNote?: string;
}

/** WhatsApp limits (Cloud API interactive and message limits). */
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
  listSections: 10,
  rowTitle: 24,
  rowDescription: 72,
  sectionTitle: 24,
  productNote: 120,
  individualProducts: 10,
  nativeProducts: 30,
  mediaBytes: 5 * 1024 * 1024,
} as const;

export const MEDIA_MIME: Record<'image' | 'video' | 'document' | 'audio' | 'sticker', readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  sticker: ['image/webp'],
  audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'],
  video: ['video/mp4', 'video/3gpp'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ],
};

const ID_RE = /^[a-z0-9_-]{1,64}$/;

/** True for an absolute https URL (http is refused: WhatsApp and the media fetchers expect https). */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Bytes of a base64 payload without decoding it. */
export function base64Bytes(base64: string): number {
  const clean = base64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** A stable reply id from a label: "Book a demo" → "book_a_demo". */
export function slugId(label: string, fallback: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

/** "₹499" / "$12.50" — never trusts a price the client sent, only the stored one. */
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

/** Number of {{1}}, {{2}} … placeholders in a template body. */
export function countTemplateVariables(body: string): number {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(m[1]);
  return found.size;
}

/** Buttons that come back to the bot as a choice (so a workflow can branch on them). */
export function replyChoices(kind: StudioKind, content: StudioContent): Array<{ id: string; text: string }> {
  if (kind === 'list') {
    return (content.list?.sections ?? []).flatMap(s => s.rows.map(r => ({ id: r.id, text: r.title })));
  }
  return (content.buttons ?? [])
    .filter(b => REPLY_ACTIONS.has(b.action))
    .map(b => ({ id: INTERNAL_REPLY_IDS[b.action] ?? b.id, text: b.label }));
}

/** Which button actions make sense for a kind (the composer only offers these). */
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

interface Ctx {
  kind: StudioKind;
  content: StudioContent;
  products: Map<string, ResolvedProduct>;
  templates: TemplateInfo[] | null;
  caps: SendCapabilities;
}

const RANK: Record<Readiness, number> = {
  ready: 0,
  needs_attention: 1,
  catalog_required: 2,
  template_required: 3,
  unsupported: 4,
};

class Collector {
  issues: ReadinessIssue[] = [];
  readiness: Readiness = 'ready';
  deliveryNote?: string;

  error(field: string, message: string, readiness: Readiness = 'needs_attention'): void {
    this.issues.push({ field, message, severity: 'error' });
    if (RANK[readiness] > RANK[this.readiness]) this.readiness = readiness;
  }

  warn(field: string, message: string): void {
    this.issues.push({ field, message, severity: 'warning' });
  }
}

function checkLength(c: Collector, field: string, value: string | undefined, max: number, label: string): void {
  if (value && [...value].length > max) c.error(field, `${label} can be at most ${max} characters.`);
}

function checkMedia(
  c: Collector,
  kind: 'image' | 'video' | 'document' | 'audio' | 'sticker',
  media: StudioMedia | undefined,
): void {
  if (!media || (!media.url && !media.base64)) {
    c.error('media', `Add a ${kind === 'document' ? 'file' : kind} to continue.`);
    return;
  }
  if (media.source === 'url') {
    if (!isHttpsUrl(media.url)) c.error('media', 'Use a full https:// link to the file.');
    return;
  }
  if (!media.base64) {
    c.error('media', 'Upload the file again.');
    return;
  }
  if (!media.mimetype || !MEDIA_MIME[kind].includes(media.mimetype)) {
    c.error(
      'media',
      `This file type can't be sent as ${kind === 'image' ? 'an image' : kind === 'audio' ? 'an audio file' : `a ${kind}`}.`,
    );
  }
  if (base64Bytes(media.base64) > LIMITS.mediaBytes) c.error('media', 'The file is larger than 5 MB.');
}

function checkButtons(c: Collector, ctx: Ctx): void {
  const buttons = ctx.content.buttons ?? [];
  const allowed = allowedButtonActions(ctx.kind);
  const seen = new Set<string>();
  buttons.forEach((b, i) => {
    const field = `buttons.${i}`;
    if (!allowed.includes(b.action)) {
      c.error(field, 'This button type is not available for this message type.');
      return;
    }
    if (!b.label?.trim()) c.error(field, 'Give the button a label.');
    checkLength(c, field, b.label, LIMITS.buttonLabel, 'A button label');
    if (REPLY_ACTIONS.has(b.action)) {
      const id = INTERNAL_REPLY_IDS[b.action] ?? b.id;
      if (!ID_RE.test(id ?? '')) c.error(field, 'The button id may only use a-z, 0-9, _ and -.');
      if (seen.has(id)) c.error(field, 'Two buttons do the same thing; change one of them.');
      seen.add(id);
    }
    if (b.action === 'open_url' && !isHttpsUrl(b.url)) c.error(field, 'Enter a full https:// website link.');
    if (b.action === 'view_product') {
      const product = b.productId ? ctx.products.get(b.productId) : undefined;
      if (!product) c.error(field, 'Choose the product this button opens.');
      else if (!isHttpsUrl(product.productUrl)) c.error(field, `"${product.name}" has no https product link.`);
    }
    if (b.action === 'call') {
      c.error(
        field,
        'Call buttons need an approved WhatsApp template. Use an Approved Template message.',
        'template_required',
      );
    }
    if (b.action === 'view_catalog') {
      if (!ctx.caps.cloudApi) c.error(field, 'Catalog buttons need a WhatsApp Cloud API number.', 'unsupported');
      else if (!ctx.caps.catalogConfigured) {
        c.error(field, 'Connect your Meta catalog in Product Catalog first.', 'catalog_required');
      }
    }
  });

  if (ctx.kind === 'buttons') {
    if (buttons.length === 0) c.error('buttons', 'Add at least one button.');
    if (buttons.length > LIMITS.replyButtons)
      c.error('buttons', `WhatsApp allows at most ${LIMITS.replyButtons} reply buttons.`);
    if (!ctx.caps.cloudApi && buttons.length) {
      c.deliveryNote =
        'This number cannot show buttons, so the options are sent as a numbered menu the customer replies to.';
    }
  } else if (buttons.length > 1) {
    c.error('buttons', 'Only one link button can be added to this message.');
  } else if (buttons.length === 1 && !ctx.caps.cloudApi && ['open_url', 'view_product'].includes(buttons[0].action)) {
    c.deliveryNote = 'This number cannot show link buttons, so the link is added to the end of the text.';
  }
}

function checkList(c: Collector, ctx: Ctx): void {
  const list = ctx.content.list;
  if (!ctx.content.text?.trim()) c.error('text', 'Write the message shown above the list.');
  checkLength(c, 'text', ctx.content.text, LIMITS.interactiveBody, 'The message');
  if (!list?.buttonLabel?.trim()) c.error('list.buttonLabel', 'Name the button that opens the list.');
  checkLength(c, 'list.buttonLabel', list?.buttonLabel, LIMITS.listButtonLabel, 'The list button');
  const sections = list?.sections ?? [];
  const rows = sections.flatMap(s => s.rows);
  if (rows.length === 0) c.error('list', 'Add at least one option.');
  if (rows.length > LIMITS.listRows) c.error('list', `A list can have at most ${LIMITS.listRows} options in total.`);
  if (sections.length > LIMITS.listSections)
    c.error('list', `A list can have at most ${LIMITS.listSections} sections.`);
  const ids = new Set<string>();
  sections.forEach((s, si) => {
    if (sections.length > 1 && !s.title?.trim()) c.error(`list.sections.${si}`, 'Give every section a title.');
    checkLength(c, `list.sections.${si}`, s.title, LIMITS.sectionTitle, 'A section title');
    s.rows.forEach((r, ri) => {
      const field = `list.sections.${si}.rows.${ri}`;
      if (!r.title?.trim()) c.error(field, 'Give the option a title.');
      checkLength(c, field, r.title, LIMITS.rowTitle, 'An option title');
      checkLength(c, field, r.description, LIMITS.rowDescription, 'An option description');
      if (!ID_RE.test(r.id ?? '')) c.error(field, 'The option id may only use a-z, 0-9, _ and -.');
      if (ids.has(r.id)) c.error(field, 'Two options have the same id.');
      ids.add(r.id);
    });
  });
  if (!ctx.caps.cloudApi && rows.length) {
    c.deliveryNote = 'This number cannot show list messages, so the options are sent as a numbered menu.';
  }
}

function checkProducts(c: Collector, ctx: Ctx): void {
  const refs = ctx.content.products ?? [];
  const layout = ctx.content.productLayout ?? 'individual';
  if (refs.length === 0) {
    c.error('products', 'Select at least one product to continue.');
  }
  const seen = new Set<string>();
  refs.forEach((ref, i) => {
    const field = `products.${i}`;
    const product = ctx.products.get(ref.productId);
    if (seen.has(ref.productId)) c.error(field, 'This product is added twice.');
    seen.add(ref.productId);
    if (!product || product.archived) {
      c.error(field, 'This product no longer exists in the catalog. Remove it.');
      return;
    }
    if (!product.inStock) c.error(field, `"${product.name}" is out of stock. Remove it or mark it in stock.`);
    checkLength(c, field, ref.note, LIMITS.productNote, 'The extra line');
    if (layout === 'native' && !product.retailerId) {
      c.error(field, `"${product.name}" has no Meta catalog content id.`, 'catalog_required');
    }
    if (layout === 'individual' && !product.imageUrl) {
      c.warn(field, `"${product.name}" has no image, so it is sent as text.`);
    }
  });
  checkLength(
    c,
    'text',
    ctx.content.text,
    layout === 'individual' ? LIMITS.text : LIMITS.interactiveBody,
    'The message',
  );

  if (layout === 'carousel') {
    c.error(
      'productLayout',
      'Carousel requires an eligible approved WhatsApp template. Use Multiple Product Messages instead.',
      'template_required',
    );
  } else if (layout === 'native') {
    if (!ctx.caps.cloudApi) {
      c.error(
        'productLayout',
        'Native product messages need a WhatsApp Cloud API number. Use Multiple Product Messages instead.',
        'unsupported',
      );
    } else if (!ctx.caps.catalogConfigured) {
      c.error('productLayout', 'Connect your Meta catalog in Product Catalog first.', 'catalog_required');
    }
    if (refs.length > LIMITS.nativeProducts)
      c.error('products', `At most ${LIMITS.nativeProducts} products fit in one message.`);
    if (refs.length > 1 && !ctx.content.header?.trim()) c.error('header', 'A multi-product message needs a header.');
    if (refs.length > 0 && !ctx.content.text?.trim()) c.error('text', 'Write a short message to go with the products.');
    checkLength(c, 'header', ctx.content.header, LIMITS.header, 'The header');
  } else if (refs.length > LIMITS.individualProducts) {
    c.error('products', `Send at most ${LIMITS.individualProducts} products at a time.`);
  }
}

function checkCarouselCards(c: Collector, info: TemplateInfo, chosen: NonNullable<StudioContent['template']>): void {
  const cards = info.carouselCards ?? [];
  const given = chosen.cards ?? [];
  if (cards.length === 0) {
    c.error('template', 'This carousel template has no cards Message Studio can read.', 'unsupported');
    return;
  }
  if (given.length !== cards.length) {
    c.error('template', `This template has ${cards.length} cards; fill in all ${cards.length}.`);
  }
  cards.forEach((card, i) => {
    const g = given[i];
    if (card.headerFormat !== 'NONE' && !isHttpsUrl(g?.headerMediaUrl)) {
      c.error(
        `template.cards.${i}.headerMediaUrl`,
        `Card ${i + 1} needs an https:// ${card.headerFormat === 'VIDEO' ? 'video' : 'image'} link.`,
      );
    }
    for (let v = 0; v < card.bodyVariableCount; v++) {
      if (!g?.variables?.[v]?.trim())
        c.error(`template.cards.${i}.variables.${v}`, `Card ${i + 1}: fill in variable {{${v + 1}}}.`);
    }
  });
}

function checkTemplate(c: Collector, ctx: Ctx): void {
  if (!ctx.caps.cloudApi) {
    c.error(
      'template',
      'Approved templates can only be sent from a WhatsApp Cloud API number. Use a Text Message instead.',
      'unsupported',
    );
    return;
  }
  const chosen = ctx.content.template;
  if (!chosen?.name) {
    c.error('template', 'Select an approved template.');
    return;
  }
  if (ctx.templates === null) {
    c.error(
      'template',
      'Could not load your templates from Meta. Check the WhatsApp Business account id and try again.',
      'template_required',
    );
    return;
  }
  const info = ctx.templates.find(t => t.name === chosen.name && t.language === chosen.language);
  if (!info) {
    c.error('template', 'This template and language were not found in your WhatsApp account.', 'template_required');
    return;
  }
  if (info.status !== 'APPROVED') {
    c.error(
      'template',
      `This template is ${info.status.toLowerCase()} — only approved templates can be sent.`,
      'template_required',
    );
    return;
  }
  if (info.isCarousel) {
    checkCarouselCards(c, info, chosen);
    return;
  }
  const vars = chosen.variables ?? [];
  for (let i = 0; i < info.bodyVariableCount; i++) {
    if (!vars[i]?.trim()) c.error(`template.variables.${i}`, `Fill in variable {{${i + 1}}}.`);
  }
  if (vars.length > info.bodyVariableCount) c.warn('template.variables', 'Extra values are ignored.');
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(info.headerFormat) && !isHttpsUrl(chosen.headerMediaUrl)) {
    c.error(
      'template.headerMediaUrl',
      `This template needs a ${info.headerFormat.toLowerCase()} link (https://) for its header.`,
    );
  }
  if (info.headerFormat === 'LOCATION')
    c.error('template', 'Location-header templates are not supported yet.', 'unsupported');
}

/** Everything that must be true before a message can be tested or used in an automation. */
export function checkReadiness(ctx: Ctx): ReadinessResult {
  const c = new Collector();
  const { kind, content } = ctx;
  switch (kind) {
    case 'text': {
      if (!content.text?.trim()) c.error('text', 'Write your message.');
      checkLength(c, 'text', content.text, LIMITS.text, 'The message');
      if (content.url && !isHttpsUrl(content.url)) c.error('url', 'Enter a full https:// link.');
      checkButtons(c, ctx);
      break;
    }
    case 'image':
    case 'video':
    case 'document': {
      checkMedia(c, kind, content.media);
      checkLength(c, 'text', content.text, LIMITS.caption, 'The caption');
      checkButtons(c, ctx);
      if (content.buttons?.length && !content.text?.trim()) c.error('text', 'Add a caption to go with the button.');
      break;
    }
    case 'buttons': {
      if (!content.text?.trim()) c.error('text', 'Write the message shown above the buttons.');
      checkLength(c, 'text', content.text, LIMITS.interactiveBody, 'The message');
      checkLength(c, 'header', content.header, LIMITS.header, 'The header');
      checkLength(c, 'footer', content.footer, LIMITS.footer, 'The footer');
      checkButtons(c, ctx);
      break;
    }
    case 'list':
      checkLength(c, 'header', content.header, LIMITS.header, 'The header');
      checkLength(c, 'footer', content.footer, LIMITS.footer, 'The footer');
      checkList(c, ctx);
      break;
    case 'products':
      checkProducts(c, ctx);
      break;
    case 'template':
      checkTemplate(c, ctx);
      break;
    case 'location': {
      const loc = content.location;
      const lat = Number(loc?.latitude);
      const lng = Number(loc?.longitude);
      if (!loc || !Number.isFinite(lat) || lat < -90 || lat > 90)
        c.error('location.latitude', 'Enter a latitude between -90 and 90.');
      if (!loc || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        c.error('location.longitude', 'Enter a longitude between -180 and 180.');
      }
      checkLength(c, 'location.name', loc?.name, 100, 'The place name');
      checkLength(c, 'location.address', loc?.address, 200, 'The address');
      break;
    }
    case 'audio':
    case 'sticker': {
      checkMedia(c, kind, content.media);
      break;
    }
    case 'address':
    case 'location_request': {
      if (!ctx.caps.cloudApi) c.error('text', 'This message needs a WhatsApp Cloud API number.', 'unsupported');
      if (!content.text?.trim()) c.error('text', 'Write the message shown above the button.');
      checkLength(c, 'text', content.text, LIMITS.interactiveBody, 'The message');
      if (kind === 'address' && content.addressCountry && !/^[A-Z]{2}$/.test(content.addressCountry)) {
        c.error('addressCountry', 'Use a two-letter country code, like IN.');
      }
      break;
    }
    case 'flow': {
      if (!ctx.caps.cloudApi) c.error('flow.id', 'WhatsApp Flows need a WhatsApp Cloud API number.', 'unsupported');
      if (!content.text?.trim()) c.error('text', 'Write the message shown above the button.');
      checkLength(c, 'text', content.text, LIMITS.interactiveBody, 'The message');
      const f = content.flow;
      if (!f?.id || !/^\d+$/.test(f.id)) c.error('flow.id', 'Enter the Flow ID from Meta (digits only).');
      if (!f?.cta?.trim()) c.error('flow.cta', 'Enter the button text, like "Start".');
      else if (f.cta.length > 20) c.error('flow.cta', 'The button text can be at most 20 characters.');
      if (!f?.screen?.trim()) c.error('flow.screen', 'Enter the first screen ID of the Flow.');
      break;
    }
    case 'reaction': {
      const emoji = content.reaction?.emoji?.trim() ?? '';
      if (!emoji) c.error('reaction.emoji', 'Pick an emoji to react with.');
      else if ([...emoji].length > 2) c.error('reaction.emoji', 'Use a single emoji.');
      c.deliveryNote =
        'A reaction is added to a customer’s message, so it is sent from a workflow after that message arrives.';
      break;
    }
    case 'contact': {
      if (!content.contact?.name?.trim()) c.error('contact.name', 'Enter the contact name.');
      const digits = (content.contact?.phone ?? '').replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15)
        c.error('contact.phone', 'Enter the phone number with country code.');
      break;
    }
  }
  if (ctx.caps.cloudApi && kind !== 'template') {
    c.warn(
      'window',
      'On the Cloud API this reaches only people who messaged you in the last 24 hours. Use an approved template for anyone else.',
    );
  }
  return { readiness: c.readiness, issues: c.issues, deliveryNote: c.deliveryNote };
}

/** Product ids a message refers to (cards and "view product" buttons). */
export function referencedProductIds(content: StudioContent): string[] {
  const ids = new Set<string>();
  for (const p of content.products ?? []) if (p.productId) ids.add(p.productId);
  for (const b of content.buttons ?? []) if (b.productId) ids.add(b.productId);
  return [...ids];
}

/** The caption a product is sent with — always built from the catalog row, never from the client. */
export function productCaption(product: ResolvedProduct, note?: string): string {
  const lines = [`*${product.name}*`, formatPrice(product.price, product.currency)];
  if (note?.trim()) lines.push(note.trim());
  if (product.productUrl) lines.push(product.productUrl);
  return lines.join('\n');
}

/**
 * Drops what does not belong to the kind and trims strings, so a saved row holds only what the
 * composer can show again. Unknown keys from the client are never stored.
 */
function coordinate(value: unknown): number {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return Number.NaN;
  return Number(value);
}

export function normalizeContent(kind: StudioKind, raw: unknown): StudioContent {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 5000): string | undefined =>
    typeof v === 'string' && v.length ? v.slice(0, max) : undefined;
  const out: StudioContent = {};
  const text = str(src.text, 5000);
  if (text !== undefined) out.text = text;

  const buttons = (): StudioButton[] | undefined => {
    if (!Array.isArray(src.buttons)) return undefined;
    return src.buttons.slice(0, 10).map((b: Record<string, unknown>, i: number) => ({
      id: str(b?.id, 64) ?? `btn_${i + 1}`,
      label: str(b?.label, 60) ?? '',
      action: (BUTTON_ACTIONS as readonly string[]).includes(String(b?.action))
        ? (b.action as ButtonAction)
        : 'quick_reply',
      ...(str(b?.url, 2000) ? { url: str(b?.url, 2000) } : {}),
      ...(str(b?.phone, 30) ? { phone: str(b?.phone, 30) } : {}),
      ...(str(b?.productId, 36) ? { productId: str(b?.productId, 36) } : {}),
    }));
  };

  if (kind === 'text') {
    if (str(src.url, 2000)) out.url = str(src.url, 2000);
  }
  if (['buttons', 'list', 'products'].includes(kind)) {
    if (str(src.header, 200)) out.header = str(src.header, 200);
    if (str(src.footer, 200) && kind !== 'products') out.footer = str(src.footer, 200);
  }
  if (['text', 'image', 'video', 'document', 'buttons'].includes(kind)) {
    const b = buttons();
    if (b?.length) out.buttons = b;
  }
  if (['image', 'video', 'document', 'audio', 'sticker'].includes(kind) && src.media && typeof src.media === 'object') {
    const m = src.media as Record<string, unknown>;
    out.media = {
      source: m.source === 'upload' ? 'upload' : 'url',
      ...(m.source === 'upload'
        ? { base64: typeof m.base64 === 'string' ? m.base64.replace(/^data:[^,]*,/, '') : undefined }
        : { url: str(m.url, 2000) }),
      ...(str(m.mimetype, 120) ? { mimetype: str(m.mimetype, 120) } : {}),
      ...(str(m.filename, 200) ? { filename: str(m.filename, 200) } : {}),
    };
  }
  if (kind === 'list' && src.list && typeof src.list === 'object') {
    const l = src.list as Record<string, unknown>;
    const sections = Array.isArray(l.sections) ? l.sections.slice(0, 12) : [];
    out.list = {
      buttonLabel: str(l.buttonLabel, 60) ?? '',
      sections: sections.map((s: Record<string, unknown>) => ({
        title: str(s?.title, 60) ?? '',
        rows: (Array.isArray(s?.rows) ? s.rows.slice(0, 12) : []).map((r: Record<string, unknown>, i: number) => ({
          id: str(r?.id, 64) ?? `opt_${i + 1}`,
          title: str(r?.title, 60) ?? '',
          ...(str(r?.description, 200) ? { description: str(r?.description, 200) } : {}),
        })),
      })),
    };
  }
  if (kind === 'products') {
    out.productLayout = (PRODUCT_LAYOUTS as readonly string[]).includes(String(src.productLayout))
      ? (src.productLayout as ProductLayout)
      : 'individual';
    out.products = (Array.isArray(src.products) ? src.products.slice(0, 40) : [])
      .map((p: Record<string, unknown>) => ({
        productId: str(p?.productId, 36) ?? '',
        ...(str(p?.note, 300) ? { note: str(p?.note, 300) } : {}),
      }))
      .filter(p => p.productId);
  }
  if (kind === 'template' && src.template && typeof src.template === 'object') {
    const t = src.template as Record<string, unknown>;
    out.template = {
      name: str(t.name, 512) ?? '',
      language: str(t.language, 20) ?? 'en_US',
      variables: (Array.isArray(t.variables) ? t.variables.slice(0, 20) : []).map(v => String(v ?? '').slice(0, 1000)),
      ...(str(t.headerMediaUrl, 2000) ? { headerMediaUrl: str(t.headerMediaUrl, 2000) } : {}),
      ...(Array.isArray(t.cards)
        ? {
            cards: t.cards.slice(0, 10).map(card => {
              const cd = (card ?? {}) as Record<string, unknown>;
              return {
                ...(str(cd.headerMediaUrl, 2000) ? { headerMediaUrl: str(cd.headerMediaUrl, 2000) } : {}),
                variables: (Array.isArray(cd.variables) ? cd.variables.slice(0, 20) : []).map(v =>
                  String(v ?? '').slice(0, 1000),
                ),
              };
            }),
          }
        : {}),
    };
  }
  if (kind === 'flow' && src.flow && typeof src.flow === 'object') {
    const f = src.flow as Record<string, unknown>;
    out.flow = { id: str(f.id, 40) ?? '', cta: str(f.cta, 40) ?? '', screen: str(f.screen, 100) ?? '' };
  }
  if (kind === 'reaction' && src.reaction && typeof src.reaction === 'object') {
    out.reaction = { emoji: str((src.reaction as Record<string, unknown>).emoji, 16) ?? '' };
  }
  if (kind === 'address' && typeof src.addressCountry === 'string') {
    out.addressCountry = src.addressCountry.trim().toUpperCase().slice(0, 2);
  }
  if (kind === 'location' && src.location && typeof src.location === 'object') {
    const l = src.location as Record<string, unknown>;
    out.location = {
      // A blank coordinate arrives as null or ""; Number() would turn it into a valid 0.
      latitude: coordinate(l.latitude),
      longitude: coordinate(l.longitude),
      ...(str(l.name, 200) ? { name: str(l.name, 200) } : {}),
      ...(str(l.address, 400) ? { address: str(l.address, 400) } : {}),
    };
  }
  if (kind === 'contact' && src.contact && typeof src.contact === 'object') {
    const c = src.contact as Record<string, unknown>;
    out.contact = { name: str(c.name, 100) ?? '', phone: str(c.phone, 30) ?? '' };
  }
  return out;
}
