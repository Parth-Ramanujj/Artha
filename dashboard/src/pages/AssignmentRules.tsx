import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  ToggleLeft,
  ToggleRight,
  Users,
  Shuffle,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { assignmentRuleApi, type AssignmentRule } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

const strategyDetails: Record<string, { label: string; desc: string; icon: string }> = {
  round_robin: {
    label: 'Round Robin',
    desc: 'Distributes incoming WhatsApp leads equally across active agents in a circle',
    icon: '🔄',
  },
  least_active: {
    label: 'Least Active (Load Balanced)',
    desc: 'Routes to the agent who currently has the fewest open WhatsApp conversations',
    icon: '⚖️',
  },
  manual: {
    label: 'Manual Queue Triage',
    desc: 'Leaves leads unassigned in queue for supervisor manual pickup',
    icon: '👤',
  },
};

export function AssignmentRules() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<AssignmentRule | null>(null);
  const [form, setForm] = useState({ name: '', strategy: 'round_robin', agents: '', priority: 1 });

  const load = () => {
    setLoading(true);
    assignmentRuleApi
      .list()
      .then(setRules)
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = (presetName?: string, presetStrategy?: string, presetAgents?: string) => {
    setEditItem(null);
    setForm({
      name: presetName || '',
      strategy: presetStrategy || 'round_robin',
      agents: presetAgents || '',
      priority: rules.length + 1,
    });
    setShowModal(true);
  };

  const openEdit = (rule: AssignmentRule) => {
    setEditItem(rule);
    setForm({
      name: rule.name,
      strategy: rule.strategy,
      agents: rule.agents?.join(', ') || '',
      priority: rule.priority,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.warning('Validation', 'Rule name is required');
      return;
    }

    try {
      const agents = form.agents
        .split(',')
        .map(a => a.trim())
        .filter(Boolean);

      if (editItem) {
        await assignmentRuleApi.update(editItem.id, {
          name: form.name.trim(),
          strategy: form.strategy as AssignmentRule['strategy'],
          agents,
          priority: Number(form.priority) || 1,
        });
        toast.success('Updated', 'Assignment rule updated');
      } else {
        await assignmentRuleApi.create({
          name: form.name.trim(),
          strategy: form.strategy,
          agents,
          priority: Number(form.priority) || 1,
        });
        toast.success('Created', 'New assignment rule created');
      }
      setShowModal(false);
      load();
    } catch (err: unknown) {
      toast.error('Save Failed', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleToggle = async (rule: AssignmentRule) => {
    try {
      await assignmentRuleApi.update(rule.id, { enabled: !rule.enabled });
      toast.info('Rule Toggled', `Rule "${rule.name}" is now ${!rule.enabled ? 'Enabled' : 'Paused'}`);
      load();
    } catch (err: unknown) {
      toast.error('Error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete assignment rule "${name}"?`)) return;
    try {
      await assignmentRuleApi.delete(id);
      toast.success('Deleted', 'Rule removed');
      load();
    } catch (err: unknown) {
      toast.error('Error', err instanceof Error ? err.message : 'Failed');
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [rules, search]);

  const activeCount = rules.filter(r => r.enabled).length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1140, margin: '0 auto' }}>
      <PageHeader
        title={t('assignmentRules.title', 'Lead Routing & Agent Assignment')}
        subtitle={t('assignmentRules.subtitle', 'Automatic distribution of incoming WhatsApp leads and customer conversations')}
        icon={<UserCheck size={24} />}
        action={{ label: 'New Routing Rule', onClick: () => openCreate(), icon: <Plus size={16} /> }}
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
            <Shuffle size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Routing Rules</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{rules.length}</div>
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
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Active Policies</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{activeCount}</div>
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
              background: 'rgba(168, 85, 247, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a855f7',
            }}
          >
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Routing Algorithms</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Round Robin / Load Balanced</div>
          </div>
        </div>
      </div>

      {/* Recommended Presets */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Quick-Start Routing Templates:
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { name: 'Insurance Specialists Round-Robin', strat: 'round_robin', agents: 'Parth Ramanuj, Abhishek Chhag' },
            { name: 'Claims Support Load-Balanced', strat: 'least_active', agents: 'Claims Officer 1, Claims Officer 2' },
            { name: 'Mutual Fund SIP Inquiries', strat: 'round_robin', agents: 'SIP Advisor, Financial Consultant' },
          ].map(p => (
            <button
              key={p.name}
              className="btn btn-secondary btn-sm"
              onClick={() => openCreate(p.name, p.strat, p.agents)}
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={12} /> {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
          />
          <input
            type="text"
            className="input"
            placeholder="Search routing rules..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 32, fontSize: 13, height: 36 }}
          />
        </div>
      </div>

      {/* Rules List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
          <Loader2 className="animate-spin" size={28} color="var(--primary)" />
        </div>
      ) : filteredRules.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 50,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px dashed var(--border)',
          }}
        >
          <UserCheck size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No routing rules configured</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 460, margin: '0 auto 16px' }}>
            Set up automatic rules to route incoming WhatsApp customers to agents using Round-Robin or Least-Active load balancing.
          </p>
          <button className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={16} /> Create First Rule
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
          {filteredRules.map(rule => {
            const strat = strategyDetails[rule.strategy] || strategyDetails.round_robin;

            return (
              <div
                key={rule.id}
                style={{
                  padding: 18,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  opacity: rule.enabled ? 1 : 0.65,
                  transition: 'opacity 0.2s',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{rule.name}</span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: 'var(--border)',
                            fontWeight: 700,
                          }}
                        >
                          P{rule.priority}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Algorithm: <strong>{strat.label}</strong> {strat.icon}
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggle(rule)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                      title={rule.enabled ? 'Click to Pause' : 'Click to Enable'}
                    >
                      {rule.enabled ? (
                        <ToggleRight size={28} color="#22c55e" />
                      ) : (
                        <ToggleLeft size={28} color="var(--text-secondary)" />
                      )}
                    </button>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 12 }}>
                    {strat.desc}
                  </div>

                  {/* Agent Pool Tags */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Target Agent Pool ({rule.agents?.length || 0}):
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {rule.agents && rule.agents.length > 0 ? (
                        rule.agents.map(ag => (
                          <span
                            key={ag}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: 'var(--border)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Users size={10} /> {ag}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          All Available Online Agents
                        </span>
                      )}
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
                    marginTop: 14,
                  }}
                >
                  <span style={{ fontSize: 12, color: rule.enabled ? '#22c55e' : 'var(--text-secondary)', fontWeight: 600 }}>
                    {rule.enabled ? '● Active Rule' : '○ Paused'}
                  </span>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => openEdit(rule)}
                      style={{ padding: '4px 8px' }}
                    >
                      <Edit2 size={13} /> Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(rule.id, rule.name)}
                      style={{ padding: '4px 8px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Rule */}
      {showModal && (
        <Modal
          title={editItem ? 'Edit Assignment Rule' : 'Create Assignment Rule'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Rule Name *
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Inbound Term Insurance Routing"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                  Distribution Algorithm
                </label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={form.strategy}
                  onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))}
                >
                  <option value="round_robin">🔄 Round Robin (Equal Circular)</option>
                  <option value="least_active">⚖️ Least Active (Load Balanced)</option>
                  <option value="manual">👤 Manual Queue Triage</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                  Priority Order (1 = Highest)
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="input"
                  style={{ width: '100%' }}
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>
                Agent Names / User IDs (comma-separated)
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Parth Ramanuj, Abhishek Chhag, Support Agent 1"
                value={form.agents}
                onChange={e => setForm(f => ({ ...f, agents: e.target.value }))}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                Only these specified agents will receive leads from this routing rule. Leave empty to distribute among all online agents.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
                {editItem ? 'Update Rule' : 'Save & Activate'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
