import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle, Eye, CheckCheck, Search, UserCheck } from 'lucide-react';
import { conversationApi, type Conversation } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';

const statusColors: Record<string, string> = {
  open: 'var(--color-success)',
  pending: 'var(--color-warning)',
  resolved: 'var(--color-info)',
  closed: 'var(--color-muted)',
};

export function Conversations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const loadConversations = () => {
    setLoading(true);
    conversationApi
      .list({ status: statusFilter || undefined, limit: 100 })
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadConversations();
  }, [statusFilter]);

  const handleMarkRead = async (id: string) => {
    try {
      const updated = await conversationApi.markRead(id);
      setConversations(prev => prev.map(c => (c.id === id ? updated : c)));
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to mark as read');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const updated = await conversationApi.update(id, { status: newStatus });
      setConversations(prev => prev.map(c => (c.id === id ? updated : c)));
      toast.success(t('common.success', 'Success'), `Status updated to ${newStatus}`);
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to update status');
    }
  };

  const handleAssign = async (id: string, currentAssignee: string | null) => {
    const newAssignee = window.prompt(t('conversations.assignPrompt', 'Assign to agent (name/ID):'), currentAssignee || '');
    if (newAssignee === null) return;
    try {
      const updated = await conversationApi.update(id, {
        assignedTo: newAssignee.trim() || undefined,
      });
      setConversations(prev => prev.map(c => (c.id === id ? updated : c)));
      toast.success(t('common.success', 'Success'), 'Assignment updated');
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to assign');
    }
  };

  const filteredConversations = conversations.filter(conv => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      conv.chatId.toLowerCase().includes(term) ||
      (conv.chatName && conv.chatName.toLowerCase().includes(term)) ||
      (conv.lastMessagePreview && conv.lastMessagePreview.toLowerCase().includes(term)) ||
      (conv.assignedTo && conv.assignedTo.toLowerCase().includes(term))
    );
  });

  return (
    <div className="page-container">
      <PageHeader
        title={t('conversations.title', 'Conversations')}
        subtitle={t('conversations.subtitle', 'Shared inbox for all business conversations')}
      />

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['', 'open', 'pending', 'resolved', 'closed'].map(s => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : t('common.all', 'All')}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              type="text"
              className="input input-sm"
              style={{ paddingLeft: '32px', width: '100%' }}
              placeholder={t('common.search', 'Search conversations...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><Loader2 className="animate-spin" size={24} /></div>
      ) : filteredConversations.length === 0 ? (
        <div className="empty-state">
          <MessageCircle size={48} strokeWidth={1} />
          <p>{t('conversations.empty', 'No conversations found')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('conversations.chatId', 'Chat')}</th>
                <th>{t('common.status', 'Status')}</th>
                <th>{t('conversations.assignedTo', 'Assigned To')}</th>
                <th>{t('conversations.lastMessage', 'Last Message')}</th>
                <th>{t('conversations.unread', 'Unread')}</th>
                <th>{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredConversations.map(conv => (
                <tr key={conv.id}>
                  <td>
                    <div
                      style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--color-primary)' }}
                      onClick={() => navigate(`/chats?sessionId=${encodeURIComponent(conv.sessionId)}&chatId=${encodeURIComponent(conv.chatId)}`)}
                      title="Open in Chat"
                    >
                      {conv.chatName || conv.chatId}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{conv.sessionId}</div>
                  </td>
                  <td>
                    <select
                      className="input input-xs"
                      value={conv.status}
                      onChange={e => void handleStatusChange(conv.id, e.target.value)}
                      style={{
                        color: statusColors[conv.status] || 'inherit',
                        fontWeight: 500,
                        backgroundColor: 'transparent',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <option value="open">Open</option>
                      <option value="pending">Pending</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{conv.assignedTo || '—'}</span>
                      <button
                        className="btn btn-icon btn-ghost btn-xs"
                        title={t('conversations.assign', 'Assign')}
                        onClick={() => void handleAssign(conv.id, conv.assignedTo)}
                      >
                        <UserCheck size={14} />
                      </button>
                    </div>
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.lastMessagePreview || '—'}
                  </td>
                  <td>
                    {conv.unreadCount > 0 ? (
                      <span className="badge badge-warning">{conv.unreadCount}</span>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        className="btn btn-icon btn-ghost"
                        title={t('common.view', 'View in Chat')}
                        onClick={() => navigate(`/chats?sessionId=${encodeURIComponent(conv.sessionId)}&chatId=${encodeURIComponent(conv.chatId)}`)}
                      >
                        <Eye size={16} />
                      </button>
                      {conv.unreadCount > 0 && (
                        <button
                          className="btn btn-icon btn-ghost"
                          title={t('conversations.markRead', 'Mark as read')}
                          onClick={() => void handleMarkRead(conv.id)}
                        >
                          <CheckCheck size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
