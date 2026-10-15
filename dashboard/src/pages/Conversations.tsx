import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  MessageCircle,
  Eye,
  CheckCheck,
  Search,
  UserCheck,
  RefreshCw,
  Clock,
  Inbox,
  CheckCircle,
} from 'lucide-react';
import { conversationApi, type Conversation } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; icon: string }> = {
  open: { label: 'Open', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', dot: '#22c55e', icon: '🟢' },
  pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', dot: '#f59e0b', icon: '🟡' },
  resolved: { label: 'Resolved', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', dot: '#3b82f6', icon: '🔵' },
  closed: { label: 'Closed', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', dot: '#6b7280', icon: '⚪' },
};

const PRESET_ADVISORS = [
  { name: 'Ramesh Patel', role: 'Senior Wealth Advisor', avatar: 'RP' },
  { name: 'Priya Sharma', role: 'Insurance & Claims Lead', avatar: 'PS' },
  { name: 'Aditi Verma', role: 'Mutual Funds Specialist', avatar: 'AV' },
  { name: 'Kavita Dave', role: 'Client Support Manager', avatar: 'KD' },
  { name: 'Antigravity AI Bot', role: 'Automated 24/7 Agent', avatar: '🤖' },
];

export function Conversations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Assign Agent Modal
  const [assignTarget, setAssignTarget] = useState<Conversation | null>(null);
  const [selectedAgentName, setSelectedAgentName] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const loadConversations = () => {
    setLoading(true);
    conversationApi
      .list({ status: statusFilter || undefined, limit: 100 })
      .then(res => setConversations(res || []))
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
      toast.success(t('common.success', 'Success'), 'Marked as read');
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

  const openAssignModal = (conv: Conversation) => {
    setAssignTarget(conv);
    setSelectedAgentName(conv.assignedTo || '');
  };

  const handleSaveAssignment = async () => {
    if (!assignTarget) return;
    setIsAssigning(true);
    try {
      const trimmed = selectedAgentName.trim();
      const updated = await conversationApi.update(assignTarget.id, {
        assignedTo: trimmed || null as any,
      });
      setConversations(prev => prev.map(c => (c.id === assignTarget.id ? updated : c)));
      toast.success(
        t('common.success', 'Success'),
        trimmed ? `Assigned to ${trimmed}` : 'Assignment cleared'
      );
      setAssignTarget(null);
    } catch (err: any) {
      toast.error(t('common.error', 'Error'), err?.message || 'Failed to assign conversation');
    } finally {
      setIsAssigning(false);
    }
  };

  const filteredConversations = conversations.filter(conv => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      conv.chatId.toLowerCase().includes(term) ||
      (conv.chatName && conv.chatName.toLowerCase().includes(term)) ||
      (conv.lastMessagePreview && conv.lastMessagePreview.toLowerCase().includes(term)) ||
      (conv.assignedTo && conv.assignedTo.toLowerCase().includes(term)) ||
      (conv.sessionId && conv.sessionId.toLowerCase().includes(term))
    );
  });

  // Calculate metrics
  const totalCount = conversations.length;
  const openCount = conversations.filter(c => c.status === 'open').length;
  const pendingCount = conversations.filter(c => c.status === 'pending').length;
  const resolvedCount = conversations.filter(c => c.status === 'resolved' || c.status === 'closed').length;
  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title={t('conversations.title', 'Conversations')}
        subtitle={t('conversations.subtitle', 'Live shared omnichannel inbox for all customer WhatsApp chats')}
      />

      {/* Top Summary Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total Inquiries</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{totalCount}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <Inbox size={22} />
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Active / Open</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#22c55e' }}>{openCount}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
            <CheckCircle size={22} />
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Pending Follow-up</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#f59e0b' }}>{pendingCount}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <Clock size={22} />
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Resolved</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#3b82f6' }}>{resolvedCount}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <CheckCheck size={22} />
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Unread Messages</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: totalUnread > 0 ? '#ef4444' : 'var(--color-text)' }}>
              {totalUnread}
            </div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <MessageCircle size={22} />
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: '', label: 'All Inquiries', count: totalCount },
            { key: 'open', label: 'Open', count: openCount },
            { key: 'pending', label: 'Pending', count: pendingCount },
            { key: 'resolved', label: 'Resolved', count: conversations.filter(c => c.status === 'resolved').length },
            { key: 'closed', label: 'Closed', count: conversations.filter(c => c.status === 'closed').length },
          ].map(tab => (
            <button
              key={tab.key}
              className={`btn btn-sm ${statusFilter === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(tab.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: statusFilter === tab.key ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                  fontWeight: 600,
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 260 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0.5,
              }}
            />
            <input
              type="text"
              className="input input-sm"
              style={{ paddingLeft: 32, width: '100%' }}
              placeholder={t('common.search', 'Search by name, phone, message...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadConversations}
            disabled={loading}
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Table / Empty State */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
        </div>
      ) : filteredConversations.length === 0 ? (
        <div
          style={{
            padding: '60px 24px',
            textAlign: 'center',
            background: 'var(--color-bg-secondary)',
            borderRadius: 12,
            border: '1px dashed var(--color-border)',
          }}
        >
          <MessageCircle size={44} strokeWidth={1.5} style={{ opacity: 0.4, marginBottom: 12 }} />
          <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px 0' }}>No conversations match your criteria</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
            Try adjusting your search terms or status filters above.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Contact & Chat</th>
                  <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Assigned Advisor</th>
                  <th style={{ padding: '14px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>Latest Activity</th>
                  <th style={{ padding: '14px 18px', textAlign: 'center', fontSize: 12, fontWeight: 600 }}>Unread</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredConversations.map(conv => {
                  const cfg = STATUS_CONFIG[conv.status] || {
                    label: conv.status,
                    color: '#6b7280',
                    bg: 'rgba(107, 114, 128, 0.1)',
                    dot: '#6b7280',
                  };
                  const initial = (conv.chatName || conv.chatId || 'U').slice(0, 2).toUpperCase();

                  return (
                    <tr
                      key={conv.id}
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        background: conv.unreadCount > 0 ? 'rgba(59, 130, 246, 0.03)' : 'transparent',
                      }}
                    >
                      {/* Contact Info */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: '50%',
                              background: 'rgba(59, 130, 246, 0.1)',
                              color: 'var(--color-primary, #3b82f6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 13,
                              flexShrink: 0,
                            }}
                          >
                            {initial}
                          </div>
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 14,
                                color: 'var(--color-primary)',
                                cursor: 'pointer',
                              }}
                              onClick={() =>
                                navigate(
                                  `/chats?sessionId=${encodeURIComponent(conv.sessionId)}&chatId=${encodeURIComponent(
                                    conv.chatId
                                  )}`
                                )
                              }
                              title="Click to open full chat interface"
                            >
                              {conv.chatName || conv.chatId}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                              <span style={{ fontFamily: 'monospace' }}>{conv.chatId}</span>
                              {conv.sessionId && (
                                <span style={{ marginLeft: 6, opacity: 0.7 }}>&bull; {conv.sessionId}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status Dropdown */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: cfg.dot,
                              boxShadow: `0 0 6px ${cfg.dot}`,
                            }}
                          />
                          <select
                            className="input input-xs"
                            value={conv.status}
                            onChange={e => void handleStatusChange(conv.id, e.target.value)}
                            style={{
                              color: cfg.color,
                              fontWeight: 600,
                              background: cfg.bg,
                              borderColor: 'transparent',
                              borderRadius: 6,
                              padding: '2px 8px',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="open">Open</option>
                            <option value="pending">Pending</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>
                      </td>

                      {/* Assigned Advisor */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {conv.assignedTo ? (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                background: 'rgba(0,0,0,0.05)',
                                padding: '3px 8px',
                                borderRadius: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              👤 {conv.assignedTo}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Unassigned</span>
                          )}
                          <button
                            className="btn btn-icon btn-ghost btn-xs"
                            title="Reassign conversation"
                            onClick={() => openAssignModal(conv)}
                          >
                            <UserCheck size={14} />
                          </button>
                        </div>
                      </td>

                      {/* Latest Activity / Preview */}
                      <td style={{ padding: '14px 18px', maxWidth: 300 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--color-text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={conv.lastMessagePreview || ''}
                        >
                          {conv.lastMessagePreview || <span style={{ opacity: 0.5 }}>— No messages —</span>}
                        </div>
                        {conv.lastMessageAt && (
                          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                            {new Date(conv.lastMessageAt).toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* Unread Count */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        {conv.unreadCount > 0 ? (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {conv.unreadCount} new
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>0</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() =>
                              navigate(
                                `/chats?sessionId=${encodeURIComponent(conv.sessionId)}&chatId=${encodeURIComponent(
                                  conv.chatId
                                )}`
                              )
                            }
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={13} /> Chat
                          </button>
                          {conv.unreadCount > 0 && (
                            <button
                              className="btn btn-secondary btn-xs"
                              title="Mark conversation as read"
                              onClick={() => void handleMarkRead(conv.id)}
                            >
                              <CheckCheck size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ASSIGN ADVISOR MODAL (Replaces window.prompt) */}
      {assignTarget && (
        <Modal
          title={`Assign Conversation: ${assignTarget.chatName || assignTarget.chatId}`}
          onClose={() => setAssignTarget(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Select Team Advisor:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {PRESET_ADVISORS.map(adv => {
                  const isSelected = selectedAgentName === adv.name;
                  return (
                    <button
                      key={adv.name}
                      type="button"
                      onClick={() => setSelectedAgentName(adv.name)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-secondary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: isSelected ? 'var(--color-primary)' : 'rgba(0,0,0,0.06)',
                          color: isSelected ? '#fff' : 'inherit',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 12,
                          flexShrink: 0,
                        }}
                      >
                        {adv.avatar}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {adv.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {adv.role}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              Or Enter Custom Agent / Team Name:
              <input
                className="input"
                placeholder="e.g. Inbound Sales Tier 1"
                value={selectedAgentName}
                onChange={e => setSelectedAgentName(e.target.value)}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              {selectedAgentName && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSelectedAgentName('')}
                  style={{ color: 'var(--color-danger)' }}
                >
                  Clear Assignment
                </button>
              )}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button className="btn btn-secondary" onClick={() => setAssignTarget(null)} disabled={isAssigning}>
                  {t('common.cancel', 'Cancel')}
                </button>
                <button className="btn btn-primary" onClick={handleSaveAssignment} disabled={isAssigning}>
                  {isAssigning ? 'Saving...' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
