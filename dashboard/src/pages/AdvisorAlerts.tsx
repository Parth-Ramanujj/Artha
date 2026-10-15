import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Plus,
  Send,
  Trash2,
  Users,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { advisorAlertApi } from '../services/api';

interface Advisor {
  sessionId: string;
  advisorChatId: string;
  advisorName?: string;
}

export function AdvisorAlerts() {
  const { t } = useTranslation();
  const toast = useToast();
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({ sessionId: 'padosi', advisorChatId: '', advisorName: '' });

  const load = async () => {
    try {
      const data = await advisorAlertApi.list();
      setAdvisors(data);
    } catch {
      toast.error('Failed to load advisors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setForm({ sessionId: 'padosi', advisorChatId: '', advisorName: '' });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.advisorChatId.trim()) {
      toast.warning('Validation', 'Advisor WhatsApp Phone is required');
      return;
    }

    // Clean phone number format
    let cleanChat = form.advisorChatId.trim();
    if (!cleanChat.includes('@')) {
      cleanChat = cleanChat.replace(/[^0-9]/g, '');
      if (cleanChat.length >= 10) cleanChat += '@c.us';
    }

    try {
      await advisorAlertApi.register({
        ...form,
        advisorChatId: cleanChat,
        advisorName: form.advisorName.trim() || 'Advisor',
      });
      toast.success('Registered', 'Advisor registered for instant WhatsApp alerts');
      setShowModal(false);
      setForm({ sessionId: 'padosi', advisorChatId: '', advisorName: '' });
      await load();
    } catch {
      toast.error('Error', 'Failed to register advisor');
    }
  };

  const handleRemove = async (chatId: string) => {
    if (!confirm('Remove this advisor from alert broadcasts?')) return;
    try {
      await advisorAlertApi.unregister(chatId);
      toast.success('Removed', 'Advisor unsubscribed from alerts');
      await load();
    } catch {
      toast.error('Error', 'Failed to remove advisor');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await advisorAlertApi.test();
      toast.success('Alert Dispatched', `Test alert sent to ${result.advisorCount} registered advisor(s)`);
    } catch {
      toast.error('Error', 'Failed to send test alert');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1080, margin: '0 auto' }}>
      <PageHeader
        title={t('nav.advisorAlerts', 'Advisor & Escalation Alerts')}
        subtitle="Dispatch instant WhatsApp notifications to senior advisors and managers when VIP leads or high-priority chats arrive"
        icon={<Bell size={24} />}
        action={{ label: 'Register Advisor', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {/* Top Stats Overview */}
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
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
            }}
          >
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Registered Advisors</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{advisors.length}</div>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(34, 197, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22c55e',
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Broadcast Channel</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Active WhatsApp</div>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Escalation Protocol</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Instant Push</div>
          </div>
        </div>
      </div>

      {/* Broadcast Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Active Alert Recipients ({advisors.length})</div>
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={advisors.length === 0 || testing}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Send size={14} className={testing ? 'animate-spin' : ''} />
          {testing ? 'Sending...' : 'Dispatch Test Alert Broadcast'}
        </button>
      </div>

      {advisors.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px dashed var(--border)',
          }}
        >
          <Bell size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No advisors registered yet</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 450, margin: '0 auto 16px' }}>
            Register your WhatsApp number to receive immediate alert messages whenever new customer leads, insurance inquiries, or escalations arrive.
          </p>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Register First Advisor
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {advisors.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 16,
                background: 'var(--bg-secondary)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {(a.advisorName || 'A').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{a.advisorName || 'Senior Advisor'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: 2 }}>
                    {a.advisorChatId}
                  </div>
                </div>
              </div>

              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleRemove(a.advisorChatId)}
                style={{ padding: '4px 8px' }}
                title="Remove Advisor"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Register Advisor */}
      {showModal && (
        <Modal title="Register Advisor for WhatsApp Alerts" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Advisor Name
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Parth Ramanuj (Senior Advisor)"
                value={form.advisorName}
                onChange={e => setForm(f => ({ ...f, advisorName: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Advisor WhatsApp Phone Number *
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. 919227102108"
                value={form.advisorChatId}
                onChange={e => setForm(f => ({ ...f, advisorChatId: e.target.value }))}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                Enter country code without + (e.g. 919876543210). High-priority alert messages will be sent directly to this WhatsApp number.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!form.advisorChatId.trim()}
              >
                Register for Alerts
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
