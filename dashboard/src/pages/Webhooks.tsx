import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Edit,
  Trash2,
  Play,
  ExternalLink,
  Loader2,
  X,
  Webhook as WebhookIcon,
  Check,
  AlertTriangle,
  AlertCircle,
  Filter,
  Copy,
  RefreshCw,
} from 'lucide-react';
import {
  webhookApi,
  webhookTestApi,
  getWebhookTestUrl,
  type Webhook,
  type WebhookFilters,
  type WebhookFilterCondition,
  type CapturedWebhookRequest,
} from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import {
  useWebhooksQuery,
  useSessionsQuery,
  useSessionChatsQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { FilterBuilder } from '../components/FilterBuilder';
import { Modal } from '../components/Modal';
import './Webhooks.css';

// Filters only apply to message.* events (the wildcard subscribes to them too).
const supportsFilters = (events: string[]) => events.some(e => e === '*' || e.startsWith('message.'));

type TFn = ReturnType<typeof useTranslation>['t'];

// One-line, human-readable summary of a condition for the badge popover, reusing the FilterBuilder labels.
function conditionSummary(c: WebhookFilterCondition, t: TFn): string {
  const field = t(`webhooks.filters.fields.${c.field}`, { defaultValue: c.field });
  const operator = t(`webhooks.filters.operators.${c.operator}`, { defaultValue: c.operator });
  let value: string;
  if (typeof c.value === 'boolean') {
    value = c.value ? t('webhooks.filters.yes') : t('webhooks.filters.no');
  } else if (Array.isArray(c.value)) {
    value = c.value.join(', ');
  } else {
    value = `"${c.value}"`;
  }
  const caseNote = c.caseSensitive ? ` · ${t('webhooks.filters.caseSensitive')}` : '';
  return `${field} ${operator} ${value}${caseNote}`;
}

// Filters badge with a hover/focus popover listing the configured conditions. The popover is
// fixed-positioned from the badge's rect so the card's `overflow: hidden` doesn't clip it.
function FilterBadge({ filters }: { filters: WebhookFilters }) {
  const { t } = useTranslation();
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const openAt = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 6, left: r.left });
  };
  const close = () => setCoords(null);

  return (
    <span
      className="filter-badge filter-badge-interactive"
      tabIndex={0}
      onMouseEnter={e => openAt(e.currentTarget)}
      onMouseLeave={close}
      onFocus={e => openAt(e.currentTarget)}
      onBlur={close}
    >
      <Filter size={12} />
      {t('webhooks.filters.badge', { count: filters.conditions.length })}
      {coords && (
        <div className="filter-popover" style={{ top: coords.top, left: coords.left }} role="tooltip">
          <div className="filter-popover-title">{t('webhooks.filters.title')}</div>
          {filters.conditions.map((condition, i) => (
            <div key={i} className="filter-popover-row">
              {conditionSummary(condition, t)}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// Must stay aligned with the backend WEBHOOK_EVENTS: the API now rejects unknown
// event names, so offering e.g. the never-emitted 'session.connected' would 400 on save.
const availableEventNames = [
  'message.received',
  'message.sent',
  'message.ack',
  'message.failed',
  'message.revoked',
  'message.reaction',
  'message.edited',
  'session.status',
  'session.qr',
  'session.authenticated',
  'session.disconnected',
  'session.reconnect_loop',
  'group.join',
  'group.leave',
  'group.update',
  'call.received',
  'status.received',
  '*',
] as const;

export function Webhooks() {
  const { t } = useTranslation();
  useDocumentTitle(t('webhooks.title'));
  const { canWrite } = useRole();
  const { data: webhooks = [], isLoading: loadingWebhooks, isError: webhooksError } = useWebhooksQuery();
  const { data: sessions = [] } = useSessionsQuery();
  const loading = loadingWebhooks;
  const createMutation = useCreateWebhookMutation();
  const updateMutation = useUpdateWebhookMutation();
  const deleteMutation = useDeleteWebhookMutation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; id: string; url: string } | null>(null);
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [newWebhook, setNewWebhook] = useState<{
    url: string;
    events: string[];
    sessionId: string;
    filters: WebhookFilters | null;
  }>({ url: '', events: ['message.received'], sessionId: '', filters: null });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const defaultTestUrl = getWebhookTestUrl('echo');

  // Webhook Test Receiver Modal & Logs
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [capturedLogs, setCapturedLogs] = useState<CapturedWebhookRequest[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadCapturedLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await webhookTestApi.getRequests();
      setCapturedLogs(res.requests || []);
      setShowLogsModal(true);
    } catch {
      setToast({ type: 'error', message: 'Failed to load captured webhook requests' });
    } finally {
      setLoadingLogs(false);
    }
  };

  const clearCapturedLogs = async () => {
    try {
      await webhookTestApi.clearRequests();
      setCapturedLogs([]);
      setToast({ type: 'success', message: 'Cleared captured webhook test logs' });
    } catch {
      setToast({ type: 'error', message: 'Failed to clear logs' });
    }
  };

  // Single source for the contact/group autocomplete in whichever modal is open.
  const activeSessionId = showEditModal ? editWebhook?.sessionId ?? '' : newWebhook.sessionId;
  const { data: chats = [] } = useSessionChatsQuery(activeSessionId, showCreateModal || showEditModal);

  const eventDescription = (name: string) => {
    if (name === '*') return t('webhooks.eventDescriptions.all');
    return t(`webhooks.eventDescriptions.${name}`, { defaultValue: name });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleCreate = async () => {
    if (!newWebhook.url || !newWebhook.sessionId) return;
    try {
      await createMutation.mutateAsync({
        sessionId: newWebhook.sessionId,
        url: newWebhook.url,
        events: newWebhook.events,
        // Don't persist message-filters when no message events are selected (the filter UI is hidden).
        filters: supportsFilters(newWebhook.events) ? newWebhook.filters : null,
      });
      setShowCreateModal(false);
      setNewWebhook({ url: '', events: ['message.received'], sessionId: '', filters: null });
      setToast({ type: 'success', message: t('webhooks.toasts.created') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.toasts.createFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const confirmDelete = (sessionId: string, id: string, url: string) => {
    setDeleteTarget({ sessionId, id, url });
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ sessionId: deleteTarget.sessionId, id: deleteTarget.id });
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setToast({ type: 'success', message: t('webhooks.toasts.deleted') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const handleTest = async (sessionId: string, id: string) => {
    setTestingId(id);
    try {
      const result = await webhookApi.test(sessionId, id);
      if (result.success) {
        setToast({ type: 'success', message: t('webhooks.toasts.testOk', { status: result.statusCode }) });
      } else {
        setToast({
          type: 'error',
          message: t('webhooks.toasts.testFailed', { message: result.error || `Status ${result.statusCode}` }),
        });
      }
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.toasts.testError', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    } finally {
      setTestingId(null);
    }
  };

  const openEdit = (webhook: Webhook) => {
    setEditWebhook({ ...webhook });
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!editWebhook) return;
    try {
      await updateMutation.mutateAsync({
        sessionId: editWebhook.sessionId,
        id: editWebhook.id,
        data: {
          url: editWebhook.url,
          events: editWebhook.events,
          active: editWebhook.active,
          // Clear message-filters if the edit removed all message events (the filter UI is hidden then).
          filters: supportsFilters(editWebhook.events) ? (editWebhook.filters ?? null) : null,
        },
      });
      setShowEditModal(false);
      setEditWebhook(null);
      setToast({ type: 'success', message: t('webhooks.toasts.updated') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.toasts.updateFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const toggleEditEvent = (event: string) => {
    if (!editWebhook) return;
    setEditWebhook({
      ...editWebhook,
      events: editWebhook.events.includes(event)
        ? editWebhook.events.filter(e => e !== event)
        : [...editWebhook.events, event],
    });
  };

  const toggleNewEvent = (event: string) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter(e => e !== event) : [...prev.events, event],
    }));
  };

  if (loading) {
    return (
      <div
        className="webhooks-page"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="webhooks-page">
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <PageHeader
        title={t('webhooks.title')}
        subtitle={t('webhooks.subtitle')}
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              {t('webhooks.addWebhook')}
            </button>
          )
        }
      />

      {/* Built-in Webhook Testing Endpoint Banner */}
      <div className="webhook-test-endpoint-banner">
        <div className="webhook-test-endpoint-info">
          <span className="webhook-test-endpoint-badge">
            <WebhookIcon size={14} /> Built-in Webhook Testing Receiver
          </span>
          <span className="webhook-test-endpoint-desc">
            Use this local endpoint to receive, test, and debug webhooks without needing external services like webhook.site:
          </span>
          <code className="webhook-test-endpoint-url">
            {defaultTestUrl}
          </code>
        </div>
        <div className="webhook-test-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              navigator.clipboard.writeText(defaultTestUrl);
              setToast({ type: 'success', message: 'Test webhook URL copied to clipboard!' });
            }}
          >
            <Copy size={14} /> Copy URL
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={loadCapturedLogs}
            disabled={loadingLogs}
          >
            {loadingLogs ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            View Received Calls
          </button>
        </div>
      </div>

      {webhooksError && (
        <div className="error-banner" role="alert">
          <AlertCircle size={20} />
          <span className="error-banner-text">{t('dashboard.loadError')}</span>
        </div>
      )}

      {showCreateModal && (
        <Modal
          open
          onClose={() => setShowCreateModal(false)}
          title={t('webhooks.createTitle')}
          closeLabel={t('common.close')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleCreate}>
                {t('common.create')}
              </button>
            </>
          }
        >
          <label>{t('webhooks.session')}</label>
          <select
            value={newWebhook.sessionId}
            onChange={e => setNewWebhook({ ...newWebhook, sessionId: e.target.value })}
          >
            <option value="">{t('webhooks.selectSession')}</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label style={{ margin: 0 }}>{t('common.url')}</label>
            <button
              type="button"
              className="btn-test-quick"
              onClick={() =>
                setNewWebhook(prev => ({
                  ...prev,
                  url: getWebhookTestUrl(prev.sessionId ? `receiver/${prev.sessionId}` : 'echo'),
                }))
              }
            >
              ⚡ Use Local Test Endpoint
            </button>
          </div>
          <input
            type="url"
            placeholder={`https://... or ${defaultTestUrl}`}
            value={newWebhook.url}
            onChange={e => setNewWebhook({ ...newWebhook, url: e.target.value })}
          />
          <label>{t('webhooks.events')}</label>
          <div className="event-tags">
            {availableEventNames.map(name => {
              const isSelected = newWebhook.events.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={`event-tag ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleNewEvent(name)}
                >
                  {isSelected && <Check size={12} className="tag-check-icon" />}
                  {name}
                </button>
              );
            })}
          </div>
          {supportsFilters(newWebhook.events) && (
            <FilterBuilder
              filters={newWebhook.filters}
              onChange={filters => setNewWebhook(prev => ({ ...prev, filters }))}
              chats={chats}
            />
          )}
        </Modal>
      )}

      {showEditModal && editWebhook && (
        <Modal
          open
          onClose={() => setShowEditModal(false)}
          title={t('webhooks.editTitle')}
          closeLabel={t('common.close')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleEdit}>
                {t('webhooks.saveChanges')}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label style={{ margin: 0 }}>{t('common.url')}</label>
            <button
              type="button"
              className="btn-test-quick"
              onClick={() =>
                setEditWebhook(prev =>
                  prev
                    ? {
                        ...prev,
                        url: getWebhookTestUrl(prev.sessionId ? `receiver/${prev.sessionId}` : 'echo'),
                      }
                    : null,
                )
              }
            >
              ⚡ Use Local Test Endpoint
            </button>
          </div>
          <input
            type="url"
            placeholder={`https://... or ${defaultTestUrl}`}
            value={editWebhook.url}
            onChange={e => setEditWebhook({ ...editWebhook, url: e.target.value })}
          />
          <label>{t('webhooks.events')}</label>
          <div className="event-tags">
            {availableEventNames.map(name => {
              const isSelected = editWebhook.events.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={`event-tag ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleEditEvent(name)}
                >
                  {isSelected && <Check size={12} className="tag-check-icon" />}
                  {name}
                </button>
              );
            })}
          </div>
          {supportsFilters(editWebhook.events) && (
            <FilterBuilder
              filters={editWebhook.filters}
              onChange={filters => setEditWebhook(prev => (prev ? { ...prev, filters } : prev))}
              chats={chats}
            />
          )}
          <div className="toggle-group">
            <span className="toggle-label">{t('common.status')}</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={editWebhook.active}
                onChange={e => setEditWebhook({ ...editWebhook, active: e.target.checked })}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className={`toggle-status ${editWebhook.active ? 'active' : 'inactive'}`}>
              {editWebhook.active ? t('common.active') : t('common.inactive')}
            </span>
          </div>
        </Modal>
      )}

      {showDeleteModal && deleteTarget && (
        <Modal
          open
          onClose={() => setShowDeleteModal(false)}
          title={t('webhooks.deleteTitle')}
          className="modal-sm"
          closeLabel={t('common.close')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-danger" onClick={handleDelete}>
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>{t('webhooks.deleteConfirm')}</p>
          <code
            style={{
              display: 'block',
              marginTop: '0.5rem',
              padding: '0.5rem',
              background: 'var(--color-bg-secondary)',
              borderRadius: '4px',
              fontSize: '0.85rem',
              wordBreak: 'break-all',
            }}
          >
            {deleteTarget.url}
          </code>
        </Modal>
      )}

      <div className="webhooks-content">
        <div className="webhooks-list-container">
          {webhooks.length === 0 ? (
            <div className="empty-table-state">
              <WebhookIcon size={48} strokeWidth={1} />
              <h3>{t('webhooks.empty.title')}</h3>
              <p>{t('webhooks.empty.description')}</p>
            </div>
          ) : (
            <div className="webhooks-card-list">
              {webhooks.map(webhook => {
                const sessionName = sessions.find(s => s.id === webhook.sessionId)?.name || webhook.sessionId.substring(0, 12);
                return (
                  <div key={webhook.id} className="webhook-card">
                    <div className="webhook-card-header">
                      <div className="webhook-url-row">
                        <ExternalLink size={16} className="webhook-url-icon" />
                        <code className="webhook-url">{webhook.url}</code>
                      </div>
                      <div className="webhook-card-actions">
                        <button
                          className="icon-btn"
                          title={t('webhooks.actions.test')}
                          onClick={() => handleTest(webhook.sessionId, webhook.id)}
                          disabled={testingId === webhook.id}
                        >
                          {testingId === webhook.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        </button>
                        {canWrite && (
                          <>
                            <button className="icon-btn" title={t('webhooks.actions.edit')} onClick={() => openEdit(webhook)}>
                              <Edit size={16} />
                            </button>
                            <button
                              className="icon-btn danger"
                              title={t('webhooks.actions.delete')}
                              onClick={() => confirmDelete(webhook.sessionId, webhook.id, webhook.url)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="webhook-card-body">
                      <div className="webhook-meta">
                        <div className="webhook-meta-item">
                          <span className="webhook-meta-label">{t('webhooks.columns.session')}</span>
                          <span className="webhook-meta-value">{sessionName}</span>
                        </div>
                        <div className="webhook-meta-item">
                          <span className="webhook-meta-label">{t('webhooks.columns.status')}</span>
                          <span className={`status-badge ${webhook.active ? 'active' : 'inactive'}`}>
                            {webhook.active ? t('common.active') : t('common.inactive')}
                          </span>
                        </div>
                      </div>
                      <div className="webhook-events">
                        <span className="webhook-meta-label">{t('webhooks.columns.events')}</span>
                        <div className="events-cell">
                          {webhook.events.map((event: string) => (
                            <span key={event} className="event-tag">
                              {event}
                            </span>
                          ))}
                          {webhook.filters?.conditions?.length ? <FilterBadge filters={webhook.filters} /> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="events-reference">
          <h3>{t('webhooks.available')}</h3>
          <div className="events-list">
            {availableEventNames.map(name => (
              <div key={name} className="event-item">
                <code>{name}</code>
                <span>{eventDescription(name)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showLogsModal && (
        <Modal
          open
          onClose={() => setShowLogsModal(false)}
          title="Captured Test Webhooks"
          closeLabel={t('common.close')}
          footer={
            <>
              <button
                className="btn-secondary"
                onClick={clearCapturedLogs}
                disabled={capturedLogs.length === 0}
              >
                <Trash2 size={14} /> Clear History
              </button>
              <button
                className="btn-primary"
                onClick={loadCapturedLogs}
                disabled={loadingLogs}
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </>
          }
        >
          {capturedLogs.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>No webhook requests captured yet.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Send a webhook to <code>{defaultTestUrl}</code> from your session, workflow, or curl to see it here!
              </p>
            </div>
          ) : (
            <div className="captured-logs-list">
              {capturedLogs.map(log => (
                <div key={log.id} className="captured-log-card">
                  <div className="captured-log-top">
                    <span className="captured-log-method method-post">{log.method}</span>
                    <span className="captured-log-time">{new Date(log.receivedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="captured-log-url">{log.url}</div>
                  <pre className="captured-log-body">
                    {typeof log.body === 'object' && log.body !== null
                      ? JSON.stringify(log.body, null, 2)
                      : String(log.body || 'No payload')}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
