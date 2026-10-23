import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  GitBranch,
  Play,
  Pause,
  Trash2,
  Plus,
  FlaskConical,
  MessageSquare,
  FileText,
  Clock,
  Globe,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
  Layers,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Tag,
  Download,
  Upload,
} from 'lucide-react';
import { workflowApi, type WorkflowDefinition, type WorkflowRun } from '../services/api';
import { useSessionsQuery, useTemplatesQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useRole } from '../hooks/useRole';
import { useToast } from '../components/Toast';
import { VisualWorkflowBuilder } from '../components/workflow-builder/VisualWorkflowBuilder';
import { parseWorkflowFile, toWorkflowFile, workflowFileName } from '../utils/workflowShare';
import { WorkflowRunLog } from '../components/workflows/WorkflowRunLog';
import './Workflows.css';

type ActionStep = {
  id: string;
  type: 'send_message' | 'send_template' | 'wait' | 'webhook_call' | 'handoff_to_human' | 'add_tag';
  config: Record<string, any>;
};

export function Workflows() {
  const { t } = useTranslation();
  const { isAdmin, canWrite } = useRole();
  const toast = useToast();
  const importInput = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'workflows' | 'runs'>('workflows');
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // Sessions for template lookup & testing
  const { data: sessions = [] } = useSessionsQuery();
  const activeSessionId = sessions[0]?.id || '';
  const [selectedSessionId, setSelectedSessionId] = useState(activeSessionId);
  const { data: templates = [] } = useTemplatesQuery(selectedSessionId || activeSessionId, Boolean(selectedSessionId || activeSessionId));

  // Builder Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVisualBuilder, setShowVisualBuilder] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'message_received' | 'keyword_match'>('message_received');
  const [keywords, setKeywords] = useState('');
  const [workingHoursOnly, setWorkingHoursOnly] = useState(false);
  const [actions, setActions] = useState<ActionStep[]>([
    { id: 'step-1', type: 'send_message', config: { message: 'Hello! Thanks for reaching out.' } },
  ]);

  // Test Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testWorkflow, setTestWorkflow] = useState<WorkflowDefinition | null>(null);
  const [testSessionId, setTestSessionId] = useState('');
  const [testChatId, setTestChatId] = useState('919876543210');
  const [testMessageBody, setTestMessageBody] = useState('Hi');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WorkflowRun | null>(null);

  // Run Inspector Modal State

  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  const handleExport = (wf: WorkflowDefinition) => {
    const blob = new Blob([JSON.stringify(toWorkflowFile(wf), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = workflowFileName(wf.name);
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const shared = parseWorkflowFile(await file.text());
      await workflowApi.create({
        name: `${shared.name} (imported)`.slice(0, 200),
        description: shared.description ?? undefined,
        definition: shared.definition,
      } as Partial<WorkflowDefinition>);
      toast.success(
        t('workflows.imported', 'Workflow Imported'),
        t('workflows.importedDesc', 'Saved as a draft. Open it in the builder to connect your accounts, then publish.'),
      );
      loadWorkflows();
    } catch (err) {
      toast.error(t('common.error', 'Error'), err instanceof Error ? err.message : 'Failed to import workflow');
    }
  };

  const loadWorkflows = () => {
    setLoading(true);
    workflowApi
      .list({ limit: 50 })
      .then(setWorkflows)
      .catch(err => {
        toast.error(t('common.error', 'Error'), err?.message || 'Failed to load workflows');
        setWorkflows([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'workflows') loadWorkflows();
  }, [activeTab]);

  const handlePublish = async (id: string) => {
    try {
      await workflowApi.publish(id);
      toast.success(t('workflows.published', 'Workflow Published'), t('workflows.publishedDesc', 'Workflow is now active and listening.'));
      loadWorkflows();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to publish workflow');
    }
  };

  const handleDisable = async (id: string) => {
    try {
      await workflowApi.disable(id);
      toast.info(t('workflows.disabled', 'Workflow Disabled'), t('workflows.disabledDesc', 'Workflow execution is paused.'));
      loadWorkflows();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to disable workflow');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('workflows.confirmDelete', 'Are you sure you want to delete this workflow?'))) return;
    try {
      await workflowApi.delete(id);
      toast.success(t('workflows.deleted', 'Workflow Deleted'), t('workflows.deletedDesc', 'Workflow was deleted.'));
      loadWorkflows();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to delete workflow');
    }
  };

  const addActionStep = () => {
    const nextId = `step-${actions.length + 1}-${Date.now().toString().slice(-4)}`;
    setActions([...actions, { id: nextId, type: 'send_message', config: { message: '' } }]);
  };

  const moveActionStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= actions.length) return;
    const updated = [...actions];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setActions(updated);
  };

  const removeActionStep = (index: number) => {
    if (actions.length <= 1) return;
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateActionType = (index: number, newType: ActionStep['type']) => {
    const updated = [...actions];
    let config: Record<string, any> = {};
    if (newType === 'send_message') config = { message: '' };
    else if (newType === 'send_template') config = { templateName: templates[0]?.name || '', vars: {} };
    else if (newType === 'wait') config = { seconds: 5 };
    else if (newType === 'webhook_call') config = { url: '', method: 'POST' };
    else if (newType === 'handoff_to_human') config = { assignedTo: '' };
    else if (newType === 'add_tag') config = { tag: '' };
    updated[index] = { ...updated[index], type: newType, config };
    setActions(updated);
  };

  const updateActionConfig = (index: number, key: string, value: any) => {
    const updated = [...actions];
    updated[index] = {
      ...updated[index],
      config: { ...updated[index].config, [key]: value },
    };
    setActions(updated);
  };

  const handleCreateWorkflow = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const triggerConfig = triggerType === 'keyword_match' && keywords.trim() ? { keyword: keywords.trim() } : {};
      const conditions: any[] = [];
      if (workingHoursOnly) {
        conditions.push({
          type: 'working_hours',
          config: { start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', days: [1, 2, 3, 4, 5, 6] },
        });
      }

      const formattedActions = actions.map(a => ({
        id: a.id,
        type: a.type,
        config: a.config,
      }));

      const data: Partial<WorkflowDefinition> = {
        name: name.trim(),
        description: description.trim() || undefined,
        definition: {
          trigger: { type: triggerType, config: triggerConfig },
          conditions,
          actions: formattedActions,
        },
      };

      await workflowApi.create(data);
      toast.success(t('workflows.created', 'Workflow Created'), t('workflows.createdDesc', 'New workflow draft created successfully.'));
      setShowCreateModal(false);
      setName('');
      setDescription('');
      setTriggerType('message_received');
      setKeywords('');
      setWorkingHoursOnly(false);
      setActions([{ id: 'step-1', type: 'send_message', config: { message: 'Hello!' } }]);
      loadWorkflows();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to create workflow');
    } finally {
      setSaving(false);
    }
  };

  const openTestModal = (wf: WorkflowDefinition) => {
    setTestWorkflow(wf);
    setTestSessionId(sessions[0]?.id || '');
    setTestResult(null);
    setShowTestModal(true);
  };

  const handleRunTest = async () => {
    if (!testWorkflow) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await workflowApi.test(testWorkflow.id, {
        sessionId: testSessionId || undefined,
        chatId: testChatId.trim(),
        messageBody: testMessageBody.trim(),
      });
      setTestResult(result);
      if (result.status === 'completed') {
        toast.success(t('workflows.testSuccess', 'Test Completed'), 'All steps executed successfully!');
      } else {
        toast.error(t('workflows.testFailed', 'Test Stopped'), result.failureReason || 'One or more steps failed');
      }
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to execute test run');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="workflows-page page-container">
      <PageHeader
        title={t('workflows.title', 'Workflows & Automation')}
        subtitle={t('workflows.subtitle', 'Build multi-step automated response flows, template triggers, and webhooks')}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(isAdmin || canWrite) && (
              <>
                <button className="btn-secondary" onClick={() => importInput.current?.click()}>
                  <Upload size={16} />
                  {t('workflows.import', 'Import')}
                </button>
                <input
                  ref={importInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  aria-label={t('workflows.import', 'Import')}
                  onChange={e => {
                    void handleImport(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button className="btn-secondary" onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} />
                  {t('workflows.create', 'Quick Form')}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingWorkflow(null);
                    setShowVisualBuilder(true);
                  }}
                >
                  <GitBranch size={16} />
                  Visual Flow Builder
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Tab Switcher */}
      <div className="workflows-tabs">
        <button
          className={`tab-btn ${activeTab === 'workflows' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          <Layers size={16} />
          {t('workflows.allWorkflows', 'Workflows')} ({workflows.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'runs' ? 'active' : ''}`}
          onClick={() => setActiveTab('runs')}
        >
          <History size={16} />
          {t('workflows.runsHistory', 'Execution History')}
        </button>
      </div>

      {activeTab === 'workflows' ? (
        loading ? (
          <div className="loading-state">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : workflows.length === 0 ? (
          <div className="empty-state">
            <GitBranch size={48} strokeWidth={1} />
            <p>{t('workflows.empty', 'No workflows configured yet')}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn-secondary" onClick={() => setShowCreateModal(true)}>
                <Plus size={16} /> {t('workflows.createFirst', 'Quick Form')}
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setEditingWorkflow(null);
                  setShowVisualBuilder(true);
                }}
              >
                <GitBranch size={16} /> Open Visual Flow Builder
              </button>
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.name', 'Workflow')}</th>
                  <th>{t('workflows.trigger', 'Trigger')}</th>
                  <th>{t('workflows.pipeline', 'Action Steps')}</th>
                  <th>{t('common.status', 'Status')}</th>
                  <th>{t('common.updated', 'Updated')}</th>
                  {(isAdmin || canWrite) && <th>{t('common.actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {workflows.map(wf => {
                  const def = wf.definition as any;
                  const trigger = def?.trigger;
                  const actionsList = def?.actions || [];

                  return (
                    <tr key={wf.id}>
                      <td>
                        <div className="workflow-name">{wf.name}</div>
                        {wf.description && <div className="workflow-desc">{wf.description}</div>}
                        <div style={{ marginTop: '4px' }}>
                          <span className="slug-badge">{wf.slug}</span> <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>v{wf.version}</span>
                        </div>
                      </td>
                      <td>
                        <div className="trigger-badge">
                          {trigger?.type === 'keyword_match' ? (
                            <>
                              <span className="trigger-pill keyword">🔑 Keyword</span>
                              <span className="trigger-meta">{trigger?.config?.keyword || 'Any keyword'}</span>
                            </>
                          ) : (
                            <span className="trigger-pill message">📩 Message Received</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {def?.nodes && def.nodes.length > 0 ? (
                          <span
                            className="pipeline-chip"
                            style={{
                              background: 'rgba(37, 211, 102, 0.12)',
                              borderColor: 'rgba(37, 211, 102, 0.3)',
                              color: 'var(--primary)',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              setEditingWorkflow(wf);
                              setShowVisualBuilder(true);
                            }}
                            title="Click to edit visual graph"
                          >
                            <GitBranch size={13} /> Visual Graph Flow ({def.nodes.length} nodes)
                          </span>
                        ) : (
                          <div className="pipeline-steps-preview">
                            {actionsList.map((step: any, idx: number) => (
                              <span key={step.id || idx} className="pipeline-chip">
                                {step.type === 'send_message' && <MessageSquare size={13} />}
                                {step.type === 'send_template' && <FileText size={13} />}
                                {step.type === 'wait' && <Clock size={13} />}
                                {step.type === 'webhook_call' && <Globe size={13} />}
                                {step.type === 'handoff_to_human' && <UserCheck size={13} />}
                                {step.type === 'add_tag' && <Tag size={13} />}
                                {step.type?.replace(/_/g, ' ')}
                                {idx < actionsList.length - 1 && <ArrowRight size={11} className="step-arrow" />}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`workflow-badge ${wf.status}`}>
                          {wf.status}
                        </span>
                      </td>
                      <td>{new Date(wf.updatedAt).toLocaleDateString()}</td>
                      {(isAdmin || canWrite) && (
                        <td>
                          <div className="workflow-actions-cell">
                            <button
                              className="btn-icon btn-ghost btn-visual"
                              title="Edit in Visual Builder"
                              onClick={() => {
                                setEditingWorkflow(wf);
                                setShowVisualBuilder(true);
                              }}
                            >
                              <GitBranch size={16} />
                            </button>
                            <button
                              className="btn-icon btn-ghost"
                              title={t('workflows.export', 'Export (share as file)')}
                              aria-label={t('workflows.export', 'Export (share as file)')}
                              onClick={() => handleExport(wf)}
                            >
                              <Download size={16} />
                            </button>
                            <button
                              className="btn-icon btn-ghost btn-test"
                              title="Test Workflow Execution"
                              onClick={() => openTestModal(wf)}
                            >
                              <FlaskConical size={16} />
                            </button>
                            {wf.status === 'draft' && (
                              <button
                                className="btn-icon btn-ghost btn-publish"
                                title={t('workflows.publish', 'Publish')}
                                onClick={() => void handlePublish(wf.id)}
                              >
                                <Play size={16} />
                              </button>
                            )}
                            {wf.status === 'published' && (
                              <button
                                className="btn-icon btn-ghost btn-disable"
                                title={t('workflows.disable', 'Disable')}
                                onClick={() => void handleDisable(wf.id)}
                              >
                                <Pause size={16} />
                              </button>
                            )}
                            {wf.status !== 'published' && (
                              <button
                                className="btn-icon btn-ghost btn-danger"
                                title={t('common.delete', 'Delete')}
                                onClick={() => void handleDelete(wf.id)}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <WorkflowRunLog />
      )}

      {/* Advanced Multi-Step Workflow Builder Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => setShowCreateModal(false)}
          title={t('workflows.createTitle', 'Build Multi-Step Automation Workflow')}
          closeLabel={t('common.close', 'Close')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateWorkflow}
                disabled={saving || !name.trim()}
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : t('common.create', 'Save & Create Draft')}
              </button>
            </>
          }
        >
          <div className="workflow-builder-form">
            {/* General Info */}
            <div className="form-section">
              <h4 className="section-title">1. General Information</h4>
              <div className="form-group">
                <label className="form-label">Workflow Name *</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Price Inquiry Bot, Welcome Auto-Reply"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginTop: '0.6rem' }}>
                <label className="form-label">Description (Optional)</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Brief description of when this workflow executes"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Trigger Configuration */}
            <div className="form-section">
              <h4 className="section-title">2. When Should This Run? (Trigger)</h4>
              <div className="form-group">
                <label className="form-label">Trigger Condition</label>
                <select
                  className="form-select"
                  value={triggerType}
                  onChange={e => setTriggerType(e.target.value as any)}
                >
                  <option value="message_received">Any Incoming Message</option>
                  <option value="keyword_match">Keyword Match (Specific words in customer message)</option>
                </select>
              </div>

              {triggerType === 'keyword_match' && (
                <div className="form-group" style={{ marginTop: '0.6rem' }}>
                  <label className="form-label">Match Keywords (comma separated) *</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. price, cost, offer, help, menu"
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                  />
                  <span className="field-hint">
                    Matches if the customer's message contains any of these words (case-insensitive).
                  </span>
                </div>
              )}

              <div style={{ marginTop: '0.75rem' }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={workingHoursOnly}
                    onChange={e => setWorkingHoursOnly(e.target.checked)}
                  />
                  <span>Only execute during working hours (9:00 AM - 6:00 PM)</span>
                </label>
              </div>
            </div>

            {/* Actions Pipeline */}
            <div className="form-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 className="section-title" style={{ margin: 0 }}>3. Action Pipeline Steps</h4>
                <button type="button" className="btn-secondary btn-sm" onClick={addActionStep}>
                  <Plus size={14} /> Add Next Step
                </button>
              </div>

              <div className="action-steps-container">
                {actions.map((act, index) => (
                  <div key={act.id} className="action-step-card">
                    <div className="step-header">
                      <span className="step-num-badge">Step {index + 1}</span>
                      <select
                        className="form-select step-type-select"
                        value={act.type}
                        onChange={e => updateActionType(index, e.target.value as any)}
                      >
                        <option value="send_message">💬 Send Text Message</option>
                        <option value="send_template">📑 Send Template Message</option>
                        <option value="wait">⏳ Wait / Delay</option>
                        <option value="webhook_call">🌐 Call External Webhook / API</option>
                        <option value="handoff_to_human">👤 Transfer to Human Agent</option>
                        <option value="add_tag">🏷️ Add Tag</option>
                      </select>
                      <div className="step-order-btns">
                        <button
                          type="button"
                          className="btn-icon btn-ghost btn-step-order"
                          title="Move Up"
                          disabled={index === 0}
                          onClick={() => moveActionStep(index, 'up')}
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-ghost btn-step-order"
                          title="Move Down"
                          disabled={index === actions.length - 1}
                          onClick={() => moveActionStep(index, 'down')}
                        >
                          <ChevronDown size={15} />
                        </button>
                      </div>
                      {actions.length > 1 && (
                        <button
                          type="button"
                          className="btn-icon btn-ghost btn-danger"
                          title="Remove Step"
                          onClick={() => removeActionStep(index)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    <div className="step-body">
                      {act.type === 'send_message' && (
                        <div className="form-group">
                          <label className="form-label">Message Content</label>
                          <textarea
                            className="form-textarea"
                            rows={3}
                            placeholder="Hello {{sender}}, thank you for reaching out! We received: '{{message}}'"
                            value={act.config.message || ''}
                            onChange={e => updateActionConfig(index, 'message', e.target.value)}
                          />
                          <div className="variable-chips">
                            <span className="chip-label">Quick Variables:</span>
                            <span
                              className="chip"
                              onClick={() =>
                                updateActionConfig(index, 'message', (act.config.message || '') + ' {{name}}')
                              }
                            >
                              &#123;&#123;name&#125;&#125;
                            </span>
                            <span
                              className="chip"
                              onClick={() =>
                                updateActionConfig(index, 'message', (act.config.message || '') + ' {{from}}')
                              }
                            >
                              &#123;&#123;from&#125;&#125;
                            </span>
                            <span
                              className="chip"
                              onClick={() =>
                                updateActionConfig(index, 'message', (act.config.message || '') + ' {{message}}')
                              }
                            >
                              &#123;&#123;message&#125;&#125;
                            </span>
                          </div>
                        </div>
                      )}

                      {act.type === 'send_template' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <div className="form-group">
                            <label className="form-label">Select Template</label>
                            <select
                              className="form-select"
                              value={act.config.templateName || ''}
                              onChange={e => updateActionConfig(index, 'templateName', e.target.value)}
                            >
                              <option value="">-- Choose Template --</option>
                              {templates.map(tmpl => (
                                <option key={tmpl.id} value={tmpl.name}>
                                  {tmpl.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {act.type === 'wait' && (
                        <div className="form-group">
                          <label className="form-label">Delay Duration (Seconds)</label>
                          <input
                            type="number"
                            className="form-input"
                            min={1}
                            max={300}
                            value={act.config.seconds ?? 5}
                            onChange={e => updateActionConfig(index, 'seconds', parseInt(e.target.value, 10))}
                          />
                          <span className="field-hint">Pauses this workflow before continuing to the next step.</span>
                        </div>
                      )}

                      {act.type === 'webhook_call' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <div className="form-group">
                            <label className="form-label">Webhook URL</label>
                            <input
                              type="url"
                              className="form-input"
                              placeholder="https://your-crm.com/api/lead-capture"
                              value={act.config.url || ''}
                              onChange={e => updateActionConfig(index, 'url', e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Method</label>
                            <select
                              className="form-select"
                              value={act.config.method || 'POST'}
                              onChange={e => updateActionConfig(index, 'method', e.target.value)}
                            >
                              <option value="POST">POST (JSON payload with message details)</option>
                              <option value="GET">GET</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {act.type === 'handoff_to_human' && (
                        <div className="form-group">
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Automatically changes conversation status to <strong>Open</strong> and notifies team agents in the inbox.
                          </p>
                        </div>
                      )}

                      {act.type === 'add_tag' && (
                        <div className="form-group">
                          <label className="form-label">Tag Name</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. VIP, lead, support"
                            value={act.config.tag || ''}
                            onChange={e => updateActionConfig(index, 'tag', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Interactive Workflow Test Modal */}
      {showTestModal && testWorkflow && (
        <Modal
          open
          onClose={() => setShowTestModal(false)}
          title={`🧪 Test Workflow: ${testWorkflow.name}`}
          closeLabel="Close"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowTestModal(false)}>
                Close
              </button>
              <button className="btn-primary" onClick={handleRunTest} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" size={16} /> : 'Execute Test Run'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Simulate an incoming message to execute this workflow immediately. You will see every step run and inspect the results.
            </p>

            <div className="form-group">
              <label className="form-label">WhatsApp Session</label>
              <select
                className="form-select"
                value={testSessionId}
                onChange={e => setTestSessionId(e.target.value)}
              >
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone || 'No Phone'}) - {s.status}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Simulated Customer Phone</label>
              <input
                className="form-input"
                type="text"
                placeholder="919876543210"
                value={testChatId}
                onChange={e => setTestChatId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Simulated Message Body</label>
              <input
                className="form-input"
                type="text"
                placeholder="Message that triggers this flow (e.g. price, help)"
                value={testMessageBody}
                onChange={e => setTestMessageBody(e.target.value)}
              />
            </div>

            {testResult && (
              <div className="test-results-box">
                <div className="test-results-header">
                  <strong>Execution Status:</strong>
                  <span className={`run-status-badge ${testResult.status}`}>{testResult.status}</span>
                </div>
                {testResult.failureReason && (
                  <div className="test-error-banner">
                    <AlertCircle size={15} />
                    <span>{testResult.failureReason}</span>
                  </div>
                )}
                <div className="test-steps-list">
                  {((testResult.steps as any[]) || []).map((st: any, i: number) => (
                    <div key={i} className="test-step-item">
                      <div className="step-item-title">
                        {st.status === 'success' ? (
                          <CheckCircle2 size={15} className="step-icon-success" />
                        ) : (
                          <XCircle size={15} className="step-icon-error" />
                        )}
                        <span>
                          Step {i + 1}: <strong>{st.actionType}</strong>
                        </span>
                      </div>
                      {st.output && (
                        <pre className="step-output-json">{JSON.stringify(st.output, null, 2)}</pre>
                      )}
                      {st.error && <p className="step-error-msg">{st.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Visual Workflow Builder Canvas */}
      {showVisualBuilder && (
        <VisualWorkflowBuilder
          workflow={editingWorkflow}
          onClose={() => {
            setShowVisualBuilder(false);
            setEditingWorkflow(null);
          }}
          onSaved={saved => {
            loadWorkflows();
            setEditingWorkflow(saved);
          }}
          sessions={sessions}
        />
      )}
    </div>
  );
}
