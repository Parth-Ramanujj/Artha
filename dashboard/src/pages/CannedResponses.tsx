import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  MessageSquare,
  Search,
  Copy,
  Check,
  Zap,
  Tag,
  Eye,
  CheckCheck,
} from 'lucide-react';
import { cannedResponseApi, type CannedResponse } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import './CannedResponses.css';

export function CannedResponses() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<CannedResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewBubbleId, setPreviewBubbleId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    shortcut: '',
    content: '',
    category: '',
  });

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

  const openCreate = (defaultCategory?: string) => {
    setEditItem(null);
    setForm({
      title: '',
      shortcut: '',
      content: '',
      category: defaultCategory || 'General',
    });
    setShowModal(true);
  };

  const openEdit = (item: CannedResponse) => {
    setEditItem(item);
    setForm({
      title: item.title,
      shortcut: item.shortcut.replace(/^\//, ''),
      content: item.content,
      category: item.category || 'General',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.warning('Validation', 'Title and Content are required');
      return;
    }

    const cleanShortcut = form.shortcut.trim().replace(/^\//, '');

    const payload = {
      title: form.title.trim(),
      shortcut: cleanShortcut ? `/${cleanShortcut}` : '/reply',
      content: form.content.trim(),
      category: form.category.trim() || 'General',
    };

    try {
      if (editItem) {
        await cannedResponseApi.update(editItem.id, payload);
        toast.success('Updated', 'Quick reply updated successfully');
      } else {
        await cannedResponseApi.create(payload);
        toast.success('Created', 'New quick reply created');
      }
      setShowModal(false);
      load();
    } catch (err: unknown) {
      toast.error('Save Failed', err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete canned response "${title}"?`)) return;
    try {
      await cannedResponseApi.delete(id);
      toast.success('Deleted', 'Quick reply deleted');
      load();
    } catch (err: unknown) {
      toast.error('Error', err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const copyContent = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.info('Copied', 'Template text copied to clipboard');
  };

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [items]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch =
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.shortcut.toLowerCase().includes(search.toLowerCase()) ||
        item.content.toLowerCase().includes(search.toLowerCase()) ||
        (item.category || '').toLowerCase().includes(search.toLowerCase());

      const matchCategory =
        categoryFilter === 'all' || item.category?.toLowerCase() === categoryFilter.toLowerCase();

      return matchSearch && matchCategory;
    });
  }, [items, search, categoryFilter]);

  const insertVariable = (variable: string) => {
    setForm(f => ({ ...f, content: f.content + (f.content.endsWith(' ') || f.content === '' ? '' : ' ') + variable }));
  };

  return (
    <div className="cr-container">
      <PageHeader
        title={t('cannedResponses.title', 'Canned Responses & Quick Replies')}
        subtitle={t('cannedResponses.subtitle', 'Fast reply shortcuts (/command) for live WhatsApp agents and workflows')}
        icon={<MessageSquare size={24} />}
        action={{ label: 'New Quick Reply', onClick: () => openCreate(), icon: <Plus size={16} /> }}
      />

      {/* Top Stats Overview */}
      <div className="cr-stats-grid">
        <div className="cr-stat-card">
          <div className="cr-stat-icon blue">
            <MessageSquare size={22} />
          </div>
          <div>
            <div className="cr-stat-label">Quick Replies</div>
            <div className="cr-stat-value">{items.length}</div>
          </div>
        </div>

        <div className="cr-stat-card">
          <div className="cr-stat-icon green">
            <Zap size={22} />
          </div>
          <div>
            <div className="cr-stat-label">Trigger Shortcuts</div>
            <div className="cr-stat-value">{items.length} Active</div>
          </div>
        </div>

        <div className="cr-stat-card">
          <div className="cr-stat-icon purple">
            <Tag size={22} />
          </div>
          <div>
            <div className="cr-stat-label">Categories</div>
            <div className="cr-stat-value">{categories.length || 1} Topics</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="cr-toolbar">
        <div className="cr-category-pills">
          <button
            className={`cr-cat-pill ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All Replies ({items.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`cr-cat-pill ${categoryFilter.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="cr-search-box">
          <Search size={16} className="cr-search-icon" />
          <input
            type="text"
            className="cr-search-input"
            placeholder="Search shortcut, title, content..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List / Cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 56,
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '2px dashed var(--border)',
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: 'rgba(37, 211, 102, 0.1)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <MessageSquare size={30} />
          </div>
          <h4 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No canned responses found</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.5 }}>
            Create reusable response templates with shortcuts like <code>/welcome</code> or <code>/claim</code> for fast customer replies.
          </p>
          <button className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={16} /> Create Quick Reply
          </button>
        </div>
      ) : (
        <div className="cr-grid">
          {filteredItems.map(item => {
            const isPreviewing = previewBubbleId === item.id;

            return (
              <div key={item.id} className="cr-card">
                <div>
                  <div className="cr-card-header">
                    <div>
                      <div className="cr-card-title">{item.title}</div>
                      <div className="cr-meta-row">
                        <span className="cr-shortcut-chip">
                          {item.shortcut.startsWith('/') ? item.shortcut : `/${item.shortcut}`}
                        </span>
                        {item.category && (
                          <span className="cr-category-tag">
                            {item.category}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="cr-card-actions">
                      <button
                        className="cr-btn-icon"
                        onClick={() => openEdit(item)}
                        title="Edit Template"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="cr-btn-icon delete"
                        onClick={() => handleDelete(item.id, item.title)}
                        title="Delete Template"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* WhatsApp Chat Bubble Simulator Toggle */}
                  {isPreviewing ? (
                    <div className="cr-bubble-wrap">
                      <div className="cr-bubble-label">WhatsApp Live Bubble</div>
                      <div className="cr-wa-bubble">
                        <div>{item.content}</div>
                        <div className="cr-wa-bubble-meta">
                          <span>10:45 AM</span>
                          <CheckCheck size={14} className="cr-wa-checkmarks" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        background: 'var(--bg-tertiary)',
                        padding: 14,
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        maxHeight: 120,
                        overflowY: 'auto',
                        lineHeight: 1.55,
                        margin: '12px 0',
                      }}
                    >
                      {item.content}
                    </div>
                  )}
                </div>

                {/* Footer Toolbar */}
                <div className="cr-card-footer">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setPreviewBubbleId(isPreviewing ? null : item.id)}
                    style={{ fontSize: 12 }}
                  >
                    <Eye size={13} />
                    {isPreviewing ? 'Hide Preview' : 'WhatsApp Preview'}
                  </button>

                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => copyContent(item.content, item.id)}
                    style={{ fontSize: 12 }}
                  >
                    {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === item.id ? 'Copied!' : 'Copy Text'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Quick Reply */}
      {showModal && (
        <Modal
          title={editItem ? 'Edit Quick Reply' : 'Create Quick Reply'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-primary)' }}>
                Template Title *
              </label>
              <input
                className="input"
                placeholder="e.g. Claim Guidance & Checklist"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-primary)' }}>
                  Shortcut Trigger *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--primary)' }}>
                    /
                  </span>
                  <input
                    className="input"
                    style={{ paddingLeft: 24 }}
                    placeholder="claim"
                    value={form.shortcut}
                    onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-primary)' }}>
                  Category
                </label>
                <input
                  className="input"
                  placeholder="e.g. Insurance, Claims, General"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Message Content (WhatsApp Formatted) *
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Supports *bold*, _italics_, ~strike~
                </span>
              </div>
              <textarea
                className="input"
                rows={5}
                style={{ lineHeight: 1.5, resize: 'vertical' }}
                placeholder="Write message template... Use *bold*, _italics_, and emojis for WhatsApp formatting"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              />

              <div className="cr-var-helper-row">
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Insert Variable:</span>
                <button type="button" className="cr-var-pill" onClick={() => insertVariable('{{name}}')}>+ {'{{name}}'}</button>
                <button type="button" className="cr-var-pill" onClick={() => insertVariable('{{phone}}')}>+ {'{{phone}}'}</button>
                <button type="button" className="cr-var-pill" onClick={() => insertVariable('{{date}}')}>+ {'{{date}}'}</button>
              </div>
            </div>

            {/* Live Chat Bubble Preview in Modal */}
            {form.content.trim() && (
              <div className="cr-bubble-wrap">
                <div className="cr-bubble-label">Live Preview</div>
                <div className="cr-wa-bubble">
                  <div>{form.content}</div>
                  <div className="cr-wa-bubble-meta">
                    <span>Just now</span>
                    <CheckCheck size={13} className="cr-wa-checkmarks" />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.title.trim() || !form.content.trim()}>
                {editItem ? 'Update Quick Reply' : 'Create Quick Reply'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

