import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { request } from '../services/api';

interface WorkflowSummary {
  totalWorkflows: number;
  published: number;
  draft: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number;
}

export function WorkflowAnalytics() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    request<WorkflowSummary>('/workflows/analytics/summary')
      .then(setSummary)
      .catch(() => addToast(t('common.error'), 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">{t('common.loading')}</div>;
  if (!summary) return <div className="page-loading">No data</div>;

  const statCards = [
    { label: 'Total Workflows', value: summary.totalWorkflows },
    { label: 'Published', value: summary.published, color: 'var(--color-success, #22c55e)' },
    { label: 'Draft', value: summary.draft, color: 'var(--color-text-secondary)' },
    { label: 'Total Runs', value: summary.totalRuns },
    { label: 'Completed', value: summary.completedRuns, color: 'var(--color-success, #22c55e)' },
    { label: 'Failed', value: summary.failedRuns, color: 'var(--color-danger, #ef4444)' },
    {
      label: 'Success Rate',
      value: `${summary.successRate}%`,
      color: summary.successRate > 90 ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #f59e0b)',
    },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Workflow Analytics" subtitle="Workflow execution metrics and path analysis" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {statCards.map(card => (
          <div
            key={card.label}
            style={{
              padding: '1.25rem',
              background: 'var(--color-bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color || 'var(--color-text)' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '2rem',
          padding: '2rem',
          background: 'var(--color-bg-secondary)',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
        }}
      >
        Path analytics visualization coming soon. Individual workflow path stats available via the API.
      </div>
    </div>
  );
}
