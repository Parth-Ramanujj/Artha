import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { slaPolicyApi, slaEventApi } from '../services/api';

interface SlaPolicy {
  id: string;
  name: string;
  description: string | null;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  conditions: Record<string, unknown> | null;
  priority: number;
  enabled: boolean;
  createdAt: string;
}

interface SlaEvent {
  id: string;
  conversationId: string;
  type: string;
  targetMinutes: number | null;
  actualMinutes: number | null;
  createdAt: string;
}

interface SlaStats {
  total: number;
  breaches: number;
  met: number;
  complianceRate: number;
}

export function SlaTracking() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [events, setEvents] = useState<SlaEvent[]>([]);
  const [stats, setStats] = useState<SlaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPolicy, setEditPolicy] = useState<SlaPolicy | null>(null);
  const [tab, setTab] = useState<'policies' | 'events'>('policies');
  const [form, setForm] = useState({
    name: '',
    description: '',
    firstResponseMinutes: '15',
    resolutionMinutes: '60',
    priority: '0',
  });

  const load = async () => {
    try {
      const [p, e, s] = await Promise.all([slaPolicyApi.list(), slaEventApi.list(), slaEventApi.stats()]);
      setPolicies(p);
      setEvents(e);
      setStats(s);
    } catch {
      addToast(t('common.error'), 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditPolicy(null);
    setForm({ name: '', description: '', firstResponseMinutes: '15', resolutionMinutes: '60', priority: '0' });
    setShowModal(true);
  };

  const openEdit = (p: SlaPolicy) => {
    setEditPolicy(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      firstResponseMinutes: String(p.firstResponseMinutes),
      resolutionMinutes: String(p.resolutionMinutes),
      priority: String(p.priority),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        name: form.name,
        description: form.description || undefined,
        firstResponseMinutes: parseInt(form.firstResponseMinutes, 10),
        resolutionMinutes: parseInt(form.resolutionMinutes, 10),
        priority: parseInt(form.priority, 10),
      };
      if (editPolicy) {
        await slaPolicyApi.update(editPolicy.id, data);
      } else {
        await slaPolicyApi.create(data);
      }
      setShowModal(false);
      load();
      addToast(t('common.success'), 'success');
    } catch {
      addToast(t('common.error'), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await slaPolicyApi.delete(id);
      load();
    } catch {
      addToast(t('common.error'), 'error');
    }
  };

  const handleToggle = async (p: SlaPolicy) => {
    try {
      await slaPolicyApi.update(p.id, { enabled: !p.enabled });
      load();
    } catch {
      addToast(t('common.error'), 'error');
    }
  };

  if (loading) return <div className="page-loading">{t('common.loading')}</div>;

  return (
    <div className="page-container">
      <PageHeader title="SLA Tracking" subtitle="Monitor response times and SLA compliance" />

      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            className="stat-card"
            style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Total Events</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.total}</div>
          </div>
          <div
            className="stat-card"
            style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Met</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-success, #22c55e)' }}>
              {stats.met}
            </div>
          </div>
          <div
            className="stat-card"
            style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Breaches</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-danger, #ef4444)' }}>
              {stats.breaches}
            </div>
          </div>
          <div
            className="stat-card"
            style={{ padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Compliance</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.complianceRate}%</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          className={`btn ${tab === 'policies' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('policies')}
        >
          Policies
        </button>
        <button
          className={`btn ${tab === 'events' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('events')}
        >
          Events
        </button>
      </div>

      {tab === 'policies' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <button className="btn btn-primary" onClick={openCreate}>
              + Add Policy
            </button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>First Response</th>
                  <th>Resolution</th>
                  <th>Priority</th>
                  <th>Enabled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center' }}>
                      No SLA policies yet
                    </td>
                  </tr>
                ) : (
                  policies.map(p => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.firstResponseMinutes} min</td>
                      <td>{p.resolutionMinutes} min</td>
                      <td>{p.priority}</td>
                      <td>
                        <button
                          className={`btn btn-sm ${p.enabled ? 'btn-success' : 'btn-secondary'}`}
                          onClick={() => handleToggle(p)}
                        >
                          {p.enabled ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(p)}>
                          Edit
                        </button>{' '}
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'events' && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Conversation</th>
                <th>Target</th>
                <th>Actual</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>
                    No SLA events yet
                  </td>
                </tr>
              ) : (
                events.map(e => (
                  <tr key={e.id}>
                    <td>
                      <span
                        style={{
                          color: e.type.includes('breached')
                            ? 'var(--color-danger, #ef4444)'
                            : 'var(--color-success, #22c55e)',
                        }}
                      >
                        {e.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>{e.conversationId.slice(0, 8)}...</td>
                    <td>{e.targetMinutes != null ? `${e.targetMinutes} min` : '—'}</td>
                    <td>{e.actualMinutes != null ? `${e.actualMinutes} min` : '—'}</td>
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editPolicy ? 'Edit SLA Policy' : 'Create SLA Policy'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea
                className="form-input"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">First Response (min)</label>
                <input
                  className="form-input"
                  type="number"
                  value={form.firstResponseMinutes}
                  onChange={e => setForm({ ...form, firstResponseMinutes: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label">Resolution (min)</label>
                <input
                  className="form-input"
                  type="number"
                  value={form.resolutionMinutes}
                  onChange={e => setForm({ ...form, resolutionMinutes: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <input
                className="form-input"
                type="number"
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editPolicy ? 'Update' : t('common.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
