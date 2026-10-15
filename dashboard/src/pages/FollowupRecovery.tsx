import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Send,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Play,
  Pause,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
  TrendingUp,
  CheckCheck,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { followupApi } from '../services/api';
import './FollowupRecovery.css';

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

const triggerLabels: Record<string, { label: string; icon: string; desc: string }> = {
  no_reply: { label: 'No Reply', icon: '⏳', desc: 'User stopped replying after agent/bot message' },
  conversation_idle: { label: 'Conversation Idle', icon: '💤', desc: 'No activity in conversation for set duration' },
  cart_abandoned: { label: 'Cart Abandoned', icon: '🛒', desc: 'User dropped out before checkout / plan selection' },
  form_incomplete: { label: 'Form Incomplete', icon: '📝', desc: 'User left document or questionnaire incomplete' },
};

const RULE_PRESETS = [
  {
    name: '15-Min Incomplete Lead Recovery',
    trigger: 'form_incomplete',
    delayMinutes: '15',
    message: 'Hi {{name}}, we noticed you started an inquiry but didn\'t finish. Can we answer any questions for you?',
    maxAttempts: '2',
    cooldownMinutes: '720',
  },
  {
    name: '1-Hour Inactive Consultation Check-in',
    trigger: 'no_reply',
    delayMinutes: '60',
    message: 'Hello! Just checking in to see if you had a chance to review the details we sent earlier? Let us know if you need assistance.',
    maxAttempts: '3',
    cooldownMinutes: '1440',
  },
  {
    name: '24-Hour Plan Selection Nudge',
    trigger: 'cart_abandoned',
    delayMinutes: '1440',
    message: 'Hi there! Your quote is saved and waiting. Would you like our senior advisor to assist you with the next step?',
    maxAttempts: '2',
    cooldownMinutes: '2880',
  },
];

const FOLLOWUP_MESSAGE_TEMPLATES = [
  {
    title: 'Friendly Check-in',
    text: 'Hi! Just wanted to check back in and see if you had any questions regarding what we discussed? We are here to help anytime!',
  },
  {
    title: 'Special Offer / Assistance',
    text: 'Hello! If you need help choosing the best plan or finalizing paperwork, our advisor can hop on a quick call with you right now.',
  },
  {
    title: 'Quick Nudge',
    text: 'Just bumping this chat in case it slipped down your inbox. Feel free to reply whenever convenient!',
  },
];

export function FollowupRecovery() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rules, setRules] = useState<FollowupRule[]>([]);
  const [droppedUsers, setDroppedUsers] = useState<DroppedUser[]>([]);
  const [stats, setStats] = useState<FollowupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rules' | 'dropped' | 'stats'>('rules');

  // Search & Filter
  const [search, setSearch] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('all');
  const [idleFilter, setIdleFilter] = useState<number | null>(null);

  // Modal: Create / Edit Rule
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<FollowupRule | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [form, setForm] = useState({
    name: '',
    trigger: 'no_reply',
    delayMinutes: '60',
    message: '',
    maxAttempts: '3',
    cooldownMinutes: '1440',
  });

  // Modal: Send Follow-up to Dropped User
  const [sendTargetUser, setSendTargetUser] = useState<DroppedUser | null>(null);
  const [customFollowupMessage, setCustomFollowupMessage] = useState('');
  const [isSendingFollowup, setIsSendingFollowup] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [r, d, s] = await Promise.all([
        followupApi.rules(),
        followupApi.droppedUsers(idleFilter || undefined),
        followupApi.stats(),
      ]);
      setRules((r as FollowupRule[]) || []);
      setDroppedUsers((d as DroppedUser[]) || []);
      setStats(s || null);
    } catch {
      toast.error('Failed to load follow-up data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [idleFilter]);

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

  const applyPreset = (preset: typeof RULE_PRESETS[0]) => {
    setForm({
      name: preset.name,
      trigger: preset.trigger,
      delayMinutes: preset.delayMinutes,
      message: preset.message,
      maxAttempts: preset.maxAttempts,
      cooldownMinutes: preset.cooldownMinutes,
    });
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

  const handleToggleRule = async (rule: FollowupRule) => {
    try {
      await followupApi.updateRule(rule.id, {
        ...rule,
        enabled: !rule.enabled,
      });
      toast.success(rule.enabled ? 'Rule paused' : 'Rule activated');
      await load();
    } catch {
      toast.error('Failed to toggle rule');
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.message.trim()) {
      toast.error('Please fill in required fields');
      return;
    }

    const data = {
      name: form.name.trim(),
      trigger: form.trigger,
      delayMinutes: parseInt(form.delayMinutes, 10) || 60,
      message: form.message.trim(),
      maxAttempts: parseInt(form.maxAttempts, 10) || 3,
      cooldownMinutes: parseInt(form.cooldownMinutes, 10) || 1440,
    };

    setSavingRule(true);
    try {
      if (editRule) {
        await followupApi.updateRule(editRule.id, data);
        toast.success('Follow-up rule updated');
      } else {
        await followupApi.createRule(data);
        toast.success('Follow-up rule created');
      }
      setShowModal(false);
      await load();
    } catch {
      toast.error('Failed to save follow-up rule');
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recovery rule?')) return;
    try {
      await followupApi.deleteRule(id);
      toast.success('Rule deleted');
      await load();
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleOpenSendModal = (user: DroppedUser) => {
    setSendTargetUser(user);
    setCustomFollowupMessage(
      `Hi ${user.chatName || 'there'}, we noticed you hadn't replied yet. Is there anything we can assist you with regarding your inquiry?`
    );
  };

  const handleDispatchFollowup = async () => {
    if (!sendTargetUser || !customFollowupMessage.trim()) return;
    setIsSendingFollowup(true);
    try {
      const result = await followupApi.send({
        conversationId: sendTargetUser.conversationId,
        sessionId: sendTargetUser.sessionId,
        chatId: sendTargetUser.chatId,
        message: customFollowupMessage.trim(),
      });
      if (result.success) {
        toast.success(`Follow-up sent successfully to ${sendTargetUser.chatName || sendTargetUser.chatId}`);
        setSendTargetUser(null);
        await load();
      } else {
        toast.error(`Failed: ${result.reason || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error('Failed to send follow-up: ' + (err?.message || 'Network error'));
    } finally {
      setIsSendingFollowup(false);
    }
  };

  const filteredRules = rules.filter(r => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.message.toLowerCase().includes(search.toLowerCase());
    const matchesTrigger = triggerFilter === 'all' || r.trigger === triggerFilter;
    return matchesSearch && matchesTrigger;
  });

  const filteredUsers = droppedUsers.filter(u => {
    const term = search.toLowerCase();
    return (
      (u.chatName && u.chatName.toLowerCase().includes(term)) ||
      u.chatId.toLowerCase().includes(term) ||
      u.sessionId.toLowerCase().includes(term)
    );
  });

  const formatIdle = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  };

  return (
    <div className="fr-container">
      <PageHeader
        title={t('nav.followup', 'Follow-up & Recovery')}
        subtitle="Detect dropped conversations and automatically re-engage leads before they go cold"
        action={{ label: 'New Recovery Rule', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {/* Top KPI Metrics Bar */}
      {stats && (
        <div className="fr-stats-grid">
          <div className="fr-stat-card">
            <div className="fr-stat-top">
              <div>
                <div className="fr-stat-label">Total Rules</div>
                <div className="fr-stat-value">
                  {stats.totalRules}
                </div>
              </div>
              <div className="fr-stat-icon blue">
                <Zap size={22} />
              </div>
            </div>
            <div className="fr-stat-footer">
              <span style={{ color: '#10b981', fontWeight: 700 }}>{stats.activeRules} active</span> automations running
            </div>
          </div>

          <div className="fr-stat-card">
            <div className="fr-stat-top">
              <div>
                <div className="fr-stat-label">Follow-ups Sent</div>
                <div className="fr-stat-value">
                  {stats.totalSent}
                </div>
              </div>
              <div className="fr-stat-icon purple">
                <Send size={22} />
              </div>
            </div>
            <div className="fr-stat-footer">
              Across all dropped WhatsApp leads
            </div>
          </div>

          <div className="fr-stat-card">
            <div className="fr-stat-top">
              <div>
                <div className="fr-stat-label">Users Recovered</div>
                <div className="fr-stat-value" style={{ color: '#10b981' }}>
                  {stats.totalRecovered}
                </div>
              </div>
              <div className="fr-stat-icon emerald">
                <CheckCircle2 size={22} />
              </div>
            </div>
            <div className="fr-stat-footer">
              Re-engaged into active conversations
            </div>
          </div>

          <div className="fr-stat-card">
            <div className="fr-stat-top">
              <div>
                <div className="fr-stat-label">Recovery Rate</div>
                <div className="fr-stat-value" style={{ color: '#f59e0b' }}>
                  {stats.recoveryRate}%
                </div>
              </div>
              <div className="fr-stat-icon amber">
                <TrendingUp size={22} />
              </div>
            </div>
            <div className="fr-progress-track">
              <div
                className="fr-progress-bar"
                style={{
                  width: `${Math.min(stats.recoveryRate, 100)}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #10b981)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabs and Controls */}
      <div className="fr-toolbar">
        <div className="fr-tabs-group">
          <button
            className={`fr-tab-btn ${tab === 'rules' ? 'active' : ''}`}
            onClick={() => setTab('rules')}
          >
            <Zap size={16} />
            Rules <span className="fr-tab-badge">{rules.length}</span>
          </button>
          <button
            className={`fr-tab-btn ${tab === 'dropped' ? 'active' : ''}`}
            onClick={() => setTab('dropped')}
          >
            <Clock size={16} />
            Dropped Users <span className="fr-tab-badge">{droppedUsers.length}</span>
          </button>
          <button
            className={`fr-tab-btn ${tab === 'stats' ? 'active' : ''}`}
            onClick={() => setTab('stats')}
          >
            <TrendingUp size={16} />
            Funnel Insights
          </button>
        </div>

        <div className="fr-search-bar">
          <div className="fr-search-box">
            <Search size={15} className="fr-search-icon" />
            <input
              type="text"
              className="fr-search-input"
              placeholder={tab === 'dropped' ? 'Search dropped users...' : 'Search rules...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} title="Refresh" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* TAB 1: RULES */}
      {tab === 'rules' && (
        <div>
          {/* Quick Filter Pills */}
          <div className="fr-filter-pills">
            <button
              className={`fr-filter-pill ${triggerFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTriggerFilter('all')}
            >
              All Triggers ({rules.length})
            </button>
            {Object.entries(triggerLabels).map(([key, info]) => {
              const count = rules.filter(r => r.trigger === key).length;
              return (
                <button
                  key={key}
                  className={`fr-filter-pill ${triggerFilter === key ? 'active' : ''}`}
                  onClick={() => setTriggerFilter(key)}
                >
                  <span>{info.icon}</span>
                  <span>{info.label}</span>
                  <span style={{ opacity: 0.75, fontSize: 11 }}>({count})</span>
                </button>
              );
            })}
          </div>

          {filteredRules.length === 0 ? (
            <div className="fr-empty-state">
              <div className="fr-empty-icon">⚡</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No Follow-up Rules Found</h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 20px auto', lineHeight: 1.5 }}>
                Create automated recovery rules to detect when users drop out and automatically send timely WhatsApp messages.
              </p>
              <button className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} /> Create Your First Rule
              </button>
            </div>
          ) : (
            <div className="fr-rules-list">
              {filteredRules.map(r => {
                const triggerInfo = triggerLabels[r.trigger] || { label: r.trigger, icon: '⚡', desc: '' };
                return (
                  <div key={r.id} className="fr-rule-card">
                    <div className="fr-rule-content">
                      <div className="fr-rule-header">
                        <span className="fr-rule-title">{r.name}</span>
                        <span className={`fr-status-pill ${r.enabled ? 'active' : 'paused'}`}>
                          <span className="fr-status-beacon" />
                          {r.enabled ? 'Active' : 'Paused'}
                        </span>
                        <span className="fr-trigger-tag">
                          {triggerInfo.icon} {triggerInfo.label}
                        </span>
                        <span className="fr-delay-tag">
                          <Clock size={13} /> Wait {formatIdle(r.delayMinutes)}
                        </span>
                      </div>

                      <div className="fr-rule-message-box">
                        💬 &ldquo;{r.message}&rdquo;
                      </div>

                      <div className="fr-rule-stats-bar">
                        <span>Max attempts: <strong style={{ color: 'var(--text-primary)' }}>{r.maxAttempts}</strong></span>
                        <span>Cooldown: <strong style={{ color: 'var(--text-primary)' }}>{formatIdle(r.cooldownMinutes)}</strong></span>
                        <span>Sent: <strong style={{ color: 'var(--text-primary)' }}>{r.totalSent}</strong></span>
                        <span style={{ color: '#10b981' }}>Recovered: <strong>{r.totalRecovered}</strong></span>
                        {r.totalSent > 0 && (
                          <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                            ({Math.round((r.totalRecovered / r.totalSent) * 100)}% recovery)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="fr-rule-actions">
                      <button
                        className={`btn btn-sm ${r.enabled ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => handleToggleRule(r)}
                        title={r.enabled ? 'Pause rule' : 'Activate rule'}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {r.enabled ? <Pause size={14} /> : <Play size={14} />}
                        {r.enabled ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(r)}
                        title="Edit rule"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteRule(r.id)}
                        title="Delete rule"
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
      )}

      {/* TAB 2: DROPPED USERS */}
      {tab === 'dropped' && (
        <div>
          {/* Quick Idle Filter */}
          <div className="fr-filter-pills" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginRight: 4 }}>Filter idle:</span>
            {[
              { label: 'All Idle', val: null },
              { label: '> 30m', val: 30 },
              { label: '> 1 Hour', val: 60 },
              { label: '> 4 Hours', val: 240 },
              { label: '> 24 Hours', val: 1440 },
            ].map(item => (
              <button
                key={String(item.val)}
                className={`fr-filter-pill ${idleFilter === item.val ? 'active' : ''}`}
                onClick={() => setIdleFilter(item.val)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="fr-empty-state">
              <div className="fr-empty-icon">🎉</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No Inactive Dropped Leads</h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                All conversations are currently active or resolved within normal interaction timeframes.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredUsers.map(user => {
                const isVeryIdle = user.minutesIdle > 240;
                return (
                  <div key={user.conversationId} className="fr-user-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div className={`fr-user-avatar ${isVeryIdle ? 'cold' : 'warm'}`}>
                        {(user.chatName || user.chatId).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="fr-user-name">{user.chatName || user.chatId}</span>
                          <span className={`fr-idle-pill ${isVeryIdle ? 'cold' : 'warm'}`}>
                            ⏳ {formatIdle(user.minutesIdle)} idle
                          </span>
                        </div>
                        <div className="fr-user-meta">
                          Chat ID: <code>{user.chatId}</code> &bull; Session: <code>{user.sessionId}</code> &bull; Last seen: {new Date(user.lastMessageAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleOpenSendModal(user)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <Send size={14} /> Send Recovery Message
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FUNNEL & INSIGHTS */}
      {tab === 'stats' && stats && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="fr-funnel-card">
            <h3 className="fr-funnel-title">Lead Recovery Funnel</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="fr-funnel-step">
                <div className="fr-funnel-header">
                  <span>1. Dropped / Idle Opportunities Detected</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{stats.totalSent + droppedUsers.length} Leads</strong>
                </div>
                <div className="fr-funnel-track">
                  <div className="fr-funnel-fill" style={{ width: '100%', background: '#3b82f6' }} />
                </div>
              </div>

              <div className="fr-funnel-step">
                <div className="fr-funnel-header">
                  <span>2. Automated Follow-ups Dispatched</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{stats.totalSent} Messages</strong>
                </div>
                <div className="fr-funnel-track">
                  <div
                    className="fr-funnel-fill"
                    style={{
                      width: `${stats.totalSent > 0 ? 100 : 0}%`,
                      background: '#a855f7',
                    }}
                  />
                </div>
              </div>

              <div className="fr-funnel-step">
                <div className="fr-funnel-header">
                  <span>3. Successfully Recovered Leads</span>
                  <strong style={{ color: '#10b981' }}>{stats.totalRecovered} Leads</strong>
                </div>
                <div className="fr-funnel-track">
                  <div
                    className="fr-funnel-fill"
                    style={{
                      width: `${Math.min(stats.recoveryRate, 100)}%`,
                      background: '#10b981',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="fr-funnel-card">
            <h3 className="fr-funnel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              💡 Best Practices for High WhatsApp Re-engagement
            </h3>
            <ul style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
              <li><strong style={{ color: 'var(--text-primary)' }}>Timeliness:</strong> Re-engaging within 15–60 minutes results in 4x higher recovery rates than waiting 24 hours.</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>Open-ended Questions:</strong> Ask a specific question (e.g. &ldquo;Did you prefer Option A or Option B?&rdquo;) rather than just saying &ldquo;Are you there?&rdquo;</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>Respect Quiet Hours:</strong> Ensure your cooldown is at least 12–24 hours so users are never spammed.</li>
            </ul>
          </div>
        </div>
      )}

      {/* MODAL: CREATE OR EDIT RULE */}
      {showModal && (
        <Modal
          title={editRule ? 'Edit Follow-up Rule' : 'Create Follow-up Recovery Rule'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Blueprint quick selector (only on create) */}
            {!editRule && (
              <div
                style={{
                  padding: 14,
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: 12,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={15} /> Quick-Start Blueprints
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {RULE_PRESETS.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => applyPreset(p)}
                      style={{ fontSize: 11.5 }}
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Rule Name *
              <input
                className="input"
                placeholder="e.g. 2-Hour Inactive Chat Nudge"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Trigger Type *
                <select
                  className="input"
                  value={form.trigger}
                  onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
                >
                  {Object.entries(triggerLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.icon} {v.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Delay (minutes) *
                <input
                  className="input"
                  type="number"
                  value={form.delayMinutes}
                  onChange={e => setForm(f => ({ ...f, delayMinutes: e.target.value }))}
                  min="1"
                />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Recovery Message *</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 400 }}>Variables: <code>{'{{name}}'}</code></span>
              </div>
              <textarea
                className="input"
                rows={3}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Hi {{name}}, we noticed you haven't replied..."
                style={{ resize: 'vertical' }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Max Follow-up Attempts
                <input
                  className="input"
                  type="number"
                  value={form.maxAttempts}
                  onChange={e => setForm(f => ({ ...f, maxAttempts: e.target.value }))}
                  min="1"
                  max="10"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Cooldown (minutes)
                <input
                  className="input"
                  type="number"
                  value={form.cooldownMinutes}
                  onChange={e => setForm(f => ({ ...f, cooldownMinutes: e.target.value }))}
                  min="1"
                />
              </label>
            </div>

            {/* Live WhatsApp Preview */}
            {form.message && (
              <div className="fr-preview-box">
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  WhatsApp Message Preview
                </div>
                <div className="fr-preview-bubble">
                  {form.message.replace('{{name}}', 'Priya')}
                  <div className="fr-preview-meta">
                    10:45 AM &bull; <CheckCheck size={13} style={{ display: 'inline', color: '#53bdeb' }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={savingRule}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!form.name || !form.message || savingRule}
              >
                {savingRule ? 'Saving...' : editRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: SEND FOLLOW-UP TO DROPPED USER */}
      {sendTargetUser && (
        <Modal
          title={`Send Follow-up to ${sendTargetUser.chatName || sendTargetUser.chatId}`}
          onClose={() => setSendTargetUser(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 10,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--text-primary)',
              }}
            >
              <Clock size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
              <span>
                User has been inactive for <strong>{formatIdle(sendTargetUser.minutesIdle)}</strong>. Last activity was at{' '}
                {new Date(sendTargetUser.lastMessageAt).toLocaleTimeString()}.
              </span>
            </div>

            {/* Template Buttons */}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Insert Quick Template:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FOLLOWUP_MESSAGE_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.title}
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => setCustomFollowupMessage(tpl.text)}
                  >
                    + {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Message Content *
              <textarea
                className="input"
                rows={4}
                value={customFollowupMessage}
                onChange={e => setCustomFollowupMessage(e.target.value)}
                placeholder="Type follow-up message..."
                style={{ resize: 'vertical' }}
              />
            </label>

            {/* WhatsApp Preview Bubble */}
            <div className="fr-preview-box">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                WhatsApp Outgoing Preview
              </div>
              <div className="fr-preview-bubble">
                {customFollowupMessage || '(Enter message above)'}
                <div className="fr-preview-meta">
                  Just now &bull; <CheckCheck size={13} style={{ display: 'inline', color: '#53bdeb' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setSendTargetUser(null)} disabled={isSendingFollowup}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDispatchFollowup}
                disabled={!customFollowupMessage.trim() || isSendingFollowup}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={14} />
                {isSendingFollowup ? 'Sending to WhatsApp...' : 'Send Message Now'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
