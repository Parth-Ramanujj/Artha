import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

const starDisplay = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

export function Feedback() {
  const { t } = useTranslation();
  const toast = useToast();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'stats'>('list');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({ conversationId: '', sessionId: '', chatId: '' });

  const load = async () => {
    try {
      const [list, s] = await Promise.all([feedbackApi.list(), feedbackApi.stats()]);
      setEntries(list);
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
    try {
      const result = await feedbackApi.requestViaWhatsApp(requestForm);
      if (result.success) {
        toast.success('Feedback request sent via WhatsApp');
        setShowRequestModal(false);
        setRequestForm({ conversationId: '', sessionId: '', chatId: '' });
      } else {
        toast.error(`Failed: ${result.reason}`);
      }
    } catch {
      toast.error('Failed to send feedback request');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await feedbackApi.delete(id);
      toast.success('Feedback deleted');
      await load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000 }}>
      <PageHeader
        title={t('nav.feedback')}
        subtitle="Post-consultation feedback and agent ratings"
        action={{ label: 'Request Feedback via WhatsApp', onClick: () => setShowRequestModal(true) }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button className={`btn ${tab === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('list')}>
          Feedback List
        </button>
        <button className={`btn ${tab === 'stats' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('stats')}>
          Statistics
        </button>
      </div>

      {tab === 'stats' && stats && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div
              className="stat-card"
              style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}
            >
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary)' }}>{stats.total}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Feedback</div>
            </div>
            <div
              className="stat-card"
              style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}
            >
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>
                {starDisplay(Math.round(stats.averageRating))}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Average: {stats.averageRating}/5</div>
            </div>
          </div>

          <h3 style={{ marginBottom: 12 }}>Rating Distribution</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {[5, 4, 3, 2, 1].map(r => {
              const count = stats.distribution[r] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 30, fontWeight: 600 }}>{r}★</span>
                  <div
                    style={{
                      flex: 1,
                      height: 20,
                      background: 'var(--bg-tertiary)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: r >= 4 ? '#22c55e' : r === 3 ? '#f59e0b' : '#ef4444',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                  <span style={{ width: 60, fontSize: 13, color: 'var(--text-secondary)' }}>
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>

          {stats.agentStats && Object.keys(stats.agentStats).length > 0 && (
            <>
              <h3 style={{ marginBottom: 12 }}>Agent Ratings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {Object.entries(stats.agentStats).map(([name, s]) => (
                  <div key={name} style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                    <div style={{ color: '#f59e0b' }}>
                      {starDisplay(Math.round(s.avg))} {s.avg}/5
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.total} reviews</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'list' &&
        (entries.length === 0 ? (
          <div className="empty-state">
            <p>No feedback received yet.</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Send feedback requests via WhatsApp after consultations to collect agent ratings.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map(f => (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: 16,
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#f59e0b', fontSize: 18 }}>{starDisplay(f.rating)}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {f.customerName || 'Anonymous'} → {f.agentName || 'Unknown Agent'}
                    </span>
                  </div>
                  {f.comment && <p style={{ margin: '4px 0 0', fontSize: 14 }}>{f.comment}</p>}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {new Date(f.createdAt).toLocaleString()}
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(f.id)}>
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        ))}

      {showRequestModal && (
        <Modal title="Request Feedback via WhatsApp" onClose={() => setShowRequestModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              Conversation ID *
              <input
                className="input"
                value={requestForm.conversationId}
                onChange={e => setRequestForm(f => ({ ...f, conversationId: e.target.value }))}
              />
            </label>
            <label>
              Session ID *
              <input
                className="input"
                value={requestForm.sessionId}
                onChange={e => setRequestForm(f => ({ ...f, sessionId: e.target.value }))}
              />
            </label>
            <label>
              Chat ID *
              <input
                className="input"
                value={requestForm.chatId}
                onChange={e => setRequestForm(f => ({ ...f, chatId: e.target.value }))}
                placeholder="e.g. 919876543210@c.us"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRequestFeedback}
                disabled={!requestForm.conversationId || !requestForm.sessionId || !requestForm.chatId}
              >
                Send Request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
