import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  Users,
  Search,
  Sparkles,
  Tag,
  Layers,
  Eye,
} from 'lucide-react';
import { contactSegmentApi, type ContactSegment } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export function ContactSegments() {
  const { t } = useTranslation();
  const toast = useToast();
  const [segments, setSegments] = useState<ContactSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'dynamic' | 'static'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<ContactSegment | null>(null);
  const [previewSegment, setPreviewSegment] = useState<ContactSegment | null>(null);

  const [form, setForm] = useState<{ name: string; description: string; type: 'dynamic' | 'static'; tags: string }>({
    name: '',
    description: '',
    type: 'dynamic',
    tags: '',
  });

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

  const openCreate = (presetName?: string, presetTags?: string) => {
    setEditItem(null);
    setForm({
      name: presetName || '',
      description: presetName ? `Targeted segment for ${presetName}` : '',
      type: 'dynamic',
      tags: presetTags || '',
    });
    setShowModal(true);
  };

  const openEdit = (seg: ContactSegment) => {
    setEditItem(seg);
    const tags = ((seg.filters?.tags as string[] | undefined) || []).join(', ');
    setForm({ name: seg.name, description: seg.description || '', type: seg.type, tags });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.warning('Validation', 'Segment name is required');
      return;
    }

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
          name: form.name.trim(),
          description: form.description || undefined,
          filters,
        });
        toast.success('Updated', 'Segment updated successfully');
      } else {
        await contactSegmentApi.create({
          name: form.name.trim(),
          description: form.description || undefined,
          type: form.type,
          filters,
        });
        toast.success('Created', 'New contact segment created');
      }
      setShowModal(false);
      load();
    } catch (err: unknown) {
      toast.error('Save Failed', err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete segment "${name}"?`)) return;
    try {
      await contactSegmentApi.delete(id);
      toast.success('Deleted', 'Segment removed');
      load();
    } catch (err: unknown) {
      toast.error('Error', err instanceof Error ? err.message : 'Failed');
    }
  };

  // Filtered Segments
  const filteredSegments = useMemo(() => {
    return segments.filter(seg => {
      const matchSearch =
        seg.name.toLowerCase().includes(search.toLowerCase()) ||
        (seg.description || '').toLowerCase().includes(search.toLowerCase());

      const matchType = typeFilter === 'all' || seg.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [segments, search, typeFilter]);

  const dynamicCount = segments.filter(s => s.type === 'dynamic').length;
  const staticCount = segments.filter(s => s.type === 'static').length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1140, margin: '0 auto' }}>
      <PageHeader
        title={t('segments.title', 'Audience & Contact Segments')}
        subtitle={t('segments.subtitle', 'Smart dynamic grouping of WhatsApp contacts for targeted campaigns and automations')}
        icon={<Users size={24} />}
        action={{ label: 'New Segment', onClick: () => openCreate(), icon: <Plus size={16} /> }}
      />

      {/* Top Stats Overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          margin: '16px 0 24px',
        }}
      >
        <div
          style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
            }}
          >
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Segments</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{segments.length}</div>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(34, 197, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22c55e',
            }}
          >
            <Sparkles size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Dynamic Auto-Filters</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{dynamicCount}</div>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(168, 85, 247, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a855f7',
            }}
          >
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Static Lists</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{staticCount}</div>
          </div>
        </div>
      </div>

      {/* Quick Preset Segment Templates */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Recommended Segment Presets:
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { name: 'Insurance Inquiries', tags: 'insurance, term_plan, mediclaim' },
            { name: 'Mutual Fund SIP Investors', tags: 'mutual_fund, sip, investment' },
            { name: 'High Priority VIP Leads', tags: 'vip, high_value, urgent' },
            { name: 'Recent Inbound WhatsApp', tags: 'whatsapp, inbound' },
          ].map(preset => (
            <button
              key={preset.name}
              className="btn btn-secondary btn-sm"
              onClick={() => openCreate(preset.name, preset.tags)}
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={12} /> {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 14,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTypeFilter('all')}
          >
            All ({segments.length})
          </button>
          <button
            className={`btn btn-sm ${typeFilter === 'dynamic' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTypeFilter('dynamic')}
          >
            Dynamic
          </button>
          <button
            className={`btn btn-sm ${typeFilter === 'static' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTypeFilter('static')}
          >
            Static Lists
          </button>
        </div>

        <div style={{ position: 'relative', width: 260 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
          />
          <input
            type="text"
            className="input"
            placeholder="Search segments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, fontSize: 13, height: 36 }}
          />
        </div>
      </div>

      {/* Segments Cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
          <Loader2 className="animate-spin" size={28} color="var(--primary)" />
        </div>
      ) : filteredSegments.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 50,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px dashed var(--border)',
          }}
        >
          <Users size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No contact segments found</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 460, margin: '0 auto 16px' }}>
            Organize your WhatsApp contacts into target segments based on tags, conversation status, or customer interests.
          </p>
          <button className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={16} /> Create First Segment
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
          {filteredSegments.map(seg => {
            const tags = (seg.filters?.tags as string[] | undefined) || [];

            return (
              <div
                key={seg.id}
                style={{
                  padding: 18,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: seg.type === 'dynamic' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: seg.type === 'dynamic' ? '#22c55e' : '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {seg.type === 'dynamic' ? <Sparkles size={16} /> : <Layers size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{seg.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {seg.type} Segment
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openEdit(seg)}
                        style={{ padding: '4px 6px' }}
                        title="Edit Segment"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(seg.id, seg.name)}
                        style={{ padding: '4px 6px' }}
                        title="Delete Segment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {seg.description && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
                      {seg.description}
                    </div>
                  )}

                  {/* Filter Tags */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Matching Criteria Tags:
                    </div>
                    {tags.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {tags.map(t => (
                          <span
                            key={t}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: 'var(--border)',
                              color: 'var(--text-primary)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Tag size={10} /> {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        All contacts matched
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                    marginTop: 14,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Created: {new Date(seg.createdAt).toLocaleDateString()}
                  </span>

                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setPreviewSegment(seg)}
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Eye size={12} /> Inspect Rules
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Segment */}
      {showModal && (
        <Modal
          title={editItem ? 'Edit Contact Segment' : 'Create Contact Segment'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Segment Name *
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Term Insurance Policy Leads"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Description
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Customers interested in term life insurance and financial protection"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Segment Type
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as 'dynamic' | 'static' }))}
                disabled={!!editItem}
              >
                <option value="dynamic">Dynamic (Auto-updates as contacts match tags)</option>
                <option value="static">Static List (Fixed manual list)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Filter Tags (comma-separated)
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. insurance, term_plan, interested"
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                Contacts carrying any of these tags will be automatically included in this audience segment.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
                {editItem ? 'Update Segment' : 'Create Segment'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Inspect Segment Details */}
      {previewSegment && (
        <Modal
          title={`Segment Details: ${previewSegment.name}`}
          onClose={() => setPreviewSegment(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 600 }}>Type:</span>
              <span style={{ textTransform: 'capitalize', padding: '2px 8px', borderRadius: 10, background: 'var(--border)', fontSize: 12 }}>
                {previewSegment.type}
              </span>
            </div>

            <div>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Description:</span>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {previewSegment.description || 'No description provided.'}
              </div>
            </div>

            <div>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Target Filter Schema:</span>
              <pre
                style={{
                  background: 'var(--bg-tertiary, #0f172a)',
                  color: '#f8fafc',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              >
                {JSON.stringify(previewSegment.filters || { tags: [] }, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setPreviewSegment(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
