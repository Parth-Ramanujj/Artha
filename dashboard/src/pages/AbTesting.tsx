import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { abTestApi } from '../services/api';

interface Variant {
  id: string;
  name: string;
  weight: number;
  content: Record<string, unknown>;
}

interface AbTest {
  id: string;
  name: string;
  description: string | null;
  status: string;
  variants: Variant[];
  results: Record<string, { sent: number; delivered: number; replied: number }> | null;
  winningVariantId: string | null;
  sampleSize: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export function AbTesting() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tests, setTests] = useState<AbTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTest, setEditTest] = useState<AbTest | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    sampleSize: '100',
    variants: [
      { id: 'a', name: 'Variant A', weight: 50, content: { message: '' } },
      { id: 'b', name: 'Variant B', weight: 50, content: { message: '' } },
    ] as Variant[],
  });

  const load = async () => {
    try {
      const data = await abTestApi.list();
      setTests(data);
    } catch {
      toast.error(t('common.error'));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditTest(null);
    setForm({
      name: '',
      description: '',
      sampleSize: '100',
      variants: [
        { id: 'a', name: 'Variant A', weight: 50, content: { message: '' } },
        { id: 'b', name: 'Variant B', weight: 50, content: { message: '' } },
      ],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        name: form.name,
        description: form.description || undefined,
        sampleSize: parseInt(form.sampleSize, 10),
        variants: form.variants,
      };
      if (editTest) {
        await abTestApi.update(editTest.id, data);
      } else {
        await abTestApi.create(data);
      }
      setShowModal(false);
      load();
      toast.success(t('common.success'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleStart = async (id: string) => {
    try {
      await abTestApi.start(id);
      load();
      toast.success('Test started');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await abTestApi.complete(id);
      load();
      toast.success('Test completed');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await abTestApi.delete(id);
      load();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const updateVariant = (idx: number, field: keyof Variant, value: string | number) => {
    const updated = [...form.variants];
    if (field === 'weight') {
      updated[idx] = { ...updated[idx], weight: Number(value) };
    } else if (field === 'name') {
      updated[idx] = { ...updated[idx], name: String(value) };
    } else if (field === 'content') {
      updated[idx] = { ...updated[idx], content: { message: String(value) } };
    }
    setForm({ ...form, variants: updated });
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'running':
        return 'var(--color-info, #3b82f6)';
      case 'completed':
        return 'var(--color-success, #22c55e)';
      case 'paused':
        return 'var(--color-warning, #f59e0b)';
      default:
        return 'var(--color-text-secondary)';
    }
  };

  if (loading) return <div className="page-loading">{t('common.loading')}</div>;

  return (
    <div className="page-container">
      <PageHeader title="A/B Testing" subtitle="Test message variants and find what works best" />

      <div style={{ marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={openCreate}>
          + New A/B Test
        </button>
      </div>

      {tests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
          No A/B tests yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tests.map(test => (
            <div
              key={test.id}
              style={{
                padding: '1.25rem',
                background: 'var(--color-bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{test.name}</h3>
                  {test.description && (
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      {test.description}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    background: `${statusColor(test.status)}22`,
                    color: statusColor(test.status),
                  }}
                >
                  {test.status}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${test.variants.length}, 1fr)`,
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                {test.variants.map(v => {
                  const res = test.results?.[v.id];
                  const isWinner = test.winningVariantId === v.id;
                  return (
                    <div
                      key={v.id}
                      style={{
                        padding: '0.75rem',
                        background: 'var(--color-bg)',
                        borderRadius: '6px',
                        border: isWinner ? '2px solid var(--color-success, #22c55e)' : '1px solid var(--color-border)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        {v.name} ({v.weight}%){isWinner && ' — Winner'}
                      </div>
                      {res && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          Sent: {res.sent} | Delivered: {res.delivered} | Replied: {res.replied}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {test.status === 'draft' && (
                  <button className="btn btn-sm btn-primary" onClick={() => handleStart(test.id)}>
                    Start
                  </button>
                )}
                {test.status === 'running' && (
                  <button className="btn btn-sm btn-warning" onClick={() => handleComplete(test.id)}>
                    Complete
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(test.id)}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editTest ? 'Edit A/B Test' : 'New A/B Test'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Test Name</label>
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
            <div>
              <label className="form-label">Sample Size</label>
              <input
                className="form-input"
                type="number"
                value={form.sampleSize}
                onChange={e => setForm({ ...form, sampleSize: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Variants</label>
              {form.variants.map((v, i) => (
                <div
                  key={v.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 1fr',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <input
                    className="form-input"
                    placeholder="Name"
                    value={v.name}
                    onChange={e => updateVariant(i, 'name', e.target.value)}
                  />
                  <input
                    className="form-input"
                    type="number"
                    placeholder="Weight"
                    value={v.weight}
                    onChange={e => updateVariant(i, 'weight', e.target.value)}
                  />
                  <input
                    className="form-input"
                    placeholder="Message content"
                    value={(v.content as { message?: string }).message ?? ''}
                    onChange={e => updateVariant(i, 'content', e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editTest ? 'Update' : t('common.create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
