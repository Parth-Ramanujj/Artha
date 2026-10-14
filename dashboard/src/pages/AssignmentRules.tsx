import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Edit2, Trash2, UserCheck, ToggleLeft, ToggleRight } from 'lucide-react';
import { assignmentRuleApi, type AssignmentRule } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

const strategyLabels: Record<string, string> = {
  round_robin: 'Round Robin',
  least_active: 'Least Active',
  manual: 'Manual',
};

export function AssignmentRules() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<AssignmentRule | null>(null);
  const [form, setForm] = useState({ name: '', strategy: 'round_robin', agents: '', priority: 0 });

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

  const openCreate = () => {
    setEditItem(null);
    setForm({ name: '', strategy: 'round_robin', agents: '', priority: 0 });
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
    try {
      const agents = form.agents
        .split(',')
        .map(a => a.trim())
        .filter(Boolean);
      if (editItem) {
        await assignmentRuleApi.update(editItem.id, {
          name: form.name,
          strategy: form.strategy as any,
          agents,
          priority: form.priority,
        });
        toast.success('Success', 'Rule updated');
      } else {
        await assignmentRuleApi.create({ name: form.name, strategy: form.strategy, agents, priority: form.priority });
        toast.success('Success', 'Rule created');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed');
    }
  };

  const handleToggle = async (rule: AssignmentRule) => {
    try {
      await assignmentRuleApi.update(rule.id, { enabled: !rule.enabled });
      load();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await assignmentRuleApi.delete(id);
      toast.success('Success', 'Deleted');
      load();
    } catch (err: any) {
      toast.error('Error', err?.message || 'Failed');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('assignmentRules.title', 'Assignment Rules')}
        subtitle={t('assignmentRules.subtitle', 'Auto-assign conversations to agents')}
        icon={<UserCheck size={24} />}
        action={{ label: t('common.create', 'Create'), onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>No assignment rules yet</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rules.map(rule => (
            <div
              key={rule.id}
              style={{
                padding: 16,
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: 'var(--color-bg-secondary)',
                opacity: rule.enabled ? 1 : 0.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {rule.name}
                    <span
                      style={{
                        background: 'var(--color-info)',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    >
                      {strategyLabels[rule.strategy] || rule.strategy}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
                    Agents: {rule.agents?.join(', ') || 'None'} · Priority: {rule.priority}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button
                    onClick={() => handleToggle(rule)}
                    title={rule.enabled ? 'Disable' : 'Enable'}
                    style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    {rule.enabled ? <ToggleRight size={20} color="var(--color-success)" /> : <ToggleLeft size={20} />}
                  </button>
                  <button
                    onClick={() => openEdit(rule)}
                    style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    style={{
                      padding: 6,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-danger)',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editItem ? 'Edit Rule' : 'Create Rule'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="Rule name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <select
              value={form.strategy}
              onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            >
              <option value="round_robin">Round Robin</option>
              <option value="least_active">Least Active</option>
              <option value="manual">Manual</option>
            </select>
            <input
              placeholder="Agent IDs (comma-separated)"
              value={form.agents}
              onChange={e => setForm(f => ({ ...f, agents: e.target.value }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <input
              type="number"
              placeholder="Priority"
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value, 10) || 0 }))}
              style={{ padding: 8, border: '1px solid var(--color-border)', borderRadius: 6 }}
            />
            <button
              onClick={handleSave}
              style={{
                padding: '10px 20px',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {editItem ? 'Update' : 'Create'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
