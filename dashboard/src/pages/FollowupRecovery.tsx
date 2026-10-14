import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { followupApi } from '../services/api';

interface FollowupRule {
  id: string;
  name: string;
  trigger: string;
  delayMinutes: number;
  message: string;
  maxAttempts: number;
  cooldownMinutes: number;
  enabled: boolean;
  totalSent: number;
  totalRecovered: number;
  createdAt: string;
}

interface DroppedUser {
  conversationId: string;
  chatId: string;
  chatName: string;
  sessionId: string;
  lastMessageAt: string;
  minutesIdle: number;
}

interface FollowupStats {
  totalRules: number;
  activeRules: number;
  totalSent: number;
  totalRecovered: number;
  recoveryRate: number;
}

const triggerLabels: Record<string, string> = {
  no_reply: 'No Reply',
  conversation_idle: 'Conversation Idle',
  cart_abandoned: 'Cart Abandoned',
  form_incomplete: 'Form Incomplete',
};

export function FollowupRecovery() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [rules, setRules] = useState<FollowupRule[]>([]);
  const [droppedUsers, setDroppedUsers] = useState<DroppedUser[]>([]);
  const [stats, setStats] = useState<FollowupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rules' | 'dropped' | 'stats'>('rules');
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<FollowupRule | null>(null);
  const [form, setForm] = useState({
    name: '',
    trigger: 'no_reply',
    delayMinutes: '60',
    message: '',
    maxAttempts: '3',
    cooldownMinutes: '1440',
  });

  const load = async () => {
    try {
      const [r, d, s] = await Promise.all([followupApi.rules(), followupApi.droppedUsers(), followupApi.stats()]);
      setRules(r);
      setDroppedUsers(d);
      setStats(s);
    } catch {
      addToast('Failed to load follow-up data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditRule(null);
    setForm({
      name: '',
      trigger: 'no_reply',
      delayMinutes: '60',
      message: '',
      maxAttempts: '3',
      cooldownMinutes: '1440',
    });
    setShowModal(true);
  };

  const openEdit = (rule: FollowupRule) => {
    setEditRule(rule);
    setForm({
      name: rule.name,
      trigger: rule.trigger,
      delayMinutes: String(rule.delayMinutes),
      message: rule.message,
      maxAttempts: String(rule.maxAttempts),
      cooldownMinutes: String(rule.cooldownMinutes),
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    const data = {
      name: form.name,
      trigger: form.trigger,
      delayMinutes: parseInt(form.delayMinutes, 10),
      message: form.message,
      maxAttempts: parseInt(form.maxAttempts, 10),
      cooldownMinutes: parseInt(form.cooldownMinutes, 10),
    };

    try {
      if (editRule) {
        await followupApi.updateRule(editRule.id, data);
        addToast('Rule updated', 'success');
      } else {
        await followupApi.createRule(data);
        addToast('Rule created', 'success');
      }
      setShowModal(false);
      await load();
    } catch {
      addToast('Failed to save rule', 'error');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await followupApi.deleteRule(id);
      addToast('Rule deleted', 'success');
      await load();
    } catch {
      addToast('Failed to delete rule', 'error');
    }
  };

  const handleSendFollowup = async (user: DroppedUser) => {
    const message = prompt('Enter follow-up message:');
    if (!message) return;
    try {
      const result = await followupApi.send({
        conversationId: user.conversationId,
        sessionId: user.sessionId,
        chatId: user.chatId,
        message,
      });
      if (result.success) {
        addToast('Follow-up sent', 'success');
      } else {
        addToast(`Failed: ${result.reason}`, 'error');
      }
    } catch {
      addToast('Failed to send follow-up', 'error');
    }
  };

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000 }}>
      <PageHeader
        title={t('nav.followup')}
        subtitle="Detect dropped users and automate follow-up recovery"
        action={{ label: 'New Rule', onClick: openCreate }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button className={`btn ${tab === 'rules' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('rules')}>
          Rules ({rules.length})
        </button>
        <button
          className={`btn ${tab === 'dropped' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('dropped')}
        >
          Dropped Users ({droppedUsers.length})
        </button>
        <button className={`btn ${tab === 'stats' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('stats')}>
          Stats
        </button>
      </div>

      {tab === 'stats' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary)' }}>{stats.totalRules}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Rules</div>
          </div>
          <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.activeRules}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Active Rules</div>
          </div>
          <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.totalSent}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Follow-ups Sent</div>
          </div>
          <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.totalRecovered}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Users Recovered</div>
          </div>
          <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{stats.recoveryRate}%</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Recovery Rate</div>
          </div>
        </div>
      )}

      {tab === 'rules' &&
        (rules.length === 0 ? (
          <div className="empty-state">
            <p>No follow-up rules yet.</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Create rules to automatically follow up with users who stop responding.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map(r => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 16,
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span
                      style={{
                        fontSize: 12,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: r.enabled ? '#22c55e20' : '#6b728020',
                        color: r.enabled ? '#22c55e' : '#6b7280',
                      }}
                    >
                      {r.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Trigger: {triggerLabels[r.trigger] || r.trigger} &bull; Delay: {r.delayMinutes}m &bull; Max:{' '}
                    {r.maxAttempts} attempts
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Sent: {r.totalSent} &bull; Recovered: {r.totalRecovered}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRule(r.id)}>
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === 'dropped' &&
        (droppedUsers.length === 0 ? (
          <div className="empty-state">
            <p>No dropped users detected.</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Users who haven't responded for over 60 minutes will appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {droppedUsers.map(u => (
              <div
                key={u.conversationId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 16,
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{u.chatName || u.chatId}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Idle: {u.minutesIdle} minutes &bull; Last: {new Date(u.lastMessageAt).toLocaleString()}
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => handleSendFollowup(u)}>
                  Send Follow-up
                </button>
              </div>
            ))}
          </div>
        ))}

      {showModal && (
        <Modal title={editRule ? 'Edit Follow-up Rule' : 'Create Follow-up Rule'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              Name *
              <input
                className="input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label>
              Trigger *
              <select
                className="input"
                value={form.trigger}
                onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
              >
                {Object.entries(triggerLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Delay (minutes)
              <input
                className="input"
                type="number"
                value={form.delayMinutes}
                onChange={e => setForm(f => ({ ...f, delayMinutes: e.target.value }))}
                min="1"
              />
            </label>
            <label>
              Message *
              <textarea
                className="input"
                rows={3}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Hi {{name}}, we noticed you haven't replied..."
              />
            </label>
            <label>
              Max Attempts
              <input
                className="input"
                type="number"
                value={form.maxAttempts}
                onChange={e => setForm(f => ({ ...f, maxAttempts: e.target.value }))}
                min="1"
              />
            </label>
            <label>
              Cooldown (minutes)
              <input
                className="input"
                type="number"
                value={form.cooldownMinutes}
                onChange={e => setForm(f => ({ ...f, cooldownMinutes: e.target.value }))}
                min="1"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.name || !form.message}>
                {editRule ? 'Update' : t('common.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
