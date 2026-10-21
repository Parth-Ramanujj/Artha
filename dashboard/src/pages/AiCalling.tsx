import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Bot, CircleAlert, ListChecks, Loader2, Mic, PhoneCall, RefreshCw, Settings2 } from 'lucide-react';
import { aiCallingApi, type AiCallingSetup, type VoiceAgent } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { errorText } from '../components/ai-calling/callMeta';
import { SetupPanel } from '../components/ai-calling/SetupPanel';
import { CallsTab } from '../components/ai-calling/CallsTab';
import { BatchesTab } from '../components/ai-calling/BatchesTab';
import { AgentTab } from '../components/ai-calling/AgentTab';
import { TestCallTab } from '../components/ai-calling/TestCallTab';

type Tab = 'calls' | 'verified' | 'lists' | 'agent' | 'test';

const TABS: { id: Tab; icon: ReactNode }[] = [
  { id: 'calls', icon: <PhoneCall size={15} /> },
  { id: 'verified', icon: <BadgeCheck size={15} /> },
  { id: 'lists', icon: <ListChecks size={15} /> },
  { id: 'agent', icon: <Settings2 size={15} /> },
  { id: 'test', icon: <Mic size={15} /> },
];

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '10px 14px',
        marginBottom: 20,
        borderRadius: 12,
        border: '1px solid #ef444488',
        background: '#ef44441a',
        fontSize: 13.5,
      }}
    >
      <CircleAlert size={16} color="#ef4444" />
      <span style={{ flex: 1 }}>{message}</span>
      <button className="btn-secondary" onClick={onRetry}>
        <RefreshCw size={14} /> {t('aiCalling.retry')}
      </button>
    </div>
  );
}

export function AiCalling() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('calls');
  const [setup, setSetup] = useState<AiCallingSetup | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = useCallback(() => {
    aiCallingApi
      .stats()
      .then(s => setStats(s as Record<string, number>))
      .catch(() => undefined); // keep the last numbers rather than showing zeros
  }, []);

  const loadMeta = useCallback(() => {
    setSetupError(null);
    aiCallingApi
      .setup()
      .then(setSetup)
      .catch(err => setSetupError(errorText(err, t('aiCalling.setupLoadFailed'))));
    setAgentError(null);
    aiCallingApi
      .agents()
      .then(list => {
        const found = list.find(a => a.isDefault) ?? list[0] ?? null;
        setAgent(found);
        if (!found) setAgentError(t('aiCalling.noAgent'));
      })
      .catch(err => setAgentError(errorText(err, t('aiCalling.agentLoadFailed'))));
    loadStats();
  }, [loadStats, t]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const refresh = () => {
    loadMeta();
    setRefreshKey(k => k + 1);
  };

  const talked = stats.completed ?? 0;
  const pending = (stats.queued ?? 0) + (stats.dialing ?? 0) + (stats.ringing ?? 0) + (stats.in_progress ?? 0);
  const unanswered = (stats.no_answer ?? 0) + (stats.busy ?? 0);

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 32px)', maxWidth: 1240, margin: '0 auto' }}>
      <PageHeader
        title={t('nav.aiCalling', 'AI Calling')}
        subtitle={t('aiCalling.subtitle')}
        icon={<Bot size={24} />}
        action={{ label: t('aiCalling.refresh'), onClick: refresh, icon: <RefreshCw size={16} /> }}
      />

      {setupError ? (
        <ErrorBox message={setupError} onRetry={loadMeta} />
      ) : setup ? (
        <SetupPanel setup={setup} onChanged={loadMeta} />
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          <Loader2 size={14} className="animate-spin" style={{ verticalAlign: '-2px' }} />{' '}
          {t('aiCalling.checkingSetup')}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          margin: '4px 0 20px',
        }}
      >
        <Stat label={t('aiCalling.stats.talked')} value={talked} color="#22c55e" />
        <Stat label={t('aiCalling.stats.verified')} value={stats.verified ?? 0} color="#8b5cf6" />
        <Stat label={t('aiCalling.stats.pending')} value={pending} color="#3b82f6" />
        <Stat label={t('aiCalling.stats.unanswered')} value={unanswered} color="#f59e0b" />
      </div>

      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          marginBottom: 18,
          overflowX: 'auto',
        }}
      >
        {TABS.map(item => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === item.id ? 'var(--primary)' : 'transparent'}`,
              color: tab === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: tab === item.id ? 700 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {item.icon} {t(`aiCalling.tabs.${item.id}`)}
          </button>
        ))}
      </div>

      {tab === 'calls' && <CallsTab setup={setup} refreshKey={refreshKey} onActivity={loadStats} />}
      {tab === 'verified' && <CallsTab verifiedOnly setup={setup} refreshKey={refreshKey} onActivity={loadStats} />}
      {tab === 'lists' && <BatchesTab setup={setup} refreshKey={refreshKey} onActivity={loadStats} />}
      {tab === 'agent' &&
        (agent ? (
          <AgentTab agent={agent} onSaved={setAgent} />
        ) : agentError ? (
          <ErrorBox message={agentError} onRetry={loadMeta} />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={26} className="animate-spin" />
          </div>
        ))}
      {tab === 'test' && <TestCallTab agentId={agent?.id} setup={setup} />}
    </div>
  );
}
