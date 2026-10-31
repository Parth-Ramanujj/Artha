import { useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { libraryApi } from '../../services/api';
import type { LibraryItem } from '../../types/library';
import { MediaThumb } from './MediaThumb';

interface Props {
  items: LibraryItem[];
  onNew: () => void;
  onEdit: (item: LibraryItem) => void;
  onPostNow: (item: LibraryItem) => void;
  onSchedule: (item: LibraryItem) => void;
  onChange: () => void;
}

/** The post grid with search and filters. */
export function PostsTab({ items, onNew, onEdit, onPostNow, onSchedule, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<'recent' | 'used'>('recent');
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))].sort(), [items]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter(
      i =>
        (!category || i.category === category) &&
        (!type || i.type === type) &&
        (!q || [i.title, i.text, i.category, ...i.tags].some(f => f.toLowerCase().includes(q))),
    );
    return sort === 'used' ? [...list].sort((x, y) => y.useCount - x.useCount) : list;
  }, [items, search, category, type, sort]);

  const remove = async (item: LibraryItem) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setError(null);
    try {
      await libraryApi.deleteItem(item.id);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  return (
    <section className="sa-panel">
      <div className="sa-toolbar">
        <input
          className="input lib-search"
          type="search"
          placeholder="Search posts, tags…"
          aria-label="Search posts"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input lib-filter"
          aria-label="Category"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="input lib-filter" aria-label="Type" value={type} onChange={e => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <select
          className="input lib-filter"
          aria-label="Sort"
          value={sort}
          onChange={e => setSort(e.target.value as 'recent' | 'used')}
        >
          <option value="recent">Latest</option>
          <option value="used">Most used</option>
        </select>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={14} /> New post
        </button>
      </div>
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}

      {!items.length ? (
        <p className="sa-help">
          Your library is empty. Add a post (text, photo or video) once, then post it any time or put it on a schedule.
        </p>
      ) : !shown.length ? (
        <p className="sa-help">No posts match.</p>
      ) : (
        <ul className="lib-grid">
          {shown.map(item => (
            <li key={item.id} className="sa-card lib-card">
              <MediaThumb item={item} />
              <div className="lib-card-body">
                <strong className="sa-ellipsis" title={item.title}>
                  {item.title}
                </strong>
                <div>
                  <span className="sa-chip">{item.type}</span>
                  {item.category && <span className="sa-chip">{item.category}</span>}
                  {item.tags.slice(0, 3).map(t => (
                    <span key={t} className="sa-chip">
                      #{t}
                    </span>
                  ))}
                </div>
                {item.type !== 'text' && item.text && <p className="lib-caption">{item.text}</p>}
                <span className="sa-muted">
                  Used {item.useCount}×
                  {item.lastUsedAt ? `, last ${new Date(item.lastUsedAt).toLocaleDateString()}` : ''}
                </span>
              </div>
              <div className="sa-row-actions">
                <button className="btn btn-primary btn-sm" onClick={() => onPostNow(item)}>
                  <Send size={14} /> Post now
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => onSchedule(item)}>
                  <CalendarClock size={14} /> Schedule
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  aria-label={`Edit ${item.title}`}
                  onClick={() => onEdit(item)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  aria-label={`Delete ${item.title}`}
                  onClick={() => void remove(item)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
