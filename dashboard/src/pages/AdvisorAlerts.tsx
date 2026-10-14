import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { addToast } = useToast();
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ sessionId: '', advisorChatId: '', advisorName: '' });

  const load = async () => {
    try {
      const data = await advisorAlertApi.list();
      setAdvisors(data);
    } catch {
      addToast('Failed to load advisors', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSubmit = async () => {
    try {
      await advisorAlertApi.register(form);
      addToast('Advisor registered for alerts', 'success');
      setShowModal(false);
      setForm({ sessionId: '', advisorChatId: '', advisorName: '' });
      await load();
    } catch {
      addToast('Failed to register advisor', 'error');
    }
  };

  const handleRemove = async (chatId: string) => {
    try {
      await advisorAlertApi.unregister(chatId);
      addToast('Advisor removed', 'success');
      await load();
    } catch {
      addToast('Failed to remove advisor', 'error');
    }
  };

  const handleTest = async () => {
    try {
      const result = await advisorAlertApi.test();
      addToast(`Test alert sent to ${result.advisorCount} advisors`, 'success');
    } catch {
      addToast('Failed to send test alert', 'error');
    }
  };

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      <PageHeader
        title={t('nav.advisorAlerts')}
        subtitle="Get instant WhatsApp alerts when conversations are assigned"
        action={{ label: 'Register Advisor', onClick: () => setShowModal(true) }}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-secondary" onClick={handleTest} disabled={advisors.length === 0}>
          Send Test Alert
        </button>
      </div>

      {advisors.length === 0 ? (
        <div className="empty-state">
          <p>No advisors registered for alerts yet.</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Register an advisor to receive instant WhatsApp messages when conversations are assigned.
          </p>
        </div>
      ) : (
        <div className="card-list">
          {advisors.map((a, i) => (
            <div
              key={i}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 16,
                marginBottom: 8,
                background: 'var(--bg-secondary)',
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{a.advisorName || a.advisorChatId}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Session: {a.sessionId} &bull; Chat ID: {a.advisorChatId}
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleRemove(a.advisorChatId)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="Register Advisor for Alerts" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              Session ID *
              <input
                className="input"
                value={form.sessionId}
                onChange={e => setForm(f => ({ ...f, sessionId: e.target.value }))}
                placeholder="WhatsApp session ID"
              />
            </label>
            <label>
              Advisor Chat ID (WhatsApp number) *
              <input
                className="input"
                value={form.advisorChatId}
                onChange={e => setForm(f => ({ ...f, advisorChatId: e.target.value }))}
                placeholder="e.g. 919876543210@c.us"
              />
            </label>
            <label>
              Advisor Name
              <input
                className="input"
                value={form.advisorName}
                onChange={e => setForm(f => ({ ...f, advisorName: e.target.value }))}
                placeholder="Optional display name"
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!form.sessionId || !form.advisorChatId}
              >
                Register
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
