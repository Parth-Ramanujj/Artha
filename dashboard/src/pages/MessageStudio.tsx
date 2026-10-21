import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Archive,
  RotateCcw,
  Pencil,
  Copy,
  MessageSquare,
  Palette,
  ShoppingBag,
  Search,
  GitBranch,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ProductCatalogModal } from '../components/message-studio/ProductCatalogModal';
import { messageStudioApi } from '../services/api';
import type { StudioMessage } from '../types/messageStudio';
import { KIND_LABEL, READINESS_META } from '../utils/messageStudio';
import './MessageStudio.css';

type Filter = 'active' | 'draft' | 'ready' | 'archived';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'active', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'ready', label: 'Published' },
  { id: 'archived', label: 'Archived' },
];

function preview(m: StudioMessage): string {
  const c = m.content;
  if (c.text) return c.text;
  if (c.template?.name) return `Template: ${c.template.name}`;
  if (c.location) return c.location.name || 'Location';
  if (c.contact?.name) return `Contact: ${c.contact.name}`;
  return '';
}

export function MessageStudio() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [archiving, setArchiving] = useState<StudioMessage | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const messages = useQuery({
    queryKey: ['message-studio', 'list', filter, search],
    queryFn: () => messageStudioApi.list({ status: filter, search: search.trim() || undefined }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['message-studio'] });
  const onError = (e: Error) => toast.error('Something went wrong', e.message);

  const duplicate = useMutation({
    mutationFn: messageStudioApi.duplicate,
    onSuccess: m => {
      refresh();
      toast.success('Copy created', m.name);
    },
    onError,
  });
  const archive = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => messageStudioApi.archive(id, force),
    onSuccess: m => {
      refresh();
      setArchiving(null);
      toast.success('Archived', m.name);
    },
    onError,
  });
  const restore = useMutation({
    mutationFn: messageStudioApi.restore,
    onSuccess: m => {
      refresh();
      toast.success('Restored as a draft', m.name);
    },
    onError,
  });

  // Opening the dialog loads where the message is used, so archiving a live one is a conscious choice.
  const usage = useQuery({
    queryKey: ['message-studio', 'message', archiving?.id],
    queryFn: () => messageStudioApi.get(archiving!.id),
    enabled: Boolean(archiving),
  });
  const liveUses = (usage.data?.usedIn ?? []).filter(u => u.status === 'published');

  const list = messages.data ?? [];

  return (
    <div className="message-studio-page">
      <PageHeader
        title="Message Studio"
        subtitle="Build WhatsApp messages once, preview them, test them, and reuse them in your automations."
        icon={<Palette size={24} />}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCatalog(true)}>
              <ShoppingBag size={16} /> Product Catalog
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/message-studio/new')}>
              <Plus size={16} /> New Message
            </button>
          </>
        }
      />

      <div className="ms-toolbar">
        <label className="ms-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search messages by name"
            aria-label="Search messages by name"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <div className="ms-tabs" role="tablist" aria-label="Filter messages">
          {FILTERS.map(f => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`ms-tab ${filter === f.id ? 'is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {messages.isLoading ? (
        <div className="ms-state" aria-busy="true">
          Loading messages…
        </div>
      ) : messages.isError ? (
        <div className="ms-state ms-state-error" role="alert">
          Could not load messages.{' '}
          <button className="btn-link" onClick={() => messages.refetch()}>
            Try again
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="ms-empty">
          <MessageSquare size={40} aria-hidden="true" />
          <h2>
            {search
              ? 'No messages match your search'
              : filter === 'active'
                ? 'Create your first message'
                : 'Nothing here yet'}
          </h2>
          {!search && filter === 'active' && (
            <p>Pick a message type or start from a ready-made preset like “Welcome Message”.</p>
          )}
          {filter === 'active' && (
            <button className="btn btn-primary" onClick={() => navigate('/message-studio/new')}>
              <Plus size={16} /> New Message
            </button>
          )}
        </div>
      ) : (
        <ul className="ms-grid">
          {list.map(m => {
            const meta = READINESS_META[m.readiness];
            return (
              <li key={m.id} className="ms-card">
                <button className="ms-card-main" onClick={() => navigate(`/message-studio/${m.id}`)}>
                  <div className="ms-card-top">
                    <span className="ms-chip">{KIND_LABEL[m.kind]}</span>
                    <span className={`ms-status ms-status-${m.status}`}>
                      {m.status === 'ready' ? 'Published' : m.status === 'draft' ? 'Draft' : 'Archived'}
                    </span>
                  </div>
                  <h3 className="ms-card-title">{m.name}</h3>
                  <p className="ms-card-preview">{preview(m) || '—'}</p>
                  <div className="ms-card-meta">
                    {m.status !== 'archived' && <span className={`ms-dot ms-tone-${meta.tone}`}>{meta.label}</span>}
                    <span>Edited {new Date(m.updatedAt).toLocaleDateString()}</span>
                  </div>
                </button>
                <div className="ms-card-actions">
                  <button
                    className="ms-icon-btn"
                    onClick={() => navigate(`/message-studio/${m.id}`)}
                    aria-label={`Edit ${m.name}`}
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="ms-icon-btn"
                    onClick={() => duplicate.mutate(m.id)}
                    aria-label={`Duplicate ${m.name}`}
                    title="Duplicate"
                  >
                    <Copy size={15} />
                  </button>
                  {m.status === 'archived' ? (
                    <button
                      className="ms-icon-btn"
                      onClick={() => restore.mutate(m.id)}
                      aria-label={`Restore ${m.name}`}
                      title="Restore"
                    >
                      <RotateCcw size={15} />
                    </button>
                  ) : (
                    <button
                      className="ms-icon-btn"
                      onClick={() => setArchiving(m)}
                      aria-label={`Archive ${m.name}`}
                      title="Archive"
                    >
                      <Archive size={15} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title="Archive message?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setArchiving(null)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              disabled={archive.isPending || usage.isLoading}
              onClick={() => archiving && archive.mutate({ id: archiving.id, force: liveUses.length > 0 })}
            >
              {liveUses.length > 0 ? 'Archive anyway' : 'Archive'}
            </button>
          </>
        }
      >
        <p>“{archiving?.name}” will be hidden from the list. You can restore it from Archived.</p>
        {liveUses.length > 0 && (
          <div className="ms-callout ms-callout-warning" role="alert">
            <GitBranch size={16} aria-hidden="true" />
            <div>
              It is used by {liveUses.length} live automation{liveUses.length > 1 ? 's' : ''} (
              {liveUses.map(u => u.name).join(', ')}). Those steps will fail until you choose another message.
            </div>
          </div>
        )}
      </Modal>

      {showCatalog && <ProductCatalogModal onClose={() => setShowCatalog(false)} />}
    </div>
  );
}
