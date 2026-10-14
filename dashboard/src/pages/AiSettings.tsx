import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Bot, FileText, Trash2, Plus, Check, Send, Sparkles } from 'lucide-react';
import { aiApi, type AiConfig, type KnowledgeDocument, type AiChatResponse } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useRole } from '../hooks/useRole';
import { useToast } from '../components/Toast';
import './AiSettings.css';

export function AiSettings() {
  const { t } = useTranslation();
  const { isAdmin, canWrite } = useRole();
  const toast = useToast();
  const [tab, setTab] = useState<'config' | 'knowledge'>('config');
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Editable config form state
  const [formProvider, setFormProvider] = useState('groq');
  const [formModel, setFormModel] = useState('');
  const [formApiEndpoint, setFormApiEndpoint] = useState('');
  const [formSystemPrompt, setFormSystemPrompt] = useState('');
  const [formMaxTokens, setFormMaxTokens] = useState(1000);
  const [formMaxContextMessages, setFormMaxContextMessages] = useState(10);
  const [formUseKnowledgeBase, setFormUseKnowledgeBase] = useState(false);
  const [formAutoHandoff, setFormAutoHandoff] = useState(false);
  const [formHandoffKeywords, setFormHandoffKeywords] = useState('');
  const [formFallbackMessage, setFormFallbackMessage] = useState('');

  // Add Document modal state
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docFileType, setDocFileType] = useState('text');
  const [docContent, setDocContent] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);

  // Test chat playground state
  const [testQuery, setTestQuery] = useState('');
  const [testTesting, setTestTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<AiChatResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testLatency, setTestLatency] = useState<number | null>(null);

  const syncFormFromConfig = (c: AiConfig) => {
    setFormProvider(c.provider || 'groq');
    setFormModel(c.model || 'openai/gpt-oss-120b');
    setFormApiEndpoint(c.apiEndpoint || '');
    setFormSystemPrompt(c.systemPrompt || '');
    setFormMaxTokens(c.maxTokens ?? 1000);
    setFormMaxContextMessages(c.maxContextMessages ?? 10);
    setFormUseKnowledgeBase(c.useKnowledgeBase ?? false);
    setFormAutoHandoff(c.autoHandoff ?? false);
    setFormHandoffKeywords(c.handoffKeywords || '');
    setFormFallbackMessage(c.fallbackMessage || '');
  };

  const handleTestChat = async () => {
    if (!testQuery.trim()) return;
    setTestTesting(true);
    setTestResponse(null);
    setTestError(null);
    const start = performance.now();
    try {
      const res = await aiApi.chat({ message: testQuery.trim() });
      setTestResponse(res);
      setTestLatency(Math.round(performance.now() - start));
    } catch (err: any) {
      setTestError(err?.message || 'Failed to get response from AI');
    } finally {
      setTestTesting(false);
    }
  };


  const loadData = () => {
    setLoading(true);
    if (tab === 'config') {
      aiApi
        .getConfig()
        .then(c => {
          setConfig(c);
          syncFormFromConfig(c);
        })
        .catch(err => {
          toast.error(t('common.error', 'Error'), err?.message || 'Failed to load AI configuration');
          setConfig(null);
        })
        .finally(() => setLoading(false));
    } else {
      aiApi
        .listDocuments({ limit: 50 })
        .then(setDocuments)
        .catch(err => {
          toast.error(t('common.error', 'Error'), err?.message || 'Failed to load knowledge documents');
          setDocuments([]);
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  const handleToggle = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await aiApi.updateConfig({ enabled: !config.enabled });
      setConfig(updated);
      toast.success(
        updated.enabled ? t('ai.enabledTitle', 'AI Assistant Enabled') : t('ai.disabledTitle', 'AI Assistant Disabled'),
        updated.enabled ? t('ai.enabledDesc', 'AI chatbot will now respond to messages.') : t('ai.disabledDesc', 'AI chatbot responses are paused.')
      );
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to toggle AI state');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updated = await aiApi.updateConfig({
        provider: formProvider,
        model: formModel.trim() || null,
        apiEndpoint: formApiEndpoint.trim() || null,
        systemPrompt: formSystemPrompt.trim() || null,
        maxTokens: formMaxTokens,
        maxContextMessages: formMaxContextMessages,
        useKnowledgeBase: formUseKnowledgeBase,
        autoHandoff: formAutoHandoff,
        handoffKeywords: formHandoffKeywords.trim() || null,
        fallbackMessage: formFallbackMessage.trim() || null,
      });
      setConfig(updated);
      syncFormFromConfig(updated);
      setSaveSuccess(true);
      toast.success(t('ai.saved', 'Settings Saved'), t('ai.savedDesc', 'AI configuration was updated successfully.'));
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to save AI configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleAddDocument = async () => {
    if (!docTitle.trim() || !docContent.trim()) return;
    setAddingDoc(true);
    try {
      await aiApi.createDocument({
        title: docTitle.trim(),
        fileType: docFileType,
        content: docContent.trim(),
      });
      toast.success(t('ai.docCreated', 'Document Added'), t('ai.docCreatedDesc', 'Knowledge document saved to the knowledge base.'));
      const docs = await aiApi.listDocuments({ limit: 50 });
      setDocuments(docs);
      setShowAddDocModal(false);
      setDocTitle('');
      setDocFileType('text');
      setDocContent('');
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to add document');
    } finally {
      setAddingDoc(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!window.confirm(t('ai.confirmDeleteDoc', 'Delete this knowledge document?'))) return;
    try {
      await aiApi.deleteDocument(id);
      toast.success(t('ai.docDeleted', 'Document Deleted'), t('ai.docDeletedDesc', 'Knowledge document was removed.'));
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to delete document');
    }
  };

  return (
    <div className="ai-settings-page page-container">
      <PageHeader
        title={t('ai.title', 'AI Assistant')}
        subtitle={t('ai.subtitle', 'Configure AI chatbot and knowledge base')}
        actions={
          tab === 'knowledge' && (isAdmin || canWrite) && (
            <button className="btn-primary" onClick={() => setShowAddDocModal(true)}>
              <Plus size={18} />
              {t('ai.addDocument', 'Add Document')}
            </button>
          )
        }
      />

      <div className="ai-nav-tabs">
        <button
          className={`btn btn-sm ${tab === 'config' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('config')}
        >
          <Bot size={16} />
          <span style={{ marginLeft: 4 }}>{t('ai.configuration', 'Configuration')}</span>
        </button>
        <button
          className={`btn btn-sm ${tab === 'knowledge' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('knowledge')}
        >
          <FileText size={16} />
          <span style={{ marginLeft: 4 }}>{t('ai.knowledgeBase', 'Knowledge Base')}</span>
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : tab === 'config' && config ? (
        <div className="ai-card">
          <div className="ai-grid">
            {/* Enable/Disable toggle */}
            <div className="ai-toggle-row">
              <div>
                <label className="form-label" style={{ marginBottom: 2 }}>{t('ai.enabled', 'AI Assistant Enabled')}</label>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {config.enabled ? t('ai.activeDesc', 'Chatbot automatically replies to incoming messages') : t('ai.inactiveDesc', 'Automated AI responses are currently turned off')}
                </div>
              </div>
              {(isAdmin || canWrite) && (
                <button
                  className={`btn btn-sm ${config.enabled ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => void handleToggle()}
                  disabled={saving}
                >
                  {config.enabled ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                </button>
              )}
            </div>

            {(isAdmin || canWrite) && (
              <>
                {/* Provider */}
                <div className="form-group">
                  <label className="form-label">{t('ai.provider', 'Provider')}</label>
                  <select
                    className="form-select"
                    value={formProvider}
                    onChange={e => {
                      const newProv = e.target.value;
                      setFormProvider(newProv);
                      if (newProv === 'groq' && (!formModel || formModel.includes('gpt-4o') || formModel.includes('claude'))) {
                        setFormModel('openai/gpt-oss-120b');
                      }
                    }}
                  >
                    <option value="groq">Groq AI (Ultra Fast - LLaMA, GPT-OSS, Qwen)</option>
                    <option value="openai">OpenAI (GPT-4o, ChatGPT)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="custom">Custom Endpoint</option>
                  </select>
                </div>

                {/* Model */}
                <div className="form-group">
                  <label className="form-label">{t('ai.model', 'Model')}</label>
                  <input
                    className="form-input"
                    type="text"
                    value={formModel}
                    onChange={e => setFormModel(e.target.value)}
                    placeholder="e.g. openai/gpt-oss-120b, qwen/qwen3.8-27b, gpt-4o"
                  />
                  {formProvider === 'groq' && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
                        Groq Fast Models:
                      </span>
                      {['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'allam-2-7b'].map(m => (
                        <button
                          key={m}
                          type="button"
                          className={`model-pill ${formModel === m ? 'active' : ''}`}
                          onClick={() => setFormModel(m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Custom API Endpoint */}
                {formProvider === 'custom' && (
                  <div className="form-group">
                    <label className="form-label">{t('ai.apiEndpoint', 'API Endpoint')}</label>
                    <input
                      className="form-input"
                      type="text"
                      value={formApiEndpoint}
                      onChange={e => setFormApiEndpoint(e.target.value)}
                      placeholder="https://api.example.com/v1/chat"
                    />
                  </div>
                )}

                {/* System Prompt */}
                <div className="form-group">
                  <label className="form-label">{t('ai.systemPrompt', 'System Prompt')}</label>
                  <textarea
                    className="form-textarea"
                    value={formSystemPrompt}
                    onChange={e => setFormSystemPrompt(e.target.value)}
                    placeholder="Enter instructions for the AI (e.g. You are a helpful assistant for our shop...)"
                    rows={4}
                  />
                </div>

                {/* Max Tokens & Context */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('ai.maxTokens', 'Max Tokens')}</label>
                    <input
                      className="form-input"
                      type="number"
                      value={formMaxTokens}
                      onChange={e => setFormMaxTokens(Number(e.target.value))}
                      min={100}
                      max={4000}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('ai.maxContextMessages', 'Max Context Messages')}</label>
                    <input
                      className="form-input"
                      type="number"
                      value={formMaxContextMessages}
                      onChange={e => setFormMaxContextMessages(Number(e.target.value))}
                      min={1}
                      max={50}
                    />
                  </div>
                </div>

                {/* Knowledge Base toggle */}
                <div className="checkbox-row">
                  <input
                    type="checkbox"
                    id="useKnowledgeBase"
                    checked={formUseKnowledgeBase}
                    onChange={e => setFormUseKnowledgeBase(e.target.checked)}
                  />
                  <label htmlFor="useKnowledgeBase" className="checkbox-label">
                    {t('ai.useKnowledgeBase', 'Use Knowledge Base to answer questions')}
                  </label>
                </div>

                {/* Auto Handoff toggle */}
                <div className="checkbox-row">
                  <input
                    type="checkbox"
                    id="autoHandoff"
                    checked={formAutoHandoff}
                    onChange={e => setFormAutoHandoff(e.target.checked)}
                  />
                  <label htmlFor="autoHandoff" className="checkbox-label">
                    {t('ai.autoHandoff', 'Enable Auto-Handoff to human agent when needed')}
                  </label>
                </div>

                {/* Handoff Keywords */}
                <div className="form-group">
                  <label className="form-label">{t('ai.handoffKeywords', 'Handoff Keywords (comma separated)')}</label>
                  <input
                    className="form-input"
                    type="text"
                    value={formHandoffKeywords}
                    onChange={e => setFormHandoffKeywords(e.target.value)}
                    placeholder="help, human, agent, support, live chat"
                  />
                </div>

                {/* Fallback Message */}
                <div className="form-group">
                  <label className="form-label">{t('ai.fallback', 'Fallback Message')}</label>
                  <textarea
                    className="form-textarea"
                    value={formFallbackMessage}
                    onChange={e => setFormFallbackMessage(e.target.value)}
                    placeholder="Message shown when AI is unable to answer..."
                    rows={2}
                  />
                </div>

                {/* Save Button */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <button className="btn-primary" onClick={handleSaveConfig} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" size={16} /> : saveSuccess ? <Check size={16} /> : null}
                    {saving ? t('common.saving', 'Saving...') : saveSuccess ? t('common.saved', 'Saved!') : t('common.saveChanges', 'Save Changes')}
                  </button>
                </div>

                {/* Live Test Groq AI Assistant Playground */}
                <div className="test-chat-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Sparkles size={18} color="var(--primary)" />
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Test Groq AI Assistant</span>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: 12, background: 'rgba(37, 211, 102, 0.1)', color: 'var(--primary)', fontWeight: 600, marginLeft: 'auto' }}>
                      6 Groq Keys in Rotation ⚡
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      className="form-input"
                      type="text"
                      value={testQuery}
                      onChange={e => setTestQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleTestChat(); }}
                      placeholder="Type a message to test (e.g. Hello, how can you help me?)..."
                    />
                    <button
                      className="btn-primary"
                      type="button"
                      style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      onClick={handleTestChat}
                      disabled={testTesting || !testQuery.trim()}
                    >
                      {testTesting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                      {testTesting ? 'Testing...' : 'Send'}
                    </button>
                  </div>

                  {testResponse && (
                    <div className="test-reply-box">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span><strong>AI Reply:</strong></span>
                        <span>
                          {testLatency !== null && `⏱️ ${testLatency}ms`}
                          {testResponse.tokensUsed ? ` • 🪙 ${testResponse.tokensUsed} tokens` : ''}
                        </span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{testResponse.reply}</div>
                    </div>
                  )}

                  {testError && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem' }}>
                      ⚠️ Error: {testError}
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      ) : tab === 'knowledge' ? (
        documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} strokeWidth={1} />
            <p>{t('ai.emptyDocs', 'No knowledge documents uploaded yet')}</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.title', 'Title')}</th>
                  <th>{t('ai.docType', 'Type')}</th>
                  <th>{t('common.status', 'Status')}</th>
                  <th>{t('common.updated', 'Updated')}</th>
                  {(isAdmin || canWrite) && <th>{t('common.actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{doc.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.content}
                      </div>
                    </td>
                    <td><span style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600 }}>{doc.fileType}</span></td>
                    <td>
                      <span style={{ color: doc.status === 'ready' ? 'var(--primary, #25d366)' : 'var(--text-secondary)' }}>
                        {doc.status}
                      </span>
                    </td>
                    <td>{new Date(doc.updatedAt).toLocaleDateString()}</td>
                    {(isAdmin || canWrite) && (
                      <td>
                        <button
                          className="btn-icon btn-ghost btn-danger"
                          title={t('common.delete', 'Delete')}
                          onClick={() => void handleDeleteDoc(doc.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* Add Document Modal */}
      {showAddDocModal && (
        <Modal
          open
          onClose={() => setShowAddDocModal(false)}
          title={t('ai.addDocTitle', 'Add Knowledge Document')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowAddDocModal(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleAddDocument}
                disabled={addingDoc || !docTitle.trim() || !docContent.trim()}
              >
                {addingDoc ? <Loader2 className="animate-spin" size={16} /> : t('common.create', 'Add Document')}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('ai.docTitle', 'Document Title')} *</label>
              <input
                className="form-input"
                type="text"
                placeholder={t('ai.docTitlePlaceholder', 'e.g. Return Policy, Pricing FAQ')}
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('ai.docFormat', 'Format')}</label>
              <select className="form-select" value={docFileType} onChange={e => setDocFileType(e.target.value)}>
                <option value="text">Plain Text</option>
                <option value="markdown">Markdown</option>
                <option value="faq">FAQ</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('ai.docContent', 'Content')} *</label>
              <textarea
                className="form-textarea"
                placeholder={t('ai.docContentPlaceholder', 'Enter facts, policies, instructions, or FAQs that the AI should know...')}
                value={docContent}
                onChange={e => setDocContent(e.target.value)}
                rows={8}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
