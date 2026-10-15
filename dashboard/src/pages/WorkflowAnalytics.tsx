import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Workflow,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Plus,
  ArrowRight,
  Sparkles,
  Zap,
  Activity,
  Layers,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { workflowAnalyticsApi } from '../services/api';

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
  const navigate = useNavigate();
  const toast = useToast();
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = () => {
    setLoading(true);
    workflowAnalyticsApi
      .summary()
      .then(res => setSummary(res))
      .catch(() => toast.error('Failed to load workflow analytics'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSummary();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  const s = summary || {
    totalWorkflows: 0,
    published: 0,
    draft: 0,
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    successRate: 100,
  };

  const statCards = [
    { label: 'Total Automations', value: s.totalWorkflows, icon: <Workflow size={20} />, color: 'var(--color-text)', bg: 'rgba(59, 130, 246, 0.1)' },
    { label: 'Published & Live', value: s.published, icon: <Zap size={20} />, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
    { label: 'Draft Mode', value: s.draft, icon: <Layers size={20} />, color: 'var(--color-text-secondary)', bg: 'rgba(107, 114, 128, 0.1)' },
    { label: 'Total Executions', value: s.totalRuns.toLocaleString(), icon: <Activity size={20} />, color: 'var(--color-text)', bg: 'rgba(168, 85, 247, 0.1)' },
    { label: 'Completed Successfully', value: s.completedRuns.toLocaleString(), icon: <CheckCircle2 size={20} />, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
    { label: 'Failed Executions', value: s.failedRuns.toLocaleString(), icon: <AlertTriangle size={20} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
    {
      label: 'Success Rate',
      value: `${s.successRate}%`,
      icon: <TrendingUp size={20} />,
      color: s.successRate >= 90 ? '#22c55e' : '#f59e0b',
      bg: s.successRate >= 90 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
    },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Workflow Analytics"
        subtitle="Visual analytics, execution health, and trigger throughput for visual bot flows"
        action={{
          label: 'Open Workflow Builder',
          onClick: () => navigate('/workflows'),
          icon: <Plus size={16} />,
        }}
      />

      {/* Grid of Key Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {statCards.map(card => (
          <div
            key={card.label}
            style={{
              padding: '18px 20px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: card.color, marginTop: 4 }}>{card.value}</div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                background: card.bg,
                color: card.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Execution Funnel */}
      <div
        style={{
          padding: 24,
          background: 'var(--color-bg-secondary)',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px 0' }}>Workflow Run Pipeline</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
              End-to-end execution lifecycle across all active WhatsApp conversation triggers
            </p>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: s.successRate >= 90 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: s.successRate >= 90 ? '#22c55e' : '#f59e0b',
            }}
          >
            {s.successRate}% Success Reliability
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stage 1 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 500 }}>1. Inbound Inquiries Triggered</span>
              <span style={{ fontWeight: 600 }}>{s.totalRuns} Executions</span>
            </div>
            <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: '#3b82f6', borderRadius: 5 }} />
            </div>
          </div>

          {/* Stage 2 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 500 }}>2. Completed Branches & Step Dispatches</span>
              <span style={{ fontWeight: 600, color: '#22c55e' }}>{s.completedRuns} Runs</span>
            </div>
            <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 5, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(s.successRate, 100)}%`,
                  height: '100%',
                  background: '#22c55e',
                  borderRadius: 5,
                }}
              />
            </div>
          </div>

          {/* Stage 3 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 500 }}>3. Halted / Errored Node Branches</span>
              <span style={{ fontWeight: 600, color: s.failedRuns > 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                {s.failedRuns} Runs
              </span>
            </div>
            <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 5, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${s.totalRuns > 0 ? (s.failedRuns / s.totalRuns) * 100 : 0}%`,
                  height: '100%',
                  background: '#ef4444',
                  borderRadius: 5,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row of Tips and Navigation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        <div
          style={{
            padding: 20,
            background: 'var(--color-bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles size={18} style={{ color: '#22c55e' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Automation Reliability Guidelines</span>
          </div>
          <ul style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
            <li>Always add a fallback message node when connecting external APIs.</li>
            <li>Use the Condition node to branch VIP customers to direct human advisors.</li>
            <li>Monitor execution time in the node canvas test simulator before deploying live.</li>
          </ul>
        </div>

        <div
          style={{
            padding: 20,
            background: 'var(--color-bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Visual Workflow Builder</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
              Design drag-and-drop conversational paths, connect AI chatbots, Google Sheets, and webhook nodes.
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/workflows')}
            style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
          >
            Launch Workflow Studio <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
