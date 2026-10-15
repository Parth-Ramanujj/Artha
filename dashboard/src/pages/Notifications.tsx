import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Bell,
  CheckCheck,
  Trash2,
  RefreshCw,
  Search,
  AlertTriangle,
  Inbox,
  ArrowRight,
} from 'lucide-react';
import { notificationApi, type Notification } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import './Notifications.css';

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; bg: string; color: string; route?: string }
> = {
  conversation_assigned: {
    label: 'Chat Assigned',
    icon: '👤',
    bg: 'rgba(59, 130, 246, 0.12)',
    color: '#2563eb',
    route: '/conversations',
  },
  conversation_unread: {
    label: 'New Message',
    icon: '💬',
    bg: 'rgba(34, 197, 94, 0.12)',
    color: '#16a34a',
    route: '/conversations',
  },
  campaign_completed: {
    label: 'Campaign Completed',
    icon: '✅',
    bg: 'rgba(34, 197, 94, 0.12)',
    color: '#16a34a',
    route: '/campaigns',
  },
  campaign_failed: {
    label: 'Campaign Failed',
    icon: '❌',
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#dc2626',
    route: '/campaigns',
  },
  workflow_error: {
    label: 'Workflow Issue',
    icon: '⚠️',
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#d97706',
    route: '/workflows',
  },
  sla_breach: {
    label: 'SLA Breach Alert',
    icon: '⏰',
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#dc2626',
    route: '/sla-tracking',
  },
  new_contact: {
    label: 'New Contact Lead',
    icon: '📋',
    bg: 'rgba(168, 85, 247, 0.12)',
    color: '#9333ea',
    route: '/sync',
  },
  system: {
    label: 'System Notification',
    icon: '🔔',
    bg: 'rgba(107, 114, 128, 0.12)',
    color: '#4b5563',
  },
};

export function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    notificationApi
      .list({ unreadOnly: showUnreadOnly, limit: 100 })
      .then(res => setItems(res || []))
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
      toast.success(t('common.success', 'Success'), 'Notification marked as read');
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed to mark as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setItems(prev => prev.map(n => ({ ...n, read: true })));
      toast.success(t('common.success', 'Success'), 'All notifications marked as read');
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed to mark all as read');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await notificationApi.delete(id);
      setItems(prev => prev.filter(n => n.id !== id));
      toast.success(t('common.success', 'Success'), 'Notification dismissed');
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed to delete');
    }
  };

  const unreadCount = items.filter(n => !n.read).length;

  const filteredItems = items.filter(item => {
    const matchesSearch =
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.message && item.message.toLowerCase().includes(search.toLowerCase()));
    const matchesType = selectedType === 'all' || item.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="notif-container">
      <PageHeader
        title={t('notifications.title', 'Notifications & Alerts')}
        subtitle={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'} requiring attention`}
        icon={<Bell size={24} />}
        action={
          unreadCount > 0
            ? {
                label: 'Mark All Read',
                onClick: handleMarkAllRead,
                icon: <CheckCheck size={16} />,
              }
            : undefined
        }
      />

      {/* Top Overview Cards */}
      <div className="notif-stats-grid">
        <div className="notif-stat-card">
          <div>
            <div className="notif-stat-label">Total Alerts</div>
            <div className="notif-stat-value">{items.length}</div>
          </div>
          <div className="notif-stat-icon blue">
            <Inbox size={22} />
          </div>
        </div>

        <div className="notif-stat-card">
          <div>
            <div className="notif-stat-label">Unread Notifications</div>
            <div
              className="notif-stat-value"
              style={{ color: unreadCount > 0 ? '#ef4444' : '#10b981' }}
            >
              {unreadCount}
            </div>
          </div>
          <div className={`notif-stat-icon ${unreadCount > 0 ? 'red' : 'green'}`}>
            <Bell size={22} />
          </div>
        </div>

        <div className="notif-stat-card">
          <div>
            <div className="notif-stat-label">Action Required</div>
            <div className="notif-stat-value" style={{ color: '#f59e0b' }}>
              {items.filter(i => !i.read && (i.type === 'sla_breach' || i.type === 'workflow_error')).length}
            </div>
          </div>
          <div className="notif-stat-icon amber">
            <AlertTriangle size={22} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="notif-toolbar">
        <div className="notif-filter-group">
          <button
            className={`notif-filter-btn ${selectedType === 'all' && !showUnreadOnly ? 'active' : ''}`}
            onClick={() => {
              setSelectedType('all');
              setShowUnreadOnly(false);
            }}
          >
            All Alerts ({items.length})
          </button>
          <button
            className={`notif-filter-btn ${showUnreadOnly ? 'active' : ''}`}
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          >
            <span className="notif-unread-dot" />
            Unread Only ({unreadCount})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="notif-search-box">
            <Search size={15} className="notif-search-icon" />
            <input
              type="text"
              className="notif-search-input"
              placeholder="Search notifications..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} title="Refresh" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Notification List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="notif-empty-state">
          <div className="notif-empty-icon">
            <Bell size={32} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>All Caught Up!</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            You have no pending notifications at this time.
          </p>
        </div>
      ) : (
        <div className="notif-list">
          {filteredItems.map(item => {
            const cfg = TYPE_CONFIG[item.type] || {
              label: item.type,
              icon: '🔔',
              bg: 'rgba(107, 114, 128, 0.12)',
              color: '#4b5563',
            };

            return (
              <div
                key={item.id}
                className={`notif-card ${!item.read ? 'unread' : ''}`}
              >
                <div className="notif-card-main">
                  <div
                    className="notif-type-icon"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.icon}
                  </div>
                  <div className="notif-content-area">
                    <div className="notif-header-line">
                      <span className="notif-title">
                        {item.title}
                      </span>
                      {!item.read && (
                        <span className="notif-unread-pill">
                          NEW
                        </span>
                      )}
                      <span
                        className="notif-type-tag"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    {item.message && (
                      <div className="notif-message">
                        {item.message}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
                      <span className="notif-time">
                        {new Date(item.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                      {cfg.route && (
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                          onClick={() => cfg.route && navigate(cfg.route)}
                        >
                          View in module <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="notif-actions">
                  {!item.read && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMarkRead(item.id)}
                      title="Mark as read"
                    >
                      <CheckCheck size={14} /> Read
                    </button>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(item.id)}
                    title="Dismiss notification"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

