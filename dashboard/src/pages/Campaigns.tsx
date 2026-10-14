import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Megaphone,
  Clock,
  Calendar,
  Pause,
  XCircle,
  Plus,
  AlertCircle,
  Play,
  Users,
  Send,
  CheckCircle2,
  Search,
  Copy,
  Phone,
} from 'lucide-react';
import {
  campaignApi,
  scheduledMessageApi,
  sessionApi,
  templateApi,
  type Campaign,
  type ScheduledMessage,
  type Session,
  type MessageTemplate,
} from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useRole } from '../hooks/useRole';
import { useToast } from '../components/Toast';
import './Campaigns.css';

export function Campaigns() {
  const { t } = useTranslation();
  const { isAdmin, canWrite } = useRole();
  const toast = useToast();
  const [tab, setTab] = useState<'campaigns' | 'scheduled'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Sessions for the create-form dropdowns
  const [sessions, setSessions] = useState<Session[]>([]);

  // Create Campaign modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [campaignSessionId, setCampaignSessionId] = useState('');
  const [campaignMessageContent, setCampaignMessageContent] = useState('');
  const [campaignRate, setCampaignRate] = useState(10);
  const [sessionTemplates, setSessionTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [campaignRecipientsText, setCampaignRecipientsText] = useState('');

  // Starting campaign state
  const [startingCampaignId, setStartingCampaignId] = useState<string | null>(null);

  // Recipients modal state for existing campaign
  const [recipientModalCampaign, setRecipientModalCampaign] = useState<Campaign | null>(null);
  const [recipientsList, setRecipientsList] = useState<
    Array<{ id: string; chatId: string; status: string; sentAt?: string; errorMessage?: string }>
  >([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [newRecipientsInput, setNewRecipientsInput] = useState('');
  const [addingRecipients, setAddingRecipients] = useState(false);
  const [recipientsSearch, setRecipientsSearch] = useState('');
  const [recipientsFilter, setRecipientsFilter] = useState<'all' | 'pending' | 'sent' | 'failed'>('all');
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);

  // Schedule Message modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleSessionId, setScheduleSessionId] = useState('');
  const [scheduleChatId, setScheduleChatId] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');

  // Load sessions for form dropdowns
  useEffect(() => {
    sessionApi
      .list()
      .then(sess => {
        setSessions(sess);
        if (sess.length > 0) {
          setCampaignSessionId(prev => prev || sess[0].id);
          setScheduleSessionId(prev => prev || sess[0].id);
        }
      })
      .catch(() => setSessions([]));
  }, []);

  // Fetch templates when session changes in create modal
  useEffect(() => {
    if (!campaignSessionId) {
      setSessionTemplates([]);
      return;
    }
    templateApi
      .list(campaignSessionId)
      .then(setSessionTemplates)
      .catch(() => setSessionTemplates([]));
  }, [campaignSessionId]);

  const loadData = () => {
    setLoading(true);
    if (tab === 'campaigns') {
      campaignApi
        .list({ limit: 50 })
        .then(setCampaigns)
        .catch(err => {
          toast.error(t('common.error', 'Error'), err?.message || 'Failed to load campaigns');
          setCampaigns([]);
        })
        .finally(() => setLoading(false));
    } else {
      scheduledMessageApi
        .list({ limit: 50 })
        .then(setScheduled)
        .catch(err => {
          toast.error(t('common.error', 'Error'), err?.message || 'Failed to load scheduled messages');
          setScheduled([]);
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = sessionTemplates.find(t => t.id === templateId);
    if (tpl) {
      const parts: string[] = [];
      if (tpl.header) parts.push(tpl.header);
      if (tpl.body) parts.push(tpl.body);
      if (tpl.footer) parts.push(tpl.footer);
      setCampaignMessageContent(parts.join('\n\n'));
    }
  };

  const handlePause = async (id: string) => {
    try {
      await campaignApi.pause(id);
      toast.info(t('campaigns.paused', 'Campaign Paused'), t('campaigns.pausedDesc', 'Campaign delivery has been paused.'));
      loadData();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to pause campaign');
    }
  };

  const handleStartCampaign = async (c: Campaign) => {
    if (c.totalRecipients === 0) {
      openRecipientsModal(c);
      toast.info('Add Recipients', 'Please add recipient phone numbers before sending.');
      return;
    }

    try {
      setStartingCampaignId(c.id);
      await campaignApi.start(c.id);
      toast.success(
        t('campaigns.started', 'Campaign Started'),
        t('campaigns.startedDesc', 'Messages are being sent via WhatsApp.'),
      );
      loadData();
      if (recipientModalCampaign?.id === c.id) {
        setRecipientModalCampaign(null);
      }
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to start campaign');
    } finally {
      setStartingCampaignId(null);
    }
  };

  const openRecipientsModal = (camp: Campaign) => {
    setRecipientModalCampaign(camp);
    setRecipientsSearch('');
    setRecipientsFilter('all');
    setNewRecipientsInput('');
    setCopiedChatId(null);
    loadRecipients(camp.id);
  };

  const handleCopyChatId = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedChatId(phone);
    toast.info(t('common.copied', 'Copied'), phone);
    setTimeout(() => setCopiedChatId(null), 2000);
  };

  const loadRecipients = (campId: string) => {
    setLoadingRecipients(true);
    campaignApi
      .getRecipients(campId)
      .then(setRecipientsList)
      .catch(() => setRecipientsList([]))
      .finally(() => setLoadingRecipients(false));
  };

  const handleAddRecipientsToCampaign = async () => {
    if (!recipientModalCampaign || !newRecipientsInput.trim()) return;
    const rawNumbers = newRecipientsInput
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (rawNumbers.length === 0) return;

    try {
      setAddingRecipients(true);
      const res = await campaignApi.addRecipients(recipientModalCampaign.id, rawNumbers);
      toast.success(
        t('campaigns.recipientsAdded', 'Recipients Added'),
        `${res.added} recipient(s) added to campaign.`,
      );
      setNewRecipientsInput('');
      setRecipientModalCampaign(prev =>
        prev ? { ...prev, totalRecipients: prev.totalRecipients + res.added } : null,
      );
      loadRecipients(recipientModalCampaign.id);
      loadData();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to add recipients');
    } finally {
      setAddingRecipients(false);
    }
  };

  const handleCancelCampaign = async (id: string) => {
    if (!window.confirm(t('campaigns.confirmCancel', 'Are you sure you want to cancel this campaign?'))) return;
    try {
      await campaignApi.cancel(id);
      toast.success(t('campaigns.cancelled', 'Campaign Cancelled'), t('campaigns.cancelledDesc', 'Campaign was cancelled.'));
      loadData();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to cancel campaign');
    }
  };

  const handleCancelScheduled = async (id: string) => {
    if (!window.confirm(t('campaigns.confirmCancelScheduled', 'Cancel this scheduled message?'))) return;
    try {
      await scheduledMessageApi.cancel(id);
      toast.success(t('campaigns.cancelled', 'Message Cancelled'), t('campaigns.cancelledDesc', 'Scheduled message was cancelled.'));
      loadData();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to cancel scheduled message');
    }
  };

  const handleCreateCampaign = async () => {
    if (!campaignName.trim() || !campaignMessageContent.trim() || !campaignSessionId) return;
    try {
      setCreating(true);
      const camp = await campaignApi.create({
        name: campaignName.trim(),
        description: campaignDescription.trim() || null,
        sessionId: campaignSessionId,
        templateId: selectedTemplateId || null,
        messageContent: campaignMessageContent.trim(),
        ratePerMinute: campaignRate,
      });

      // Parse and add recipients if provided
      const rawNumbers = campaignRecipientsText
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(Boolean);

      if (rawNumbers.length > 0) {
        await campaignApi.addRecipients(camp.id, rawNumbers);
      }

      toast.success(t('campaigns.created', 'Campaign Created'), t('campaigns.createdDesc', 'New campaign created successfully.'));
      setCampaignName('');
      setCampaignDescription('');
      setSelectedTemplateId('');
      setCampaignMessageContent('');
      setCampaignRecipientsText('');
      setCampaignRate(10);
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  const handleScheduleMessage = async () => {
    if (!scheduleSessionId || !scheduleChatId.trim() || !scheduleMessage.trim() || !scheduleAt) return;
    try {
      setScheduling(true);
      await scheduledMessageApi.create({
        sessionId: scheduleSessionId,
        chatId: scheduleChatId.trim(),
        content: scheduleMessage.trim(),
        scheduledAt: new Date(scheduleAt).toISOString(),
      });
      toast.success(t('campaigns.scheduledSuccess', 'Message Scheduled'), t('campaigns.scheduledSuccessDesc', 'Message will be delivered at the scheduled time.'));
      setScheduleChatId('');
      setScheduleMessage('');
      setScheduleAt('');
      setShowScheduleModal(false);
      loadData();
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to schedule message');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="campaigns-page page-container">
      <PageHeader
        title={t('campaigns.title', 'Campaigns')}
        subtitle={t('campaigns.subtitle', 'Manage campaigns and scheduled messages')}
        actions={
          (isAdmin || canWrite) && (
            <>
              {tab === 'campaigns' && (
                <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                  <Plus size={18} />
                  {t('campaigns.createCampaign', 'Create Campaign')}
                </button>
              )}
              {tab === 'scheduled' && (
                <button className="btn-primary" onClick={() => setShowScheduleModal(true)}>
                  <Plus size={18} />
                  {t('campaigns.scheduleMessage', 'Schedule Message')}
                </button>
              )}
            </>
          )
        }
      />

      <div className="campaigns-nav-tabs">
        <button
          className={`btn btn-sm ${tab === 'campaigns' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('campaigns')}
        >
          <Megaphone size={16} />
          <span style={{ marginLeft: 4 }}>{t('campaigns.campaigns', 'Campaigns')}</span>
        </button>
        <button
          className={`btn btn-sm ${tab === 'scheduled' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('scheduled')}
        >
          <Clock size={16} />
          <span style={{ marginLeft: 4 }}>{t('campaigns.scheduled', 'Scheduled Messages')}</span>
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : tab === 'campaigns' ? (
        campaigns.length === 0 ? (
          <div className="empty-state">
            <Megaphone size={48} strokeWidth={1} />
            <p>{t('campaigns.emptyCampaigns', 'No campaigns created')}</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.name', 'Name')}</th>
                  <th>{t('common.status', 'Status')}</th>
                  <th>{t('campaigns.recipients', 'Recipients')}</th>
                  <th>{t('campaigns.progress', 'Progress')}</th>
                  <th>{t('campaigns.scheduledAt', 'Scheduled')}</th>
                  {(isAdmin || canWrite) && <th>{t('common.actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="campaign-title">{c.name}</div>
                      {c.description && <div className="campaign-desc">{c.description}</div>}
                    </td>
                    <td>
                      <span className={`campaign-badge ${c.status}`}>{c.status}</span>
                    </td>
                    <td>{c.totalRecipients}</td>
                    <td>
                      {c.sentCount}/{c.totalRecipients}
                      {c.failedCount > 0 && (
                        <span style={{ color: 'var(--color-danger, #ef4444)', marginLeft: 4 }}>
                          ({c.failedCount} failed)
                        </span>
                      )}
                    </td>
                    <td>{c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : '—'}</td>
                    {(isAdmin || canWrite) && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {['draft', 'paused', 'scheduled'].includes(c.status) && (
                            <button
                              className="btn-icon btn-ghost"
                              style={{ color: '#10b981' }}
                              title="Start / Send Campaign"
                              disabled={startingCampaignId === c.id}
                              onClick={() => void handleStartCampaign(c)}
                            >
                              {startingCampaignId === c.id ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                <Play size={16} />
                              )}
                            </button>
                          )}
                          <button
                            className="btn-icon btn-ghost"
                            title="Manage Recipients"
                            onClick={() => openRecipientsModal(c)}
                          >
                            <Users size={16} />
                          </button>
                          {c.status === 'running' && (
                            <button
                              className="btn-icon btn-ghost"
                              title="Pause"
                              onClick={() => void handlePause(c.id)}
                            >
                              <Pause size={16} />
                            </button>
                          )}
                          {['draft', 'scheduled', 'paused'].includes(c.status) && (
                            <button
                              className="btn-icon btn-ghost btn-danger"
                              title="Cancel"
                              onClick={() => void handleCancelCampaign(c.id)}
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : scheduled.length === 0 ? (
        <div className="empty-state">
          <Calendar size={48} strokeWidth={1} />
          <p>{t('campaigns.emptyScheduled', 'No scheduled messages')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('campaigns.chatId', 'Chat')}</th>
                <th>{t('common.status', 'Status')}</th>
                <th>{t('campaigns.content', 'Content')}</th>
                <th>{t('campaigns.scheduledAt', 'Scheduled')}</th>
                {(isAdmin || canWrite) && <th>{t('common.actions', 'Actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {scheduled.map(msg => (
                <tr key={msg.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{msg.chatId}</td>
                  <td>
                    <span className={`campaign-badge ${msg.status}`}>{msg.status}</span>
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.content}
                  </td>
                  <td>{new Date(msg.scheduledAt).toLocaleString()}</td>
                  {(isAdmin || canWrite) && (
                    <td>
                      {msg.status === 'pending' && (
                        <button
                          className="btn-icon btn-ghost btn-danger"
                          title="Cancel"
                          onClick={() => void handleCancelScheduled(msg.id)}
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => setShowCreateModal(false)}
          title={t('campaigns.createCampaign', 'Create Campaign')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateCampaign}
                disabled={creating || !campaignName.trim() || !campaignMessageContent.trim() || !campaignSessionId}
              >
                {creating ? <Loader2 className="animate-spin" size={16} /> : t('common.create', 'Create')}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {sessions.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d97706', fontSize: '0.875rem' }}>
                <AlertCircle size={16} />
                <span>{t('campaigns.noSessionsWarning', 'No WhatsApp sessions found. Please connect a session in the Sessions tab first.')}</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{t('common.name', 'Name')} *</label>
              <input
                className="form-input"
                type="text"
                placeholder={t('campaigns.namePlaceholder', 'Campaign name')}
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('common.description', 'Description')}</label>
              <textarea
                className="form-textarea"
                placeholder={t('campaigns.descriptionPlaceholder', 'Optional description')}
                value={campaignDescription}
                onChange={e => setCampaignDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('common.session', 'Session')} *</label>
              <select className="form-select" value={campaignSessionId} onChange={e => setCampaignSessionId(e.target.value)}>
                <option value="">{t('campaigns.selectSession', 'Select a session')}</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
            {sessionTemplates.length > 0 && (
              <div className="form-group">
                <label className="form-label">{t('templates.title', 'Message Template')} (Optional)</label>
                <select
                  className="form-select"
                  value={selectedTemplateId}
                  onChange={e => handleSelectTemplate(e.target.value)}
                >
                  <option value="">-- Choose a saved template or write custom --</option>
                  {sessionTemplates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{t('campaigns.messageContent', 'Message Content')} *</label>
              <textarea
                className="form-textarea"
                placeholder={t('campaigns.messageContentPlaceholder', 'The message text to send')}
                value={campaignMessageContent}
                onChange={e => setCampaignMessageContent(e.target.value)}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                {t('campaigns.recipients', 'Recipients')} (Phone Numbers)
              </label>
              <textarea
                className="form-textarea"
                placeholder="Enter numbers separated by comma or new line (e.g. 919227102108, 919876543210)"
                value={campaignRecipientsText}
                onChange={e => setCampaignRecipientsText(e.target.value)}
                rows={3}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-muted, #6b7280)' }}>
                You can also add or import recipients after creating the campaign.
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">{t('campaigns.ratePerMinute', 'Rate Per Minute')}</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={60}
                value={campaignRate}
                onChange={e => setCampaignRate(Number(e.target.value))}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Schedule Message Modal */}
      {showScheduleModal && (
        <Modal
          open
          onClose={() => setShowScheduleModal(false)}
          title={t('campaigns.scheduleMessage', 'Schedule Message')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowScheduleModal(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleScheduleMessage}
                disabled={scheduling || !scheduleSessionId || !scheduleChatId.trim() || !scheduleMessage.trim() || !scheduleAt}
              >
                {scheduling ? <Loader2 className="animate-spin" size={16} /> : t('common.schedule', 'Schedule')}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div className="form-group">
              <label className="form-label">{t('common.session', 'Session')} *</label>
              <select className="form-select" value={scheduleSessionId} onChange={e => setScheduleSessionId(e.target.value)}>
                <option value="">{t('campaigns.selectSession', 'Select a session')}</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('campaigns.chatId', 'Chat ID / Phone')} *</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. 919227102108@c.us"
                value={scheduleChatId}
                onChange={e => setScheduleChatId(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('campaigns.messageLabel', 'Message')} *</label>
              <textarea
                className="form-textarea"
                placeholder={t('campaigns.messagePlaceholder', 'Message to send')}
                value={scheduleMessage}
                onChange={e => setScheduleMessage(e.target.value)}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('campaigns.scheduledAt', 'Scheduled At')} *</label>
              <input className="form-input" type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* Manage Recipients Modal */}
      {recipientModalCampaign && (() => {
        const detectedNumbers = newRecipientsInput
          .split(/[\n,;]+/)
          .map(s => s.trim())
          .filter(Boolean);
        const detectedCount = detectedNumbers.length;

        const totalCount = recipientModalCampaign.totalRecipients || recipientsList.length;
        const sentCount = recipientModalCampaign.sentCount || recipientsList.filter(r => r.status === 'sent').length;
        const failedCount = recipientModalCampaign.failedCount || recipientsList.filter(r => r.status === 'failed').length;
        const pendingCount = recipientsList.length > 0
          ? recipientsList.filter(r => r.status === 'pending').length
          : Math.max(0, totalCount - sentCount - failedCount);
        const progressPercent = totalCount > 0 ? Math.min(100, Math.round((sentCount / totalCount) * 100)) : 0;

        const filteredRecipients = recipientsList.filter(r => {
          const cleanPhone = r.chatId.replace(/@c\.us$/, '');
          const matchesSearch =
            recipientsSearch.trim() === '' ||
            r.chatId.toLowerCase().includes(recipientsSearch.trim().toLowerCase()) ||
            cleanPhone.includes(recipientsSearch.trim());
          const matchesFilter =
            recipientsFilter === 'all' || r.status.toLowerCase() === recipientsFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <Modal
            open
            className="recipients-modal-dialog"
            onClose={() => setRecipientModalCampaign(null)}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={20} style={{ color: '#25d366' }} />
                  <span>Recipients: {recipientModalCampaign.name}</span>
                </div>
                <span className={`campaign-badge ${recipientModalCampaign.status}`}>
                  {recipientModalCampaign.status}
                </span>
              </div>
            }
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  {['draft', 'paused', 'scheduled'].includes(recipientModalCampaign.status) && (
                    <button
                      className="btn-send-whatsapp"
                      onClick={() => void handleStartCampaign(recipientModalCampaign)}
                      disabled={
                        startingCampaignId === recipientModalCampaign.id ||
                        (totalCount === 0 && recipientsList.length === 0)
                      }
                    >
                      {startingCampaignId === recipientModalCampaign.id ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Sending WhatsApp Campaign...</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          <span>
                            Send Campaign Now {pendingCount > 0 ? `(${pendingCount})` : totalCount > 0 ? `(${totalCount})` : ''}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                  {recipientModalCampaign.status === 'running' && (
                    <button
                      className="btn-secondary"
                      onClick={() => void handlePause(recipientModalCampaign.id)}
                    >
                      <Pause size={16} />
                      <span style={{ marginLeft: 6 }}>Pause Campaign</span>
                    </button>
                  )}
                </div>
                <button className="btn-secondary" onClick={() => setRecipientModalCampaign(null)}>
                  {t('common.close', 'Close')}
                </button>
              </div>
            }
          >
            <div className="recipients-modal-body">
              {/* Overview KPI Cards + Progress */}
              <div className="recipients-overview-card">
                <div className="recipients-stats-grid">
                  <div className="stat-kpi-card total">
                    <div className="stat-kpi-icon">
                      <Users size={18} />
                    </div>
                    <div className="stat-kpi-info">
                      <span className="stat-kpi-value">{totalCount}</span>
                      <span className="stat-kpi-label">Total</span>
                    </div>
                  </div>

                  <div className="stat-kpi-card sent">
                    <div className="stat-kpi-icon">
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="stat-kpi-info">
                      <span className="stat-kpi-value">{sentCount}</span>
                      <span className="stat-kpi-label">Sent</span>
                    </div>
                  </div>

                  <div className="stat-kpi-card pending">
                    <div className="stat-kpi-icon">
                      <Clock size={18} />
                    </div>
                    <div className="stat-kpi-info">
                      <span className="stat-kpi-value">{pendingCount}</span>
                      <span className="stat-kpi-label">Pending</span>
                    </div>
                  </div>

                  <div className="stat-kpi-card failed">
                    <div className="stat-kpi-icon">
                      <AlertCircle size={18} />
                    </div>
                    <div className="stat-kpi-info">
                      <span className="stat-kpi-value">{failedCount}</span>
                      <span className="stat-kpi-label">Failed</span>
                    </div>
                  </div>
                </div>

                <div className="recipients-progress-section">
                  <div className="recipients-progress-header">
                    <span>Delivery Progress</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="recipients-progress-track">
                    <div
                      className="recipients-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Add Recipients Card */}
              {['draft', 'paused', 'scheduled'].includes(recipientModalCampaign.status) && (
                <div className="recipients-add-card">
                  <div className="recipients-add-header">
                    <div className="recipients-add-title">
                      <Phone size={16} style={{ color: '#25d366' }} />
                      <span>Add WhatsApp Phone Numbers</span>
                    </div>
                    {detectedCount > 0 && (
                      <span className="detected-badge">
                        ✨ {detectedCount} {detectedCount === 1 ? 'number' : 'numbers'} detected
                      </span>
                    )}
                  </div>

                  <textarea
                    className="recipients-textarea"
                    placeholder="Enter phone numbers separated by comma, space or new line (e.g. 919227102108, 919876543210)"
                    value={newRecipientsInput}
                    onChange={e => setNewRecipientsInput(e.target.value)}
                    rows={3}
                  />

                  <div className="recipients-add-actions">
                    <span className="recipients-helper-text">
                      Include country code (e.g. 91 for India). Formatting will be normalized automatically.
                    </span>
                    <button
                      className="btn-primary btn-sm"
                      onClick={handleAddRecipientsToCampaign}
                      disabled={addingRecipients || detectedCount === 0}
                    >
                      {addingRecipients ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Plus size={14} />
                      )}
                      <span style={{ marginLeft: 4 }}>
                        Add {detectedCount > 0 ? `(${detectedCount})` : ''}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Recipients List & Filter Section */}
              <div className="recipients-list-section">
                <div className="recipients-list-controls">
                  <div className="recipients-search-wrapper">
                    <Search size={15} className="recipients-search-icon" />
                    <input
                      type="text"
                      className="recipients-search-input"
                      placeholder="Search phone number..."
                      value={recipientsSearch}
                      onChange={e => setRecipientsSearch(e.target.value)}
                    />
                  </div>

                  <div className="recipients-filter-pills">
                    {(['all', 'pending', 'sent', 'failed'] as const).map(fKey => {
                      const count =
                        fKey === 'all'
                          ? recipientsList.length
                          : recipientsList.filter(r => r.status.toLowerCase() === fKey).length;
                      return (
                        <button
                          key={fKey}
                          type="button"
                          className={`filter-pill-btn ${recipientsFilter === fKey ? 'active' : ''}`}
                          onClick={() => setRecipientsFilter(fKey)}
                        >
                          {fKey.charAt(0).toUpperCase() + fKey.slice(1)} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {loadingRecipients ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2.5rem',
                      gap: '0.5rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: '0.85rem' }}>Loading recipients...</span>
                  </div>
                ) : filteredRecipients.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2rem',
                      textAlign: 'center',
                      gap: '0.5rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Users size={28} style={{ opacity: 0.4 }} />
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {recipientsList.length === 0
                        ? 'No recipients added yet'
                        : 'No matching recipients found'}
                    </div>
                    <div style={{ fontSize: '0.75rem', maxWidth: 320 }}>
                      {recipientsList.length === 0
                        ? 'Add phone numbers in the input box above to send messages.'
                        : 'Try searching with another number or change the filter tab.'}
                    </div>
                  </div>
                ) : (
                  <div className="recipients-table-scroll">
                    <table className="recipients-table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>#</th>
                          <th>WhatsApp Contact</th>
                          <th>Status</th>
                          <th>Delivered At</th>
                          <th style={{ width: 40, textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecipients.map((r, idx) => {
                          const cleanNumber = r.chatId.replace(/@c\.us$/, '');
                          const isCopied = copiedChatId === cleanNumber;
                          return (
                            <tr key={r.id}>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {idx + 1}
                              </td>
                              <td>
                                <div className="recipients-phone-cell">
                                  <Phone size={13} style={{ color: '#25d366', opacity: 0.8 }} />
                                  <span>+{cleanNumber}</span>
                                </div>
                              </td>
                              <td>
                                <span className={`recipient-status-badge ${r.status}`}>
                                  {r.status === 'sent' && <CheckCircle2 size={11} />}
                                  {r.status === 'pending' && <Clock size={11} />}
                                  {r.status === 'failed' && <AlertCircle size={11} />}
                                  {r.status}
                                </span>
                                {r.errorMessage && (
                                  <div style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: 2 }}>
                                    {r.errorMessage}
                                  </div>
                                )}
                              </td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                {r.sentAt
                                  ? new Date(r.sentAt).toLocaleString([], {
                                      dateStyle: 'short',
                                      timeStyle: 'short',
                                    })
                                  : '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  title={isCopied ? 'Copied!' : 'Copy number'}
                                  onClick={() => handleCopyChatId(cleanNumber)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    color: isCopied ? '#25d366' : 'var(--text-muted)',
                                    borderRadius: 4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Copy size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
