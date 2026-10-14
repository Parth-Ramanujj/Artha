import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { request } from '../services/api';

interface AnalyticsSummary {
  totalCampaigns: number;
  completed: number;
  active: number;
  failed: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number;
}

export function CampaignAnalytics() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    request<AnalyticsSummary>('/campaigns/analytics/summary')
      .then(setSummary)
      .catch(() => addToast(t('common.error'), 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">{t('common.loading')}</div>;
  if (!summary) return <div className="page-loading">No data</div>;

  const statCards = [
    { label: 'Total Campaigns', value: summary.totalCampaigns, color: 'var(--color-text)' },
    { label: 'Active', value: summary.active, color: 'var(--color-info, #3b82f6)' },
    { label: 'Completed', value: summary.completed, color: 'var(--color-success, #22c55e)' },
    { label: 'Failed', value: summary.failed, color: 'var(--color-danger, #ef4444)' },
    { label: 'Total Sent', value: summary.totalSent.toLocaleString(), color: 'var(--color-text)' },
    { label: 'Delivered', value: summary.totalDelivered.toLocaleString(), color: 'var(--color-success, #22c55e)' },
    {
      label: 'Delivery Rate',
      value: `${summary.deliveryRate}%`,
      color: summary.deliveryRate > 90 ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #f59e0b)',
    },
    { label: 'Failed Messages', value: summary.totalFailed.toLocaleString(), color: 'var(--color-danger, #ef4444)' },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Campaign Analytics" subtitle="Detailed campaign performance metrics" />

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
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color }}>{card.value}</div>
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
        Charts and detailed per-campaign analytics coming soon. Use the campaign list page to view individual campaign
        stats.
      </div>
    </div>
  );
}
