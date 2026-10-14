import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Edit2, Trash2, Users, ChevronRight } from 'lucide-react';
import { contactSegmentApi, type ContactSegment } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export function ContactSegments() {
  const { t } = useTranslation();
  const toast = useToast();
  const [segments, setSegments] = useState<ContactSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<ContactSegment | null>(null);
  const [form, setForm] = useState({ name: '', description: '', type: 'dynamic' as const, tags: '' });

  const load = () => {
    setLoading(true);
    contactSegmentApi
      .list()
      .then(setSegments)
      .catch(() => setSegments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm({ name: '', description: '', type: 'dynamic', tags: '' });
    setShowModal(true);
  };

  const openEdit = (seg: ContactSegment) => {
    setEditItem(seg);
    const tags = (seg.filters as any)?.tags?.join(', ') || '';
    setForm({ name: seg.name, description: seg.description || '', type: seg.type, tags });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const filters = form.tags.trim()
        ? {
            tags: form.tags
              .split(',')
              .map(t => t.trim())
              .filter(Boolean),
          }
        : undefined;
      if (editItem) {
        await contactSegmentApi.update(editItem.id, {
          name: form.name,
          description: form.description || undefined,
          filters,
        });
        toast.success('Success', 'Segment updated');
      } else {
        await contactSegmentApi.create({
          name: form.name,
          description: form.description || undefined,
          type: form.type,
          filters,
        });
        toast.success('Success', 'Segment created');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this segment?')) return;
    try {
      await contactSegmentApi.delete(id);
      toast.success('Success', 'Deleted');
      load();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('segments.title', 'Contact Segments')}
        subtitle={t('segments.subtitle', 'Group contacts for targeted campaigns')}
        icon={<Users size={24} />}
        action={{ label: t('common.create', 'Create'), onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : segments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>No segments yet</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {segments.map(seg => (
            <div
              key={seg.id}
              style={{
                padding: 16,
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{seg.name}</div>
                {seg.description && <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>{seg.description}</div>}
                <div style={{ fontSize: 13, marginTop: 4, display: 'flex', gap: 12 }}>
                  <span
                    style={{
                      background: seg.type === 'dynamic' ? 'var(--color-info)' : 'var(--color-warning)',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                    }}
                  >
                    {seg.type}
                  </span>
                  <span>{seg.contactCount} contacts</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => openEdit(seg)}
                  style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(seg.id)}
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
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editItem ? 'Edit Segment' : 'Create Segment'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="Segment name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <input
              placeholder="Description (optional)"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            {!editItem && (
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as 'dynamic' | 'static' }))}
                style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
              >
                <option value="dynamic">Dynamic (filter-based)</option>
                <option value="static">Static (manual list)</option>
              </select>
            )}
            <input
              placeholder="Filter by tags (comma-separated)"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
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
