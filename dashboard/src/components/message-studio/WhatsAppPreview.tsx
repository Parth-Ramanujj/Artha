import { useState, type ReactNode } from 'react';
import { ExternalLink, FileText, List, MapPin, Phone, Play, Reply, ShoppingBag, UserRound } from 'lucide-react';
import type {
  StudioCapabilities,
  StudioContent,
  StudioKind,
  StudioTemplate,
  ValidationResult,
} from '../../types/messageStudio';
import { BUTTON_ACTIONS, formatPrice, safeHttpsUrl } from '../../utils/messageStudio';
import { formatWhatsApp } from './whatsappFormat';

interface WhatsAppPreviewProps {
  kind: StudioKind;
  content: StudioContent;
  capabilities?: StudioCapabilities;
  products: ValidationResult['products'];
  template?: StudioTemplate;
}

const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function Bubble({ children, footer, buttons }: { children: ReactNode; footer?: string; buttons?: ReactNode }) {
  return (
    <div className="wa-msg">
      <div className="wa-bubble">
        {children}
        {footer && <div className="wa-footer">{footer}</div>}
        <span className="wa-time" aria-hidden="true">
          10:24
        </span>
      </div>
      {buttons && <div className="wa-buttons">{buttons}</div>}
    </div>
  );
}

function Text({ value }: { value?: string }) {
  if (!value?.trim()) return <span className="wa-placeholder">Your message appears here…</span>;
  return <div className="wa-text">{formatWhatsApp(value)}</div>;
}

function MediaBox({ kind, content }: { kind: 'image' | 'video' | 'document'; content: StudioContent }) {
  const m = content.media;
  const link = m?.source === 'url' ? safeHttpsUrl(m.url) : null;
  const uploadedImage =
    m?.source === 'upload' && m.base64 && /^image\/(png|jpeg|webp)$/.test(m.mimetype ?? '')
      ? `data:${m.mimetype};base64,${m.base64}`
      : null;
  if (kind === 'document') {
    const name = m?.filename || (link ? decodeURIComponent(link.split('/').pop() || 'document') : 'document.pdf');
    return (
      <div className="wa-doc">
        <FileText size={22} aria-hidden="true" /> <span>{name}</span>
      </div>
    );
  }
  const src = kind === 'image' ? (uploadedImage ?? link) : null;
  if (src) return <img className="wa-media" src={src} alt="Attached image" />;
  return (
    <div className="wa-media wa-media-empty" aria-label={kind === 'video' ? 'Video' : 'Image'}>
      {kind === 'video' ? <Play size={28} aria-hidden="true" /> : <span>Image</span>}
    </div>
  );
}

/** Right panel: how the customer will see it, including the plain-text fallback on non-Cloud numbers. */
export function WhatsAppPreview({ kind, content, capabilities, products, template }: WhatsAppPreviewProps) {
  const [listOpen, setListOpen] = useState(false);
  const cloud = Boolean(capabilities?.cloudApi);
  const byId = new Map(products.map(p => [p.id, p]));
  const buttons = content.buttons ?? [];

  const linkButton = (() => {
    const b = buttons[0];
    if (!b || BUTTON_ACTIONS[b.action].reply) return null;
    const url =
      b.action === 'open_url'
        ? b.url
        : b.action === 'view_product'
          ? (byId.get(b.productId ?? '')?.productUrl ?? undefined)
          : undefined;
    return { label: b.label || 'Button', url };
  })();

  const body = (() => {
    switch (kind) {
      case 'text':
      case 'image':
      case 'video':
      case 'document': {
        const text = [content.text, kind === 'text' ? content.url : ''].filter(Boolean).join('\n\n');
        const tail = !cloud && linkButton?.url ? `\n\n${linkButton.label}: ${linkButton.url}` : '';
        return (
          <Bubble
            buttons={
              cloud && linkButton ? (
                <div className="wa-btn">
                  <ExternalLink size={14} aria-hidden="true" /> {linkButton.label}
                </div>
              ) : undefined
            }
          >
            {kind !== 'text' && <MediaBox kind={kind} content={content} />}
            {kind === 'text' || text || tail ? <Text value={text + tail} /> : null}
          </Bubble>
        );
      }
      case 'buttons':
        if (!cloud) {
          const menu = buttons.map((b, i) => `${NUMBER_EMOJI[i]}  *${b.label}*`).join('\n');
          return (
            <Bubble footer={content.footer}>
              {content.header && <div className="wa-header">{content.header}</div>}
              <Text value={[content.text, menu, '_Reply with a number_'].filter(Boolean).join('\n\n')} />
            </Bubble>
          );
        }
        return (
          <Bubble
            footer={content.footer}
            buttons={buttons.map((b, i) => (
              <div key={i} className="wa-btn">
                <Reply size={14} aria-hidden="true" /> {b.label || 'Button'}
              </div>
            ))}
          >
            {content.header && <div className="wa-header">{content.header}</div>}
            <Text value={content.text} />
          </Bubble>
        );
      case 'list': {
        const rows = content.list?.sections.flatMap(s => s.rows) ?? [];
        if (!cloud) {
          const menu = rows
            .map(
              (r, i) =>
                `${NUMBER_EMOJI[i] ?? `${i + 1}.`}  *${r.title}*${r.description ? `\n      ${r.description}` : ''}`,
            )
            .join('\n');
          return (
            <Bubble footer={content.footer}>
              {content.header && <div className="wa-header">{content.header}</div>}
              <Text value={[content.text, menu, '_Reply with a number_'].filter(Boolean).join('\n\n')} />
            </Bubble>
          );
        }
        return (
          <>
            <Bubble
              footer={content.footer}
              buttons={
                <button type="button" className="wa-btn" onClick={() => setListOpen(o => !o)} aria-expanded={listOpen}>
                  <List size={14} aria-hidden="true" /> {content.list?.buttonLabel || 'View options'}
                </button>
              }
            >
              {content.header && <div className="wa-header">{content.header}</div>}
              <Text value={content.text} />
            </Bubble>
            {listOpen && (
              <div className="wa-sheet" role="region" aria-label="List options">
                {content.list?.sections.map((s, si) => (
                  <div key={si}>
                    {s.title && <div className="wa-sheet-title">{s.title}</div>}
                    {s.rows.map((r, ri) => (
                      <div key={ri} className="wa-sheet-row">
                        <span>
                          <strong>{r.title}</strong>
                          {r.description && <small>{r.description}</small>}
                        </span>
                        <span className="wa-radio" aria-hidden="true" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }
      case 'products': {
        const refs = content.products ?? [];
        const layout = content.productLayout ?? 'individual';
        if (layout === 'native' && cloud) {
          return (
            <Bubble
              footer={content.footer}
              buttons={
                <div className="wa-btn">
                  <ShoppingBag size={14} aria-hidden="true" /> {refs.length > 1 ? 'View items' : 'View'}
                </div>
              }
            >
              {content.header && <div className="wa-header">{content.header}</div>}
              <div className="wa-product-grid">
                {refs.slice(0, 4).map(r => {
                  const p = byId.get(r.productId);
                  const img = safeHttpsUrl(p?.imageUrl);
                  return img ? (
                    <img key={r.productId} src={img} alt="" />
                  ) : (
                    <div key={r.productId} className="wa-media-empty" />
                  );
                })}
              </div>
              <Text value={content.text} />
            </Bubble>
          );
        }
        return (
          <>
            {content.text?.trim() && (
              <Bubble>
                <Text value={content.text} />
              </Bubble>
            )}
            {refs.length === 0 && (
              <Bubble>
                <span className="wa-placeholder">Selected products appear here…</span>
              </Bubble>
            )}
            {refs.map(r => {
              const p = byId.get(r.productId);
              if (!p) return null;
              const img = safeHttpsUrl(p.imageUrl);
              const caption = [`*${p.name}*`, formatPrice(p.price, p.currency), r.note, p.productUrl]
                .filter(Boolean)
                .join('\n');
              return (
                <Bubble key={r.productId}>
                  {img && <img className="wa-media" src={img} alt={p.name} />}
                  <Text value={caption} />
                </Bubble>
              );
            })}
          </>
        );
      }
      case 'template': {
        if (!template) {
          return (
            <Bubble>
              <span className="wa-placeholder">Choose an approved template…</span>
            </Bubble>
          );
        }
        const vars = content.template?.variables ?? [];
        if (template.isCarousel) {
          const cards = template.carouselCards ?? [];
          return (
            <>
              <Bubble>
                <Text
                  value={template.bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] || `{{${n}}}`)}
                />
              </Bubble>
              <div className="wa-carousel" role="list" aria-label="Carousel cards">
                {cards.map((card, i) => {
                  const cardData = content.template?.cards?.[i];
                  const img = safeHttpsUrl(cardData?.headerMediaUrl);
                  return (
                    <div key={i} role="listitem" className="wa-card">
                      {img ? (
                        <img className="wa-media" src={img} alt={`Card ${i + 1}`} />
                      ) : (
                        <div className="wa-media wa-media-empty">Card {i + 1}</div>
                      )}
                      <div className="wa-text">
                        {(cardData?.variables ?? []).slice(0, card.bodyVariableCount).map((v, n) => (
                          <div key={n}>{v || `{{${n + 1}}}`}</div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        }
        const text = template.bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] || `{{${n}}}`);
        return (
          <Bubble
            footer={template.footerText}
            buttons={template.buttons.map((b, i) => (
              <div key={i} className="wa-btn">
                {b.type === 'PHONE_NUMBER' ? (
                  <Phone size={14} aria-hidden="true" />
                ) : b.type === 'URL' ? (
                  <ExternalLink size={14} aria-hidden="true" />
                ) : (
                  <Reply size={14} aria-hidden="true" />
                )}{' '}
                {b.text}
              </div>
            ))}
          >
            {template.headerFormat === 'TEXT' && template.headerText && (
              <div className="wa-header">{template.headerText}</div>
            )}
            {template.headerFormat === 'IMAGE' &&
              (safeHttpsUrl(content.template?.headerMediaUrl) ? (
                <img className="wa-media" src={safeHttpsUrl(content.template?.headerMediaUrl)!} alt="Template header" />
              ) : (
                <div className="wa-media wa-media-empty">Image</div>
              ))}
            <Text value={text} />
          </Bubble>
        );
      }
      case 'location': {
        const loc = content.location;
        return (
          <Bubble>
            <div className="wa-map" aria-hidden="true">
              <MapPin size={28} />
            </div>
            <div className="wa-text">
              <strong>{loc?.name || 'Location'}</strong>
              {loc?.address && <div className="wa-muted">{loc.address}</div>}
            </div>
          </Bubble>
        );
      }
      case 'audio':
        return (
          <Bubble>
            <div className="wa-audio" aria-label="Audio message">
              <Play size={16} aria-hidden="true" />
              <span className="wa-audio-bar" aria-hidden="true" />
              <span className="wa-muted">0:12</span>
            </div>
          </Bubble>
        );
      case 'sticker':
        return (
          <div className="wa-sticker">
            {safeHttpsUrl(content.media?.url) ? (
              <img src={safeHttpsUrl(content.media?.url)!} alt="Sticker" />
            ) : (
              <div className="wa-media-empty">Sticker</div>
            )}
          </div>
        );
      case 'address':
        return (
          <Bubble buttons={cloud ? <div className="wa-btn">Enter address</div> : undefined}>
            <Text value={content.text} />
          </Bubble>
        );
      case 'location_request':
        return (
          <Bubble buttons={cloud ? <div className="wa-btn">Send location</div> : undefined}>
            <Text value={content.text} />
          </Bubble>
        );
      case 'flow':
        return (
          <Bubble buttons={cloud ? <div className="wa-btn">{content.flow?.cta || 'Start'}</div> : undefined}>
            <Text value={content.text} />
          </Bubble>
        );
      case 'reaction':
        return (
          <Bubble>
            <span className="wa-placeholder">Customer’s message</span>
            <div className="wa-reaction" aria-label="Reaction">
              {content.reaction?.emoji || '👍'}
            </div>
          </Bubble>
        );
      case 'contact':
        return (
          <Bubble buttons={<div className="wa-btn">Message</div>}>
            <div className="wa-contact">
              <UserRound size={28} aria-hidden="true" />
              <span>
                <strong>{content.contact?.name || 'Contact name'}</strong>
                <span className="wa-muted">{content.contact?.phone || '+91 …'}</span>
              </span>
            </div>
          </Bubble>
        );
    }
  })();

  return (
    <div className="wa-phone" aria-label="WhatsApp preview">
      <div className="wa-topbar">
        <span className="wa-avatar" aria-hidden="true">
          B
        </span>
        <span>
          <strong>Your business</strong>
          <small>{cloud ? 'WhatsApp Cloud API' : capabilities ? 'WhatsApp' : 'Preview'}</small>
        </span>
      </div>
      <div className="wa-chat">{body}</div>
    </div>
  );
}
