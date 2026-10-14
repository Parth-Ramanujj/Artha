import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { syncApi } from '../services/api';

interface SyncConfig {
  id: string;
  provider: string;
  name: string;
  direction: string;
  status: string;
  dataType: string;
  syncedCount: number;
  errorCount: number;
  lastError: string | null;
  lastSyncAt: string | null;
  enabled: boolean;
  createdAt: string;
}

interface SyncProvider {
  provider: string;
  label: string;
  dataTypes: string[];
  description: string;
}

const statusBadge = (status: string) => {
  const colors: Record<string, string> = { active: '#22c55e', paused: '#f59e0b', error: '#ef4444' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: `${colors[status] || '#6b7280'}20`,
        color: colors[status] || '#6b7280',
      }}
    >
      {status}
    </span>
  );
};

export function SyncManager() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [providers, setProviders] = useState<SyncProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ provider: '', name: '', direction: 'push', dataType: 'contacts' });

  const load = async () => {
    try {
      const [c, p] = await Promise.all([syncApi.list(), syncApi.providers()]);
      setConfigs(c);
      setProviders(p);
    } catch {
      addToast('Failed to load sync configs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    try {
      await syncApi.create(form);
      addToast('Sync config created', 'success');
      setShowModal(false);
      setForm({ provider: '', name: '', direction: 'push', dataType: 'contacts' });
      await load();
    } catch {
      addToast('Failed to create sync config', 'error');
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      await syncApi.trigger(id);
      addToast('Sync triggered', 'success');
      await load();
    } catch (e: unknown) {
      addToast(`Sync failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await syncApi.delete(id);
      addToast('Sync config deleted', 'success');
      await load();
    } catch {
      addToast('Failed to delete', 'error');
    }
  };

  const selectedProvider = providers.find(p => p.provider === form.provider);

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000 }}>
      <PageHeader
        title={t('nav.sync')}
        subtitle="Real-time sync with Google Sheets, CRM & external systems"
        action={{ label: 'New Sync Config', onClick: () => setShowModal(true) }}
      />

      <h3 style={{ marginBottom: 12 }}>Available Providers</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 32,
        }}
      >
        {providers.map(p => (
          <div
            key={p.provider}
            style={{
              padding: 16,
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.label}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{p.description}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              Data: {p.dataTypes.join(', ')}
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ marginBottom: 12 }}>Sync Configurations</h3>
      {configs.length === 0 ? (
        <div className="empty-state">
          <p>No sync configurations yet.</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Create a sync config to start syncing contacts, conversations or leads with external systems.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {configs.map(c => (
            <div
              key={c.id}
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
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  {statusBadge(c.status)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {c.provider} &bull; {c.direction} &bull; {c.dataType} &bull; {c.syncedCount} synced
                </div>
                {c.lastSyncAt && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Last sync: {new Date(c.lastSyncAt).toLocaleString()}
                  </div>
                )}
                {c.lastError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>{c.lastError}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => handleTrigger(c.id)} disabled={!c.enabled}>
                  Sync Now
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="Create Sync Configuration" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              Provider *
              <select
                className="input"
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
              >
                <option value="">Select provider...</option>
                {providers.map(p => (
                  <option key={p.provider} value={p.provider}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name *
              <input
                className="input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Contacts to Google Sheets"
              />
            </label>
            <label>
              Direction
              <select
                className="input"
                value={form.direction}
                onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
              >
                <option value="push">Push (to external)</option>
                <option value="pull">Pull (from external)</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </label>
            <label>
              Data Type
              <select
                className="input"
                value={form.dataType}
                onChange={e => setForm(f => ({ ...f, dataType: e.target.value }))}
              >
                {(selectedProvider?.dataTypes || ['contacts', 'conversations', 'leads']).map(dt => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!form.provider || !form.name}>
                {t('common.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
