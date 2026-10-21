import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { Modal } from '../Modal';
import { messageStudioApi } from '../../services/api';
import { formatPrice, safeHttpsUrl } from '../../utils/messageStudio';
import { ProductForm } from './ProductForm';

interface ProductPickerModalProps {
  selected: string[];
  max: number;
  onClose: () => void;
  onDone: (ids: string[]) => void;
}

const PAGE = 24;

/** Search the catalog and tick products. Out-of-stock products can't be picked. */
export function ProductPickerModal({ selected, max, onClose, onDone }: ProductPickerModalProps) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  const query = useQuery({
    queryKey: ['message-studio', 'products', 'picker', search, category, page],
    queryFn: () =>
      messageStudioApi.products({
        search: search.trim() || undefined,
        category: category || undefined,
        page,
        limit: PAGE,
      }),
    placeholderData: prev => prev,
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const full = picked.length >= max;

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : full ? p : [...p, id]));

  if (adding) {
    return (
      <ProductForm
        product={null}
        onClose={() => setAdding(false)}
        onSaved={p => {
          setAdding(false);
          void query.refetch();
          if (p.inStock && !full) setPicked(prev => [...prev, p.id]);
        }}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Select products"
      className="ms-modal-wide"
      footer={
        <>
          <span className="ms-muted ms-grow">
            {picked.length} selected{full ? ` (maximum ${max})` : ''}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onDone(picked)}>
            Use {picked.length} product{picked.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div className="ms-toolbar">
        <input
          type="search"
          className="ms-input"
          placeholder="Search by name or SKU"
          aria-label="Search products"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="ms-select"
          aria-label="Category"
          value={category}
          onChange={e => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {(query.data?.categories ?? []).map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={() => setAdding(true)}>
          Add product
        </button>
      </div>

      {query.isLoading ? (
        <div className="ms-state">Loading products…</div>
      ) : items.length === 0 ? (
        <div className="ms-empty ms-empty-compact">
          <Package size={32} aria-hidden="true" />
          <p>{search || category ? 'No products match.' : 'Your catalog is empty. Add a product to continue.'}</p>
        </div>
      ) : (
        <ul className="ms-pick-grid">
          {items.map(p => {
            const img = safeHttpsUrl(p.imageUrl);
            const checked = picked.includes(p.id);
            const disabled = !p.inStock || (full && !checked);
            return (
              <li key={p.id}>
                <label className={`ms-pick ${checked ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(p.id)} />
                  {img ? (
                    <img src={img} alt="" className="ms-pick-img" loading="lazy" />
                  ) : (
                    <div className="ms-pick-img ms-thumb-empty" aria-hidden="true" />
                  )}
                  <strong>{p.name}</strong>
                  <span className="ms-muted">
                    {formatPrice(p.price, p.currency)}
                    {!p.inStock ? ' · Out of stock' : ''}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE && (
        <div className="ms-pager">
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </button>
          <span className="ms-muted">
            Page {page} of {Math.ceil(total / PAGE)}
          </span>
          <button className="btn btn-secondary" disabled={page * PAGE >= total} onClick={() => setPage(p => p + 1)}>
            Next
          </button>
        </div>
      )}
    </Modal>
  );
}
