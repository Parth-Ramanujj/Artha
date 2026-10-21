import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Archive, RotateCcw, Package } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { messageStudioApi } from '../../services/api';
import type { StudioProduct } from '../../types/messageStudio';
import { formatPrice, safeHttpsUrl } from '../../utils/messageStudio';
import { ProductForm } from './ProductForm';

/** Manage the products that product messages are built from, and the Meta catalog id. */
export function ProductCatalogModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<StudioProduct | 'new' | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ['message-studio', 'products', 'catalog', search, showArchived],
    queryFn: () => messageStudioApi.products({ search: search.trim() || undefined, archived: showArchived, limit: 50 }),
  });
  const settings = useQuery({ queryKey: ['message-studio', 'settings'], queryFn: messageStudioApi.settings });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['message-studio'] });
  const toggleArchived = useMutation({
    mutationFn: (p: StudioProduct) => messageStudioApi.updateProduct(p.id, { archived: !p.archived }),
    onSuccess: p => {
      refresh();
      toast.success(p.archived ? 'Product archived' : 'Product restored', p.name);
    },
    onError: (e: Error) => toast.error('Could not update the product', e.message),
  });
  const saveCatalog = useMutation({
    mutationFn: (metaCatalogId: string) => messageStudioApi.updateSettings({ metaCatalogId }),
    onSuccess: () => {
      refresh();
      setCatalogDraft(null);
      toast.success('Catalog saved');
    },
    onError: (e: Error) => toast.error('Could not save the catalog id', e.message),
  });

  if (editing) {
    return (
      <ProductForm
        product={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          refresh();
          setEditing(null);
        }}
      />
    );
  }

  const items = products.data?.items ?? [];
  const catalogValue = catalogDraft ?? settings.data?.metaCatalogId ?? '';

  return (
    <Modal open onClose={onClose} title="Product Catalog" className="ms-modal-wide">
      <p className="ms-muted">
        Product messages always use the name, price and links saved here — never values typed into a message.
      </p>

      <div className="ms-toolbar">
        <input
          type="search"
          className="ms-input"
          placeholder="Search by name or SKU"
          aria-label="Search products"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="ms-check">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show
          archived
        </label>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Add product
        </button>
      </div>

      {products.isLoading ? (
        <div className="ms-state">Loading products…</div>
      ) : items.length === 0 ? (
        <div className="ms-empty ms-empty-compact">
          <Package size={32} aria-hidden="true" />
          <p>
            {search
              ? 'No products match your search.'
              : 'No products yet. Add the products you want to show customers.'}
          </p>
        </div>
      ) : (
        <ul className="ms-product-rows">
          {items.map(p => {
            const img = safeHttpsUrl(p.imageUrl);
            return (
              <li key={p.id} className="ms-product-row">
                {img ? (
                  <img src={img} alt="" className="ms-thumb" loading="lazy" />
                ) : (
                  <div className="ms-thumb ms-thumb-empty" aria-hidden="true" />
                )}
                <div className="ms-product-info">
                  <strong>{p.name}</strong>
                  <span className="ms-muted">
                    {formatPrice(p.price, p.currency)}
                    {p.sku ? ` · ${p.sku}` : ''}
                    {p.category ? ` · ${p.category}` : ''}
                    {!p.inStock ? ' · Out of stock' : ''}
                  </span>
                </div>
                <button
                  className="ms-icon-btn"
                  onClick={() => setEditing(p)}
                  aria-label={`Edit ${p.name}`}
                  title="Edit"
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="ms-icon-btn"
                  onClick={() => toggleArchived.mutate(p)}
                  aria-label={`${p.archived ? 'Restore' : 'Archive'} ${p.name}`}
                  title={p.archived ? 'Restore' : 'Archive'}
                >
                  {p.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <section className="ms-section" aria-labelledby="ms-catalog-heading">
        <h3 id="ms-catalog-heading" className="ms-section-title">
          Meta commerce catalog (optional)
        </h3>
        <p className="ms-muted">
          Needed only for native WhatsApp product messages on a Cloud API number. Give each product its catalog “Content
          ID” as its catalog id.
        </p>
        <div className="ms-row">
          <input
            className="ms-input"
            inputMode="numeric"
            placeholder="Catalog id, e.g. 1234567890"
            aria-label="Meta catalog id"
            value={catalogValue}
            onChange={e => setCatalogDraft(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            disabled={catalogDraft === null || saveCatalog.isPending}
            onClick={() => saveCatalog.mutate(catalogValue.trim())}
          >
            Save
          </button>
        </div>
      </section>
    </Modal>
  );
}
