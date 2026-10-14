import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Bell, CheckCheck, Trash2, Eye } from 'lucide-react';
import { notificationApi, type Notification } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';

const typeIcons: Record<string, string> = {
  conversation_assigned: '👤',
  conversation_unread: '💬',
  campaign_completed: '✅',
  campaign_failed: '❌',
  workflow_error: '⚠️',
  sla_breach: '⏰',
  new_contact: '📋',
  system: '🔔',
};

export function Notifications() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const load = () => {
    setLoading(true);
    notificationApi
      .list({ unreadOnly: showUnreadOnly, limit: 100 })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [showUnreadOnly]);

  const handleMarkRead = async (id: string) => {
    try {
      const updated = await notificationApi.markAsRead(id);
      setItems(prev => prev.map(n => (n.id === id ? updated : n)));
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setItems(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('Success', 'All marked as read');
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await notificationApi.delete(id);
      setItems(prev => prev.filter(n => n.id !== id));
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed');
    }
  };

  const unreadCount = items.filter(n => !n.read).length;

  return (
    <div>
      <PageHeader
        title={t('notifications.title', 'Notifications')}
        subtitle={`${unreadCount} unread`}
        icon={<Bell size={24} />}
        action={{ label: 'Mark All Read', onClick: handleMarkAllRead, icon: <CheckCheck size={16} /> }}
      />

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={showUnreadOnly} onChange={e => setShowUnreadOnly(e.target.checked)} />
          Show unread only
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>No notifications</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                padding: '12px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: item.read
                  ? 'var(--color-bg-secondary)'
                  : 'var(--color-bg-highlight, var(--color-bg-secondary))',
                opacity: item.read ? 0.7 : 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20 }}>{typeIcons[item.type] || '🔔'}</span>
                <div>
                  <div style={{ fontWeight: item.read ? 400 : 600 }}>{item.title}</div>
                  {item.message && <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{item.message}</div>}
                  <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!item.read && (
                  <button
                    onClick={() => handleMarkRead(item.id)}
                    title="Mark read"
                    style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    <Eye size={16} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(item.id)}
                  title="Delete"
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
    </div>
  );
}
