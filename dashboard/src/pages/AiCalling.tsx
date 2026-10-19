import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Bot,
  ListChecks,
  Loader2,
  Mic,
  PhoneCall,
  PhoneForwarded,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { aiCallingApi, type AiCallingSetup, type VoiceAgent } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { SetupPanel } from '../components/ai-calling/SetupPanel';
import { CallsTab } from '../components/ai-calling/CallsTab';
import { BatchesTab } from '../components/ai-calling/BatchesTab';
import { AgentTab } from '../components/ai-calling/AgentTab';
import { TestCallTab } from '../components/ai-calling/TestCallTab';

type Tab = 'calls' | 'verified' | 'lists' | 'agent' | 'test';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'calls', label: 'Call log', icon: <PhoneCall size={15} /> },
  { id: 'verified', label: 'Verified leads', icon: <BadgeCheck size={15} /> },
  { id: 'lists', label: 'Call lists', icon: <ListChecks size={15} /> },
  { id: 'agent', label: 'Agent settings', icon: <Settings2 size={15} /> },
  { id: 'test', label: 'Test call', icon: <Mic size={15} /> },
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

export function AiCalling() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('calls');
  const [setup, setSetup] = useState<AiCallingSetup | null>(null);
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = useCallback(() => {
    aiCallingApi
      .stats()
      .then(s => setStats(s as Record<string, number>))
      .catch(() => setStats({}));
  }, []);

  const loadMeta = useCallback(() => {
    aiCallingApi
      .setup()
      .then(setSetup)
      .catch(() => setSetup(null));
    aiCallingApi
      .agents()
      .then(list => setAgent(list.find(a => a.isDefault) ?? list[0] ?? null))
      .catch(() => setAgent(null));
    loadStats();
  }, [loadStats]);

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
        subtitle="An AI agent that phones your leads in Gujarati and Hindi, logs every call and finds the verified leads"
        icon={<Bot size={24} />}
        action={{ label: 'Refresh', onClick: refresh, icon: <RefreshCw size={16} /> }}
      />

      {setup && !setup.readyForPhoneCalls && <SetupPanel setup={setup} onChanged={loadMeta} />}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          margin: '4px 0 20px',
        }}
      >
        <Stat label="Talked" value={talked} color="#22c55e" />
        <Stat label="Verified leads" value={stats.verified ?? 0} color="#8b5cf6" />
        <Stat label="Queued or on a call" value={pending} color="#3b82f6" />
        <Stat label="Unanswered" value={unanswered} color="#f59e0b" />
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
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === 'calls' && <CallsTab refreshKey={refreshKey} onActivity={loadStats} />}
      {tab === 'verified' && <CallsTab verifiedOnly refreshKey={refreshKey} onActivity={loadStats} />}
      {tab === 'lists' && <BatchesTab refreshKey={refreshKey} onActivity={loadStats} />}
      {tab === 'agent' &&
        (agent ? (
          <AgentTab agent={agent} onSaved={setAgent} />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={26} className="animate-spin" />
          </div>
        ))}
      {tab === 'test' && <TestCallTab agentId={agent?.id} />}

      {tab === 'calls' && setup?.readyForPhoneCalls === false && (
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-secondary)',
            marginTop: 12,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <PhoneForwarded size={14} /> Calls stay queued until the setup above is complete; nothing is lost.
        </div>
      )}
    </div>
  );
}
