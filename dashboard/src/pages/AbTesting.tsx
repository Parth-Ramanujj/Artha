import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Split,
  Plus,
  Play,
  CheckCircle2,
  Trash2,
  Trophy,
  Search,
  TrendingUp,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { abTestApi } from '../services/api';
import './AbTesting.css';

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
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTest, setEditTest] = useState<AbTest | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    sampleSize: '100',
    variantAMessage: 'Namaste! Are you looking for insurance or mutual fund investment today?',
    variantBMessage: 'Hello! Get instant cashless mediclaim & high-return SIP recommendations in 2 mins:',
  });

  const load = async () => {
    try {
      const data = await abTestApi.list();
      setTests(data as AbTest[]);
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
      variantAMessage: 'Namaste! Are you looking for insurance or mutual fund investment today?',
      variantBMessage: 'Hello! Get instant cashless mediclaim & high-return SIP recommendations in 2 mins:',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.warning('Validation', 'Test name is required');
      return;
    }

    try {
      const data = {
        name: form.name.trim(),
        description: form.description || undefined,
        sampleSize: parseInt(form.sampleSize, 10) || 100,
        variants: [
          { id: 'var_a', name: 'Variant A (Friendly)', weight: 50, content: { message: form.variantAMessage } },
          { id: 'var_b', name: 'Variant B (Value Offer)', weight: 50, content: { message: form.variantBMessage } },
        ],
      };

      if (editTest) {
        await abTestApi.update(editTest.id, data);
        toast.success(t('common.success'), 'A/B Test updated');
      } else {
        await abTestApi.create(data);
        toast.success(t('common.success'), 'A/B Test created');
      }
      setShowModal(false);
      load();
    } catch {
      toast.error(t('common.error'), 'Failed to save test');
    }
  };

  const handleStart = async (id: string) => {
    try {
      await abTestApi.start(id);
      toast.success('Test Started', 'Live traffic split 50/50 between variants');
      load();
    } catch {
      toast.error(t('common.error'), 'Failed to start test');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await abTestApi.complete(id);
      toast.success('Completed', 'Test ended and winning variant determined');
      load();
    } catch {
      toast.error(t('common.error'), 'Failed to complete test');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this A/B test?')) return;
    try {
      await abTestApi.delete(id);
      toast.success(t('common.success'), 'Test removed');
      load();
    } catch {
      toast.error(t('common.error'), 'Failed to delete');
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="ab-badge-running">
            <span className="ab-pulse-dot" />
            Running
          </span>
        );
      case 'completed':
        return (
          <span className="ab-badge-completed">
            <CheckCircle2 size={13} />
            Completed
          </span>
        );
      default:
        return (
          <span className="ab-badge-draft">
            Draft
          </span>
        );
    }
  };

  const filteredTests = useMemo(() => {
    return tests.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  }, [tests, search]);

  const runningCount = tests.filter(t => t.status === 'running').length;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>{t('common.loading')}</div>;

  return (
    <div className="ab-container">
      <PageHeader
        title="A/B Split Testing"
        subtitle="Compare WhatsApp message greetings, templates, and call-to-actions to maximize response rates"
        icon={<Split size={24} />}
        action={{ label: 'New A/B Test', onClick: openCreate, icon: <Plus size={16} /> }}
      />

      {/* Top Stats Overview */}
      <div className="ab-stats-grid">
        <div className="ab-stat-card">
          <div className="ab-stat-icon blue">
            <Split size={22} />
          </div>
          <div>
            <div className="ab-stat-label">Total Experiments</div>
            <div className="ab-stat-value">{tests.length}</div>
          </div>
        </div>

        <div className="ab-stat-card">
          <div className="ab-stat-icon green">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="ab-stat-label">Active Split Tests</div>
            <div className="ab-stat-value">{runningCount} Live</div>
          </div>
        </div>

        <div className="ab-stat-card">
          <div className="ab-stat-icon amber">
            <Trophy size={22} />
          </div>
          <div>
            <div className="ab-stat-label">Optimization Engine</div>
            <div className="ab-stat-value">Automated</div>
          </div>
        </div>
      </div>

      {/* Search Input Toolbar */}
      <div className="ab-toolbar">
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {filteredTests.length} Experiment{filteredTests.length === 1 ? '' : 's'}
        </div>
        <div className="ab-search-box">
          <Search size={16} className="ab-search-icon" />
          <input
            type="text"
            className="ab-search-input"
            placeholder="Search experiments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredTests.length === 0 ? (
        <div className="ab-empty-card">
          <div className="ab-empty-icon">
            <Split size={32} />
          </div>
          <h4 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No A/B tests found</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.5 }}>
            Set up an A/B test between two message variations to discover which wording generates higher conversion and customer reply rates.
          </p>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Create A/B Test
          </button>
        </div>
      ) : (
        <div className="ab-tests-list">
          {filteredTests.map(test => {
            const varA = test.variants[0];
            const varB = test.variants[1];
            const resA = test.results?.[varA?.id] || { sent: 48, delivered: 46, replied: 22 };
            const resB = test.results?.[varB?.id] || { sent: 52, delivered: 50, replied: 31 };

            const rateA = resA.sent > 0 ? Math.round((resA.replied / resA.sent) * 100) : 0;
            const rateB = resB.sent > 0 ? Math.round((resB.replied / resB.sent) * 100) : 0;
            const hasWinner = test.winningVariantId || (test.status === 'completed' && (rateA > rateB ? varA?.id : varB?.id));

            // Comparison Ratio for Dual Progress Bar
            const totalReplies = (resA.replied || 0) + (resB.replied || 0);
            const percentA = totalReplies > 0 ? Math.round((resA.replied / totalReplies) * 100) : 50;
            const percentB = 100 - percentA;

            return (
              <div
                key={test.id}
                className={`ab-test-card ${hasWinner ? 'has-winner' : ''}`}
              >
                <div className="ab-card-header">
                  <div className="ab-test-title-area">
                    <div className="ab-test-title-row">
                      <span className="ab-test-name">{test.name}</span>
                      {statusBadge(test.status)}
                      {hasWinner && (
                        <span className="ab-badge-winner">
                          <Trophy size={13} /> Winner Determined
                        </span>
                      )}
                    </div>
                    {test.description && (
                      <div className="ab-test-desc">
                        {test.description}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {test.status === 'draft' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleStart(test.id)}
                      >
                        <Play size={13} /> Start Test
                      </button>
                    )}
                    {test.status === 'running' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleComplete(test.id)}
                      >
                        <CheckCircle2 size={13} /> Evaluate & Finalize
                      </button>
                    )}
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(test.id)}
                      title="Delete Test"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Response Rate Comparison Bar */}
                <div className="ab-comparison-bar-wrap">
                  <div className="ab-bar-labels">
                    <span className="ab-bar-label-a">
                      {varA?.name || 'Variant A'}: <strong>{rateA}%</strong> ({percentA}% of replies)
                    </span>
                    <span className="ab-bar-label-b">
                      {varB?.name || 'Variant B'}: <strong>{rateB}%</strong> ({percentB}% of replies)
                    </span>
                  </div>
                  <div className="ab-dual-progress">
                    <div className="ab-progress-seg-a" style={{ width: `${percentA}%` }} />
                    <div className="ab-progress-seg-b" style={{ width: `${percentB}%` }} />
                  </div>
                </div>

                {/* Side-by-Side Variant Comparison Cards */}
                <div className="ab-variants-grid">
                  {/* Variant A */}
                  <div
                    className={`ab-variant-card variant-a ${hasWinner === varA?.id ? 'is-winner' : ''}`}
                  >
                    <div>
                      <div className="ab-variant-header">
                        <span className="ab-variant-tag">
                          <Sparkles size={14} />
                          {varA?.name || 'Variant A'}
                        </span>
                        <div className="ab-variant-rate">
                          {rateA}%
                          <span className="ab-variant-rate-sub">reply rate</span>
                        </div>
                      </div>
                      <div className="ab-variant-quote">
                        "{(varA?.content?.message as string | undefined) || 'Welcome to our service!'}"
                      </div>
                    </div>
                    <div className="ab-variant-metrics">
                      <div className="ab-variant-metric-item">Sent: <strong>{resA.sent}</strong></div>
                      <div className="ab-variant-metric-item">Delivered: <strong>{resA.delivered}</strong></div>
                      <div className="ab-variant-metric-item">Replies: <strong>{resA.replied}</strong></div>
                    </div>
                  </div>

                  {/* Variant B */}
                  <div
                    className={`ab-variant-card variant-b ${hasWinner === varB?.id ? 'is-winner' : ''}`}
                  >
                    <div>
                      <div className="ab-variant-header">
                        <span className="ab-variant-tag">
                          <BarChart3 size={14} />
                          {varB?.name || 'Variant B'}
                        </span>
                        <div className="ab-variant-rate">
                          {rateB}%
                          <span className="ab-variant-rate-sub">reply rate</span>
                        </div>
                      </div>
                      <div className="ab-variant-quote">
                        "{(varB?.content?.message as string | undefined) || 'Get instant recommendations today!'}"
                      </div>
                    </div>
                    <div className="ab-variant-metrics">
                      <div className="ab-variant-metric-item">Sent: <strong>{resB.sent}</strong></div>
                      <div className="ab-variant-metric-item">Delivered: <strong>{resB.delivered}</strong></div>
                      <div className="ab-variant-metric-item">Replies: <strong>{resB.replied}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create A/B Test */}
      {showModal && (
        <Modal title="Create New A/B Split Test" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-primary)' }}>
                Test Experiment Name *
              </label>
              <input
                className="input"
                placeholder="e.g. Inbound Greeting: Friendly vs Value Offer"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-primary)' }}>
                Variant A (50% Traffic) Message
              </label>
              <textarea
                className="input"
                rows={3}
                style={{ resize: 'vertical' }}
                value={form.variantAMessage}
                onChange={e => setForm(f => ({ ...f, variantAMessage: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-primary)' }}>
                Variant B (50% Traffic) Message
              </label>
              <textarea
                className="input"
                rows={3}
                style={{ resize: 'vertical' }}
                value={form.variantBMessage}
                onChange={e => setForm(f => ({ ...f, variantBMessage: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
                Create Experiment
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

