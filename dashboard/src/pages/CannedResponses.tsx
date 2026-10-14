import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Edit2, Trash2, MessageSquare, Search } from 'lucide-react';
import { cannedResponseApi, type CannedResponse } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export function CannedResponses() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<CannedResponse | null>(null);
  const [form, setForm] = useState({ title: '', shortcut: '', content: '', category: '' });

  const load = () => {
    setLoading(true);
    cannedResponseApi
      .list({ search: search || undefined })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [search]);

  const openCreate = () => {
    setEditItem(null);
    setForm({ title: '', shortcut: '', content: '', category: '' });
    setShowModal(true);
  };

  const openEdit = (item: CannedResponse) => {
    setEditItem(item);
    setForm({ title: item.title, shortcut: item.shortcut, content: item.content, category: item.category || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editItem) {
        await cannedResponseApi.update(editItem.id, form);
        toast.success('Success', 'Canned response updated');
      } else {
        await cannedResponseApi.create(form);
        toast.success('Success', 'Canned response created');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this canned response?')) return;
    try {
      await cannedResponseApi.delete(id);
      toast.success('Success', 'Deleted');
      load();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed to delete');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('cannedResponses.title', 'Canned Responses')}
        subtitle={t('cannedResponses.subtitle', 'Quick reply templates for agents')}
        icon={<MessageSquare size={24} />}
        action={{ label: t('common.create', 'Create'), onClick: openCreate, icon: <Plus size={16} /> }}
      />

      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
          />
          <input
            type="text"
            placeholder={t('common.search', 'Search...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 8px 8px 32px',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              background: 'var(--color-bg-secondary)',
            }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
          {t('cannedResponses.empty', 'No canned responses yet')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                padding: 16,
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: 'var(--color-bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>
                    /{item.shortcut} {item.category ? `· ${item.category}` : ''}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{item.content}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => openEdit(item)}
                    style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{
                      padding: 6,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-danger)',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editItem ? 'Edit Canned Response' : 'Create Canned Response'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="Title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <input
              placeholder="Shortcut (e.g. greeting)"
              value={form.shortcut}
              onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <input
              placeholder="Category (optional)"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <textarea
              placeholder="Message content"
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={4}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6, resize: 'vertical' }}
            />
            <button
              onClick={handleSave}
              style={{
                padding: '10px 20px',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {editItem ? 'Update' : 'Create'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
