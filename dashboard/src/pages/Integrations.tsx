import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { integrationApi } from '../services/api';

interface IntegrationType {
  type: string;
  label: string;
  category: string;
  description: string;
}

interface Integration {
  id: string;
  type: string;
  name: string;
  status: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
  lastError: string | null;
  createdAt: string;
}

export function Integrations() {
  const { t } = useTranslation();
  const toast = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [types, setTypes] = useState<IntegrationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: '', name: '' });

  const load = async () => {
    try {
      const [list, t] = await Promise.all([integrationApi.list(), integrationApi.types()]);
      setIntegrations(list);
      setTypes(t);
    } catch {
      toast.error(t('common.error'));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm({ type: types[0]?.type ?? '', name: '' });
    setShowModal(true);
  };

  const handleCreate = async () => {
    try {
      await integrationApi.create({
        type: form.type,
        name: form.name || types.find(t => t.type === form.type)?.label || form.type,
      });
      setShowModal(false);
      load();
      toast.success(t('common.success'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleConnect = async (id: string) => {
    try {
      await integrationApi.connect(id);
      load();
      toast.success('Connected');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await integrationApi.disconnect(id);
      load();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await integrationApi.delete(id);
      load();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      connected: 'var(--color-success, #22c55e)',
      disconnected: 'var(--color-text-secondary)',
      error: 'var(--color-danger, #ef4444)',
      pending: 'var(--color-warning, #f59e0b)',
    };
    return (
      <span
        style={{
          padding: '0.2rem 0.6rem',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontWeight: 500,
          background: `${colors[status] || colors.disconnected}22`,
          color: colors[status] || colors.disconnected,
        }}
      >
        {status}
      </span>
    );
  };

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case 'crm':
        return 'CRM';
      case 'ecommerce':
        return 'E-Commerce';
      case 'calendar':
        return 'Calendar';
      default:
        return cat;
    }
  };

  if (loading) return <div className="page-loading">{t('common.loading')}</div>;

  const grouped = types.reduce<Record<string, IntegrationType[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="page-container">
      <PageHeader title="Integrations" subtitle="Connect your CRM, e-commerce, and calendar tools" />

      <div style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={openCreate}>
          + Add Integration
        </button>
      </div>

      {integrations.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Active Integrations</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map(i => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{types.find(t => t.type === i.type)?.label ?? i.type}</td>
                    <td>{statusBadge(i.status)}</td>
                    <td>
                      {i.status !== 'connected' ? (
                        <button className="btn btn-sm btn-primary" onClick={() => handleConnect(i.id)}>
                          Connect
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleDisconnect(i.id)}>
                          Disconnect
                        </button>
                      )}{' '}
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(i.id)}>
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 style={{ marginBottom: '0.75rem' }}>Available Integrations</h3>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{categoryLabel(cat)}</h4>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}
          >
            {items.map(typ => {
              const existing = integrations.find(i => i.type === typ.type);
              return (
                <div
                  key={typ.type}
                  style={{
                    padding: '1rem',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{typ.label}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                    {typ.description}
                  </div>
                  {existing ? (
                    statusBadge(existing.status)
                  ) : (
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => {
                        setForm({ type: typ.type, name: typ.label });
                        setShowModal(true);
                      }}
                    >
                      Setup
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {showModal && (
        <Modal title="Add Integration" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Type</label>
              <select
                className="form-input"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                {types.map(t => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Display Name</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={types.find(t => t.type === form.type)?.label}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleCreate}>
                {t('common.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
