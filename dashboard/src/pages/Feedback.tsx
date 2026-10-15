import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Star,
  Search,
  Trash2,
  Users,
  Send,
  Award,
  ThumbsUp,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { feedbackApi } from '../services/api';

interface FeedbackEntry {
  id: string;
  conversationId: string;
  customerName: string | null;
  agentName: string | null;
  rating: number;
  comment: string | null;
  tags: string[] | null;
  resolved: boolean;
  createdAt: string;
}

interface FeedbackStats {
  total: number;
  averageRating: number;
  distribution: Record<number, number>;
  agentStats?: Record<string, { total: number; avg: number }>;
}

export function Feedback() {
  const { t } = useTranslation();
  const toast = useToast();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'stats'>('list');
  const [search, setSearch] = useState('');
  const [starFilter, setStarFilter] = useState<number | 'all'>('all');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({ conversationId: '', sessionId: 'padosi', chatId: '' });

  const load = async () => {
    try {
      const [list, s] = await Promise.all([feedbackApi.list(), feedbackApi.stats()]);
      setEntries(list as FeedbackEntry[]);
      setStats(s);
    } catch {
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRequestFeedback = async () => {
    if (!requestForm.chatId.trim()) {
      toast.warning('Validation', 'Chat phone number or ID is required');
      return;
    }

    try {
      const result = await feedbackApi.requestViaWhatsApp({
        ...requestForm,
        conversationId: requestForm.conversationId || 'conv-direct',
      });
      if (result.success) {
        toast.success('Dispatched', 'Feedback request sent via WhatsApp');
        setShowRequestModal(false);
        setRequestForm({ conversationId: '', sessionId: 'padosi', chatId: '' });
      } else {
        toast.error('Failed', result.reason || 'Could not send feedback request');
      }
    } catch {
      toast.error('Error', 'Failed to send feedback request');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this feedback entry?')) return;
    try {
      await feedbackApi.delete(id);
      toast.success('Deleted', 'Feedback removed');
      await load();
    } catch {
      toast.error('Error', 'Failed to delete');
    }
  };

  const renderStars = (rating: number, max = 5) => {
    return (
      <div style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
        {Array.from({ length: max }).map((_, i) => (
          <Star
            key={i}
            size={16}
            fill={i < rating ? '#f59e0b' : 'none'}
            color={i < rating ? '#f59e0b' : 'var(--text-secondary)'}
          />
        ))}
      </div>
    );
  };

  // Filtered reviews
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchSearch =
        (e.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.agentName || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.comment || '').toLowerCase().includes(search.toLowerCase());

      const matchStar = starFilter === 'all' || e.rating === starFilter;
      return matchSearch && matchStar;
    });
  }, [entries, search, starFilter]);

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1140, margin: '0 auto' }}>
      <PageHeader
        title={t('nav.feedback', 'Customer Satisfaction (CSAT) & Feedback')}
        subtitle="Post-consultation customer ratings, reviews, and advisor quality metrics"
        action={{ label: 'Request Rating via WhatsApp', onClick: () => setShowRequestModal(true), icon: <Send size={15} /> }}
      />

      {/* Top CSAT Score Summary */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            margin: '16px 0 24px',
          }}
        >
          <div
            style={{
              padding: 18,
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
              }}
            >
              <Award size={26} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Overall CSAT Score</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: '#f59e0b' }}>
                  {stats.averageRating ? stats.averageRating.toFixed(1) : '5.0'}
                </span>
                {renderStars(Math.round(stats.averageRating || 5))}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: 18,
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(34, 197, 94, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22c55e',
              }}
            >
              <ThumbsUp size={24} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Reviews Logged</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{stats.total}</div>
            </div>
          </div>

          <div
            style={{
              padding: 18,
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
              }}
            >
              <Users size={24} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Rated Advisors</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>
                {Object.keys(stats.agentStats || {}).length || 1}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`btn ${tab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('list')}
        >
          Customer Reviews ({entries.length})
        </button>
        <button
          className={`btn ${tab === 'stats' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('stats')}
        >
          Rating Analytics & Breakdown
        </button>
      </div>

      {tab === 'stats' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* Star Rating Breakdown Card */}
          <div
            style={{
              padding: 20,
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Rating Distribution</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[5, 4, 3, 2, 1].map(r => {
                const count = stats.distribution[r] || 0;
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 600 }}>
                      <span>{r}</span>
                      <Star size={13} fill="#f59e0b" color="#f59e0b" />
                    </div>
                    <div
                      style={{
                        flex: 1,
                        height: 12,
                        background: 'var(--border)',
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: r >= 4 ? '#22c55e' : r === 3 ? '#f59e0b' : '#ef4444',
                          borderRadius: 6,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    <span style={{ width: 70, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Performance Card */}
          <div
            style={{
              padding: 20,
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Advisor CSAT Ratings</h3>
            {stats.agentStats && Object.keys(stats.agentStats).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(stats.agentStats).map(([name, s]) => (
                  <div
                    key={name}
                    style={{
                      padding: 12,
                      background: 'var(--bg-tertiary, #f8fafc)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {s.total} consultations reviewed
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>
                        {s.avg.toFixed(1)} / 5.0
                      </div>
                      {renderStars(Math.round(s.avg))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                No agent reviews recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'list' && (
        <div>
          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 14,
              marginBottom: 18,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className={`btn btn-sm ${starFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStarFilter('all')}
              >
                All Ratings
              </button>
              {[5, 4, 3, 2, 1].map(star => (
                <button
                  key={star}
                  className={`btn btn-sm ${starFilter === star ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setStarFilter(star)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {star} <Star size={12} fill={starFilter === star ? '#fff' : '#f59e0b'} color={starFilter === star ? '#fff' : '#f59e0b'} />
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: 260 }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
              />
              <input
                type="text"
                className="input"
                placeholder="Search reviews..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 32, fontSize: 13, height: 36 }}
              />
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                background: 'var(--bg-secondary)',
                borderRadius: 12,
                border: '1px dashed var(--border)',
              }}
            >
              <Award size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No feedback entries matching filter</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 450, margin: '0 auto 16px' }}>
                Dispatch a rating request to customer chats via WhatsApp to collect feedback after insurance or financial consultations.
              </p>
              <button className="btn btn-primary" onClick={() => setShowRequestModal(true)}>
                <Send size={15} /> Send WhatsApp Rating Request
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 14 }}>
              {filteredEntries.map(f => (
                <div
                  key={f.id}
                  style={{
                    padding: 18,
                    background: 'var(--bg-secondary)',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{f.customerName || 'WhatsApp Customer'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Consultation with: <strong>{f.agentName || 'General Desk'}</strong>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {renderStars(f.rating)}
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {f.rating} out of 5
                        </div>
                      </div>
                    </div>

                    {f.comment ? (
                      <p
                        style={{
                          margin: '8px 0',
                          fontSize: 13,
                          lineHeight: 1.5,
                          background: 'var(--bg-tertiary, #f8fafc)',
                          padding: 10,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontStyle: 'italic',
                        }}
                      >
                        "{f.comment}"
                      </p>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', margin: '8px 0' }}>
                        Rating submitted without written comment.
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 10,
                      borderTop: '1px solid var(--border)',
                      marginTop: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(f.id)}
                      style={{ padding: '3px 8px', fontSize: 12 }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Request Feedback via WhatsApp */}
      {showRequestModal && (
        <Modal title="Send Rating Request via WhatsApp" onClose={() => setShowRequestModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Customer WhatsApp Phone / Chat ID *
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                value={requestForm.chatId}
                onChange={e => setRequestForm(f => ({ ...f, chatId: e.target.value }))}
                placeholder="e.g. 919227102108 or 919227102108@c.us"
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                Sends an interactive 1 to 5 star rating prompt directly into the customer's WhatsApp chat.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRequestFeedback}
                disabled={!requestForm.chatId.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={14} /> Send WhatsApp Request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
