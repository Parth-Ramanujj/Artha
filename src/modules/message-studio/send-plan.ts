import {
  INTERNAL_REPLY_IDS,
  ResolvedProduct,
  SendCapabilities,
  StudioContent,
  StudioKind,
  TemplateInfo,
  productCaption,
  replyChoices,
} from './studio-content';

/** One WhatsApp message to send. A studio message becomes one or more of these. */
export type SendPart =
  | { type: 'text'; text: string }
  | {
      type: 'media';
      mediaKind: 'image' | 'video' | 'document' | 'audio' | 'sticker';
      url?: string;
      base64?: string;
      mimetype?: string;
      filename?: string;
      caption?: string;
    }
  | { type: 'interactive'; interactive: Record<string, unknown> }
  | { type: 'template'; name: string; language: string; components: Array<Record<string, unknown>> }
  | { type: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { type: 'contact'; name: string; phone: string }
  | { type: 'reaction'; messageId: string; emoji: string };

export interface SendPlan {
  parts: SendPart[];
  /** Reply ids the customer can answer with — a workflow pauses and branches on them. */
  choices: Array<{ id: string; text: string }>;
}

export interface PlanInput {
  kind: StudioKind;
  content: StudioContent;
  products: Map<string, ResolvedProduct>;
  templates: TemplateInfo[] | null;
  caps: SendCapabilities;
  catalogId: string | null;
  /** Fills {{variables}} in the text the business wrote (workflows pass their interpolator). */
  fill?: (text: string) => string;
  /** The customer message a reaction is put on (the workflow's trigger message). */
  targetMessageId?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  pdf: 'application/pdf',
};

function guessMime(url: string | undefined, kind: 'image' | 'video' | 'document'): string {
  const ext = (url ?? '').split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'application/pdf');
}

/** "1️⃣ *Yes*" lines and a reply hint — what a number without buttons sends instead. */
export function numberedMenu(body: string, options: Array<{ text: string }>): string {
  const lines = [body, ''];
  options.forEach((o, i) => lines.push(`${i + 1}️⃣  *${o.text}*`));
  lines.push('', `👉 *Reply with number (${options.map((_, i) => i + 1).join(', ')}) or option name*`);
  return lines.join('\n');
}

function withHeaderFooter(body: string, header?: string, footer?: string): string {
  return [header ? `*${header}*` : '', body, footer ? `_${footer}_` : ''].filter(Boolean).join('\n\n');
}

/**
 * Turns a ready studio message into the WhatsApp messages to send on this number. Call only after
 * checkReadiness() said 'ready' — this does not re-validate.
 */
export function buildSendPlan(input: PlanInput): SendPlan {
  const { kind, content, products, caps } = input;
  const fill = input.fill ?? ((t: string) => t);
  const text = fill(content.text ?? '');
  const choices = replyChoices(kind, content);
  const parts: SendPart[] = [];

  const linkButton = content.buttons?.find(b => b.action === 'open_url' || b.action === 'view_product');
  const linkUrl =
    linkButton?.action === 'view_product'
      ? (products.get(linkButton.productId ?? '')?.productUrl ?? undefined)
      : linkButton?.url;
  const catalogButton = content.buttons?.find(b => b.action === 'view_catalog');

  const mediaHeader = (): Record<string, unknown> | undefined => {
    if (!content.media || !['image', 'video', 'document'].includes(kind)) return undefined;
    const key = kind as 'image' | 'video' | 'document';
    // Interactive headers take a link; an uploaded file can't be one, so it goes as a normal media message.
    if (content.media.source !== 'url' || !content.media.url) return undefined;
    return {
      type: key,
      [key]: {
        link: content.media.url,
        ...(key === 'document' && content.media.filename ? { filename: content.media.filename } : {}),
      },
    };
  };

  const mediaPart = (caption: string): SendPart => {
    const key = kind as 'image' | 'video' | 'document';
    const m = content.media!;
    return {
      type: 'media',
      mediaKind: key,
      ...(m.source === 'url' ? { url: m.url } : { base64: m.base64 }),
      mimetype: m.mimetype ?? guessMime(m.url, key),
      ...(m.filename ? { filename: m.filename } : {}),
      ...(caption ? { caption } : {}),
    };
  };

  switch (kind) {
    case 'text':
    case 'image':
    case 'video':
    case 'document': {
      const isMedia = kind !== 'text';
      const body = kind === 'text' && content.url ? `${text}\n\n${content.url}` : text;
      if (caps.cloudApi && linkButton && linkUrl) {
        const header = isMedia ? mediaHeader() : undefined;
        if (isMedia && !header) parts.push(mediaPart(''));
        parts.push({
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            ...(header ? { header } : {}),
            body: { text: body },
            action: { name: 'cta_url', parameters: { display_text: linkButton.label, url: linkUrl } },
          },
        });
      } else if (caps.cloudApi && catalogButton) {
        if (isMedia) parts.push(mediaPart(''));
        parts.push({
          type: 'interactive',
          interactive: { type: 'catalog_message', body: { text: body }, action: { name: 'catalog_message' } },
        });
      } else {
        const withLink = linkButton && linkUrl ? `${body}\n\n${linkButton.label}: ${linkUrl}` : body;
        parts.push(isMedia ? mediaPart(withLink) : { type: 'text', text: withLink });
      }
      break;
    }

    case 'buttons': {
      const header = content.header ? fill(content.header) : undefined;
      const footer = content.footer ? fill(content.footer) : undefined;
      if (caps.cloudApi) {
        parts.push({
          type: 'interactive',
          interactive: {
            type: 'button',
            ...(header ? { header: { type: 'text', text: header } } : {}),
            body: { text },
            ...(footer ? { footer: { text: footer } } : {}),
            action: {
              buttons: (content.buttons ?? []).map(b => ({
                type: 'reply',
                reply: { id: INTERNAL_REPLY_IDS[b.action] ?? b.id, title: b.label },
              })),
            },
          },
        });
      } else {
        parts.push({ type: 'text', text: numberedMenu(withHeaderFooter(text, header, footer), choices) });
      }
      break;
    }

    case 'list': {
      const header = content.header ? fill(content.header) : undefined;
      const footer = content.footer ? fill(content.footer) : undefined;
      const list = content.list!;
      if (caps.cloudApi) {
        parts.push({
          type: 'interactive',
          interactive: {
            type: 'list',
            ...(header ? { header: { type: 'text', text: header } } : {}),
            body: { text },
            ...(footer ? { footer: { text: footer } } : {}),
            action: {
              button: list.buttonLabel,
              sections: list.sections.map(s => ({
                ...(s.title ? { title: s.title } : {}),
                rows: s.rows.map(r => ({
                  id: r.id,
                  title: r.title,
                  ...(r.description ? { description: r.description } : {}),
                })),
              })),
            },
          },
        });
      } else {
        parts.push({ type: 'text', text: numberedMenu(withHeaderFooter(text, header, footer), choices) });
      }
      break;
    }

    case 'products': {
      const refs = content.products ?? [];
      const rows = refs.map(r => ({ ref: r, product: products.get(r.productId)! }));
      if (content.productLayout === 'native') {
        if (rows.length === 1) {
          parts.push({
            type: 'interactive',
            interactive: {
              type: 'product',
              ...(text ? { body: { text } } : {}),
              action: { catalog_id: input.catalogId, product_retailer_id: rows[0].product.retailerId },
            },
          });
        } else {
          parts.push({
            type: 'interactive',
            interactive: {
              type: 'product_list',
              header: { type: 'text', text: fill(content.header ?? '') },
              body: { text },
              action: {
                catalog_id: input.catalogId,
                sections: [
                  {
                    title: (content.header ?? 'Products').slice(0, 24),
                    product_items: rows.map(r => ({ product_retailer_id: r.product.retailerId })),
                  },
                ],
              },
            },
          });
        }
      } else {
        if (text.trim()) parts.push({ type: 'text', text });
        for (const { ref, product } of rows) {
          const caption = productCaption(product, ref.note);
          parts.push(
            product.imageUrl
              ? {
                  type: 'media',
                  mediaKind: 'image',
                  url: product.imageUrl,
                  mimetype: guessMime(product.imageUrl, 'image'),
                  caption,
                }
              : { type: 'text', text: caption },
          );
        }
      }
      break;
    }

    case 'template': {
      const t = content.template!;
      const info = input.templates?.find(x => x.name === t.name && x.language === t.language);
      const components: Array<Record<string, unknown>> = [];
      if (info && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(info.headerFormat) && t.headerMediaUrl) {
        const key = info.headerFormat.toLowerCase();
        components.push({ type: 'header', parameters: [{ type: key, [key]: { link: t.headerMediaUrl } }] });
      }
      const count = info?.bodyVariableCount ?? t.variables.length;
      if (count > 0) {
        components.push({
          type: 'body',
          parameters: t.variables.slice(0, count).map(v => ({ type: 'text', text: fill(v) })),
        });
      }
      if (info?.isCarousel && info.carouselCards) {
        // Meta: one carousel component whose cards each carry their own header and body values.
        const cards = info.carouselCards.map((card, i) => {
          const given = t.cards?.[i];
          const cardParts: Array<Record<string, unknown>> = [];
          if (card.headerFormat !== 'NONE' && given?.headerMediaUrl) {
            const key = card.headerFormat.toLowerCase();
            cardParts.push({ type: 'header', parameters: [{ type: key, [key]: { link: given.headerMediaUrl } }] });
          }
          if (card.bodyVariableCount > 0) {
            cardParts.push({
              type: 'body',
              parameters: (given?.variables ?? []).slice(0, card.bodyVariableCount).map(v => ({ type: 'text', text: fill(v) })),
            });
          }
          return { card_index: i, components: cardParts };
        });
        components.push({ type: 'carousel', cards });
      }
      parts.push({ type: 'template', name: t.name, language: t.language, components });
      break;
    }

    case 'location': {
      const l = content.location!;
      parts.push({
        type: 'location',
        latitude: Number(l.latitude),
        longitude: Number(l.longitude),
        name: l.name,
        address: l.address,
      });
      break;
    }

    case 'audio':
    case 'sticker': {
      const m = content.media!;
      parts.push({
        type: 'media',
        mediaKind: kind,
        ...(m.source === 'url' ? { url: m.url } : { base64: m.base64 }),
        mimetype: kind === 'sticker' ? 'image/webp' : (m.mimetype ?? 'audio/ogg'),
        ...(m.filename ? { filename: m.filename } : {}),
      });
      break;
    }
    case 'address':
    case 'location_request': {
      parts.push({
        type: 'interactive',
        interactive:
          kind === 'address'
            ? {
                type: 'address_message',
                body: { text },
                action: { name: 'address_message', parameters: { country: content.addressCountry || 'IN' } },
              }
            : { type: 'location_request_message', body: { text }, action: { name: 'send_location' } },
      });
      break;
    }
    case 'flow': {
      const f = content.flow!;
      parts.push({
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: 'studio',
              flow_id: f.id,
              flow_cta: f.cta,
              flow_action: 'navigate',
              flow_action_payload: { screen: f.screen },
            },
          },
        },
      });
      break;
    }
    case 'reaction': {
      if (!input.targetMessageId) throw new Error('A reaction needs a customer message to react to');
      parts.push({ type: 'reaction', messageId: input.targetMessageId, emoji: content.reaction!.emoji });
      break;
    }
    case 'contact':
      parts.push({
        type: 'contact',
        name: content.contact!.name,
        phone: content.contact!.phone.replace(/[^\d+]/g, ''),
      });
      break;
  }

  return { parts, choices };
}
