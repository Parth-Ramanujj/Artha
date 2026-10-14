import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { request } from '../services/api';

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  type: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AiConfig {
  enabled: boolean;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export function ChatbotTraining() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'knowledge' | 'config'>('knowledge');
  const [showModal, setShowModal] = useState(false);
  const [editDoc, setEditDoc] = useState<KnowledgeDoc | null>(null);
  const [form, setForm] = useState({ title: '', content: '', type: 'faq' });

  const load = async () => {
    try {
      const [d, c] = await Promise.all([request<KnowledgeDoc[]>('/ai/documents'), request<AiConfig>('/ai/config')]);
      setDocs(d);
      setConfig(c);
    } catch {
      addToast(t('common.error'), 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditDoc(null);
    setForm({ title: '', content: '', type: 'faq' });
    setShowModal(true);
  };

  const openEdit = (doc: KnowledgeDoc) => {
    setEditDoc(doc);
    setForm({ title: doc.title, content: doc.content, type: doc.type });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editDoc) {
        await request(`/ai/documents/${editDoc.id}`, { method: 'PUT', body: form });
      } else {
        await request('/ai/documents', { method: 'POST', body: form });
      }
      setShowModal(false);
      load();
      addToast(t('common.success'), 'success');
    } catch {
      addToast(t('common.error'), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await request(`/ai/documents/${id}`, { method: 'DELETE' });
      load();
    } catch {
      addToast(t('common.error'), 'error');
    }
  };

  const handleConfigSave = async () => {
    if (!config) return;
    try {
      await request('/ai/config', { method: 'PUT', body: config });
      addToast(t('common.success'), 'success');
    } catch {
      addToast(t('common.error'), 'error');
    }
  };

  if (loading) return <div className="page-loading">{t('common.loading')}</div>;

  return (
    <div className="page-container">
      <PageHeader title="Chatbot Training" subtitle="Manage AI knowledge base and configuration" />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          className={`btn ${tab === 'knowledge' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('knowledge')}
        >
          Knowledge Base
        </button>
        <button
          className={`btn ${tab === 'config' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('config')}
        >
          Configuration
        </button>
      </div>

      {tab === 'knowledge' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <button className="btn btn-primary" onClick={openCreate}>
              + Add Document
            </button>
          </div>
          {docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
              No knowledge base documents yet. Add FAQs, product info, or guidelines to train your chatbot.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {docs.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    padding: '1rem',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{doc.title}</span>
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          background: 'var(--color-bg)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {doc.type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(doc)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(doc.id)}>
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                  <p
                    style={{
                      margin: '0.5rem 0 0',
                      fontSize: '0.85rem',
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '4rem',
                      overflow: 'hidden',
                    }}
                  >
                    {doc.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'config' && config && (
        <div style={{ maxWidth: '600px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label className="form-label" style={{ margin: 0 }}>
                AI Enabled
              </label>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={e => setConfig({ ...config, enabled: e.target.checked })}
              />
            </div>
            <div>
              <label className="form-label">Provider</label>
              <select
                className="form-input"
                value={config.provider}
                onChange={e => setConfig({ ...config, provider: e.target.value })}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
            <div>
              <label className="form-label">Model</label>
              <input
                className="form-input"
                value={config.model}
                onChange={e => setConfig({ ...config, model: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">System Prompt</label>
              <textarea
                className="form-input"
                rows={6}
                value={config.systemPrompt}
                onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Temperature ({config.temperature})</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={config.temperature}
                  onChange={e => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label className="form-label">Max Tokens</label>
                <input
                  className="form-input"
                  type="number"
                  value={config.maxTokens}
                  onChange={e => setConfig({ ...config, maxTokens: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleConfigSave}>
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={editDoc ? 'Edit Document' : 'Add Knowledge Document'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Title</label>
              <input
                className="form-input"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Type</label>
              <select
                className="form-input"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option value="faq">FAQ</option>
                <option value="product">Product Info</option>
                <option value="guideline">Guideline</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="form-label">Content</label>
              <textarea
                className="form-input"
                rows={8}
                value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })}
                placeholder="Enter knowledge content..."
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editDoc ? 'Update' : t('common.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
