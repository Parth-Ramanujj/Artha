import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type {
  ProductLayout,
  ReadinessIssue,
  StudioCapabilities,
  StudioContent,
  ValidationResult,
} from '../../types/messageStudio';
import { LIMITS, formatPrice, issuesFor, moveItem, safeHttpsUrl } from '../../utils/messageStudio';
import { FieldIssues, TextField } from './fields';
import { ProductPickerModal } from './ProductPickerModal';

interface ProductSelectorProps {
  content: StudioContent;
  onChange: (patch: Partial<StudioContent>) => void;
  issues: ReadinessIssue[];
  resolved: ValidationResult['products'];
  capabilities?: StudioCapabilities;
}

const LAYOUTS: Array<{ id: ProductLayout; title: string; body: string }> = [
  {
    id: 'individual',
    title: 'Multiple product messages',
    body: 'One photo message per product, with its price and link. Works on every number.',
  },
  {
    id: 'native',
    title: 'WhatsApp catalog message',
    body: 'Native product cards from your Meta catalog. Cloud API number with a catalog only.',
  },
];

/** Centre panel for product messages: how they are shown and which products, in order. */
export function ProductSelector({ content, onChange, issues, resolved, capabilities }: ProductSelectorProps) {
  const [picking, setPicking] = useState(false);
  const layout = content.productLayout ?? 'individual';
  const refs = content.products ?? [];
  const max = layout === 'native' ? LIMITS.nativeProducts : LIMITS.individualProducts;
  const byId = new Map(resolved.map(p => [p.id, p]));

  return (
    <section className="ms-builder" aria-labelledby="ms-products-heading">
      <fieldset className="ms-layouts">
        <legend className="ms-section-title">How to show the products</legend>
        {LAYOUTS.map(l => {
          const limited = l.id === 'native' && (!capabilities?.cloudApi || !capabilities.catalogConfigured);
          return (
            <label key={l.id} className={`ms-layout ${layout === l.id ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ms-layout"
                checked={layout === l.id}
                onChange={() => onChange({ productLayout: l.id })}
              />
              <span>
                <strong>{l.title}</strong>
                <span className="ms-muted">{l.body}</span>
                {limited && l.id === 'native' && <span className="ms-kind-why">Not available on this number yet.</span>}
              </span>
            </label>
          );
        })}
      </fieldset>
      <FieldIssues issues={issuesFor(issues, 'productLayout')} />

      <div className="ms-builder-head">
        <h3 id="ms-products-heading" className="ms-section-title">
          Products
        </h3>
        <span className="ms-counter">
          {refs.length} / {max}
        </span>
      </div>
      <FieldIssues issues={issuesFor(issues, 'products').filter(i => i.field === 'products')} />

      {refs.length === 0 ? (
        <p className="ms-muted">No products selected yet.</p>
      ) : (
        <ol className="ms-item-list">
          {refs.map((ref, i) => {
            const p = byId.get(ref.productId);
            const img = safeHttpsUrl(p?.imageUrl);
            return (
              <li key={ref.productId} className="ms-item">
                <div className="ms-item-head">
                  {img ? (
                    <img src={img} alt="" className="ms-thumb" loading="lazy" />
                  ) : (
                    <div className="ms-thumb ms-thumb-empty" aria-hidden="true" />
                  )}
                  <div className="ms-grow">
                    <strong>{p?.name ?? 'Product no longer exists'}</strong>
                    {p && (
                      <span className="ms-muted">
                        {' '}
                        · {formatPrice(p.price, p.currency)}
                        {!p.inStock ? ' · Out of stock' : ''}
                      </span>
                    )}
                  </div>
                  <div className="ms-item-tools">
                    <button
                      type="button"
                      className="ms-icon-btn"
                      aria-label={`Move ${p?.name ?? 'product'} up`}
                      disabled={i === 0}
                      onClick={() => onChange({ products: moveItem(refs, i, i - 1) })}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="ms-icon-btn"
                      aria-label={`Move ${p?.name ?? 'product'} down`}
                      disabled={i === refs.length - 1}
                      onClick={() => onChange({ products: moveItem(refs, i, i + 1) })}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="ms-icon-btn ms-danger"
                      aria-label={`Remove ${p?.name ?? 'product'}`}
                      onClick={() => onChange({ products: refs.filter((_, n) => n !== i) })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {layout === 'individual' && (
                  <TextField
                    label="Extra line (optional)"
                    max={LIMITS.productNote}
                    placeholder="e.g. Free delivery today"
                    value={ref.note ?? ''}
                    onChange={note => onChange({ products: refs.map((r, n) => (n === i ? { ...r, note } : r)) })}
                  />
                )}
                <FieldIssues issues={issuesFor(issues, `products.${i}`)} />
              </li>
            );
          })}
        </ol>
      )}

      {refs.length < max && (
        <button type="button" className="btn btn-secondary ms-add" onClick={() => setPicking(true)}>
          <Plus size={14} /> {refs.length ? 'Add more products' : 'Select products'}
        </button>
      )}
      <p className="ms-hint">
        Prices and links always come from Product Catalog, so a message can never show a wrong price.
      </p>

      {picking && (
        <ProductPickerModal
          selected={refs.map(r => r.productId)}
          max={max}
          onClose={() => setPicking(false)}
          onDone={ids => {
            const kept = refs.filter(r => ids.includes(r.productId));
            const added = ids.filter(id => !refs.some(r => r.productId === id)).map(productId => ({ productId }));
            onChange({ products: [...kept, ...added] });
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
