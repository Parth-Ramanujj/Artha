import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle, Eye, CheckCheck } from 'lucide-react';
import { conversationApi, type Conversation } from '../services/api';
import { PageHeader } from '../components/PageHeader';

const statusColors: Record<string, string> = {
  open: 'var(--color-success)',
  pending: 'var(--color-warning)',
  resolved: 'var(--color-info)',
  closed: 'var(--color-muted)',
};

export function Conversations() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    conversationApi
      .list({ status: statusFilter || undefined, limit: 50 })
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const handleMarkRead = async (id: string) => {
    const updated = await conversationApi.markRead(id);
    setConversations(prev => prev.map(c => (c.id === id ? updated : c)));
  };

  return (
    <div className="page-container">
      <PageHeader
        title={t('conversations.title', 'Conversations')}
        subtitle={t('conversations.subtitle', 'Shared inbox for all business conversations')}
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['', 'open', 'pending', 'resolved', 'closed'].map(s => (
          <button
            key={s}
            className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatusFilter(s)}
          >
            {s || t('common.all', 'All')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state"><Loader2 className="animate-spin" size={24} /></div>
      ) : conversations.length === 0 ? (
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
              {conversations.map(conv => (
                <tr key={conv.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{conv.chatName || conv.chatId}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{conv.sessionId}</div>
                  </td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ color: statusColors[conv.status] || 'var(--color-muted)' }}
                    >
                      {conv.status}
                    </span>
                  </td>
                  <td>{conv.assignedTo || '—'}</td>
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
                      <button className="btn btn-icon btn-ghost" title={t('common.view', 'View')}>
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
