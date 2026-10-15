import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  Search,
} from 'lucide-react';
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
  const toast = useToast();
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [events, setEvents] = useState<SlaEvent[]>([]);
  const [stats, setStats] = useState<SlaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPolicy, setEditPolicy] = useState<SlaPolicy | null>(null);
  const [tab, setTab] = useState<'policies' | 'events'>('policies');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    firstResponseMinutes: '15',
    resolutionMinutes: '60',
    priority: '1',
  });

  const load = async () => {
    try {
      const [p, e, s] = await Promise.all([slaPolicyApi.list(), slaEventApi.list(), slaEventApi.stats()]);
      setPolicies(p as SlaPolicy[]);
      setEvents(e as SlaEvent[]);
      setStats(s);
    } catch {
      toast.error('Failed to load SLA data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = (presetName?: string, firstM = '15', resM = '60') => {
    setEditPolicy(null);
    setForm({
      name: presetName || '',
      description: presetName ? `SLA commitment for ${presetName}` : '',
      firstResponseMinutes: firstM,
      resolutionMinutes: resM,
      priority: String(policies.length + 1),
    });
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
    if (!form.name.trim()) {
      toast.warning('Validation', 'Policy name is required');
      return;
    }

    try {
      const data = {
        name: form.name.trim(),
        description: form.description || undefined,
        firstResponseMinutes: parseInt(form.firstResponseMinutes, 10) || 15,
        resolutionMinutes: parseInt(form.resolutionMinutes, 10) || 60,
        priority: parseInt(form.priority, 10) || 1,
      };

      if (editPolicy) {
        await slaPolicyApi.update(editPolicy.id, data);
        toast.success('Updated', 'SLA policy updated');
      } else {
        await slaPolicyApi.create(data);
        toast.success('Created', 'New SLA policy active');
      }
      setShowModal(false);
      await load();
    } catch {
      toast.error('Error', 'Failed to save SLA policy');
    }
  };

  const handleToggle = async (p: SlaPolicy) => {
    try {
      await slaPolicyApi.update(p.id, { enabled: !p.enabled });
      toast.info('Toggled', `Policy "${p.name}" is now ${!p.enabled ? 'Enabled' : 'Paused'}`);
      await load();
    } catch {
      toast.error('Error', 'Failed to toggle policy');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete SLA policy "${name}"?`)) return;
    try {
      await slaPolicyApi.delete(id);
      toast.success('Deleted', 'Policy removed');
      await load();
    } catch {
      toast.error('Error', 'Failed to delete');
    }
  };

  const filteredPolicies = useMemo(() => {
    return policies.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [policies, search]);

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1140, margin: '0 auto' }}>
      <PageHeader
        title="Service Level Agreement (SLA) Tracking"
        subtitle="Enforce first-response deadlines and ticket resolution time commitments for WhatsApp conversations"
        icon={<ShieldCheck size={24} />}
        action={{ label: 'New SLA Policy', onClick: () => openCreate(), icon: <Plus size={16} /> }}
      />

      {/* Top Health Overview */}
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
                background: 'rgba(34, 197, 94, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22c55e',
              }}
            >
              <TrendingUp size={26} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>SLA Compliance Rate</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: stats.complianceRate >= 90 ? '#22c55e' : '#f59e0b' }}>
                {stats.complianceRate}%
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
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
              }}
            >
              <CheckCircle2 size={26} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Target Met Deadlines</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{stats.met}</div>
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
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
              }}
            >
              <AlertTriangle size={26} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>SLA Breaches</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: stats.breaches > 0 ? '#ef4444' : 'inherit' }}>
                {stats.breaches}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs & Search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${tab === 'policies' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('policies')}
          >
            SLA Policies ({policies.length})
          </button>
          <button
            className={`btn ${tab === 'events' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('events')}
          >
            Audit & Breach Events ({events.length})
          </button>
        </div>

        {tab === 'policies' && (
          <div style={{ position: 'relative', width: 240 }}>
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
              placeholder="Search SLA policies..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
        )}
      </div>

      {tab === 'policies' && (
        <div>
          {/* Quick SLA Tiers */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Standard SLA Tiers:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { name: 'Urgent Claim Assistance', firstM: '5', resM: '30' },
                { name: 'Term Insurance Inquiries', firstM: '15', resM: '60' },
                { name: 'General Support Desk', firstM: '30', resM: '120' },
              ].map(tier => (
                <button
                  key={tier.name}
                  className="btn btn-secondary btn-sm"
                  onClick={() => openCreate(tier.name, tier.firstM, tier.resM)}
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={12} /> {tier.name} ({tier.firstM}m / {tier.resM}m)
                </button>
              ))}
            </div>
          </div>

          {filteredPolicies.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                background: 'var(--bg-secondary)',
                borderRadius: 12,
                border: '1px dashed var(--border)',
              }}
            >
              <ShieldCheck size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No SLA policies configured</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 450, margin: '0 auto 16px' }}>
                Set up response time expectations to ensure insurance and customer inquiries are responded to on time.
              </p>
              <button className="btn btn-primary" onClick={() => openCreate()}>
                <Plus size={16} /> Create SLA Policy
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {filteredPolicies.map(p => (
                <div
                  key={p.id}
                  style={{
                    padding: 18,
                    background: 'var(--bg-secondary)',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    opacity: p.enabled ? 1 : 0.65,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 8, background: 'var(--border)', fontWeight: 700 }}>
                            P{p.priority}
                          </span>
                        </div>
                        {p.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                            {p.description}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleToggle(p)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                        title={p.enabled ? 'Click to Pause' : 'Click to Enable'}
                      >
                        {p.enabled ? <ToggleRight size={28} color="#22c55e" /> : <ToggleLeft size={28} color="var(--text-secondary)" />}
                      </button>
                    </div>

                    {/* Deadline Badges */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0' }}>
                      <div
                        style={{
                          padding: 10,
                          background: 'var(--bg-tertiary, #f8fafc)',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>First Response Target</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#2563eb', marginTop: 2 }}>
                          {p.firstResponseMinutes} mins
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 10,
                          background: 'var(--bg-tertiary, #f8fafc)',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Resolution Target</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>
                          {p.resolutionMinutes} mins
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 12,
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 12, color: p.enabled ? '#22c55e' : 'var(--text-secondary)', fontWeight: 600 }}>
                      {p.enabled ? '● Policy Active' : '○ Policy Paused'}
                    </span>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openEdit(p)}
                        style={{ padding: '4px 8px' }}
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(p.id, p.name)}
                        style={{ padding: '4px 8px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Event Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Target (Deadline)</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Actual Time</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Outcome</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Recorded At</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No SLA events recorded yet. Once conversations arrive and agents respond, deadlines will be logged here.
                  </td>
                </tr>
              ) : (
                events.map(ev => {
                  const isBreach = ev.actualMinutes && ev.targetMinutes ? ev.actualMinutes > ev.targetMinutes : false;
                  return (
                    <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, textTransform: 'capitalize' }}>
                        {ev.type.replace('_', ' ')}
                      </td>
                      <td style={{ padding: '10px 14px' }}>{ev.targetMinutes || 15} mins</td>
                      <td style={{ padding: '10px 14px' }}>{ev.actualMinutes || 8} mins</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: isBreach ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                            color: isBreach ? '#ef4444' : '#22c55e',
                            fontWeight: 600,
                          }}
                        >
                          {isBreach ? '⚠ Breached' : '✓ Met Target'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {new Date(ev.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create / Edit Policy */}
      {showModal && (
        <Modal title={editPolicy ? 'Edit SLA Policy' : 'Create SLA Policy'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Policy Name *
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Urgent Mediclaim Claim Response"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Description
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. For urgent emergency hospital admission inquiries"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                  First Response Target (Minutes) *
                </label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  style={{ width: '100%' }}
                  value={form.firstResponseMinutes}
                  onChange={e => setForm(f => ({ ...f, firstResponseMinutes: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                  Resolution Target (Minutes) *
                </label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  style={{ width: '100%' }}
                  value={form.resolutionMinutes}
                  onChange={e => setForm(f => ({ ...f, resolutionMinutes: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Priority Level (1 = Top Urgency)
              </label>
              <input
                type="number"
                min={1}
                max={99}
                className="input"
                style={{ width: '100%' }}
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
                {editPolicy ? 'Update Policy' : 'Save & Activate'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
