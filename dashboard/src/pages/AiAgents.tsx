import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bot,
  Sparkles,
  Zap,
  Mic,
  Globe,
  Plus,
  Trash2,
  RotateCw,
  MessageSquare,
  Loader2,
  Pencil,
  Info,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { AgentFormModal } from '../components/ai-agents/AgentFormModal';
import { AgentTestModal } from '../components/ai-agents/AgentTestModal';
import { VoiceTab } from '../components/ai-agents/VoiceTab';
import { aiCreditsService } from '../services/aiCredits';
import {
  aiAgentsApi,
  aiAssistantApi,
  sessionApi,
  type AiAgent,
  type AiAgentInput,
  type Session,
} from '../services/api';
import './AiAgents.css';

type Tab = 'agents' | 'builder' | 'external' | 'voice';
type FormState = { agent: AiAgent | null; external: boolean } | null;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const smallBtn = { padding: '4px 10px', fontSize: '0.75rem' } as const;

export function AiAgents() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('agents');

  const [agents, setAgents] = useState<AiAgent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);

  const [form, setForm] = useState<FormState>(null);
  const [testAgent, setTestAgent] = useState<AiAgent | null>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);

  const [builderPrompt, setBuilderPrompt] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const loadAgents = useCallback(() => {
    aiAgentsApi
      .list()
      .then(list => {
        setAgents(list);
        setLoadError(null);
      })
      .catch(err => setLoadError(errorText(err)));
  }, []);

  useEffect(() => {
    loadAgents();
    // Optional lookups: the form still works (All numbers / free-text model) if these fail.
    sessionApi
      .list()
      .then(setSessions)
      .catch(() => {});
    aiAssistantApi
      .getModels()
      .then(setModels)
      .catch(() => {});
  }, [loadAgents]);

  const internalAgents = (agents ?? []).filter(a => !a.isExternal);
  const externalAgents = (agents ?? []).filter(a => a.isExternal);

  const replaceAgent = (updated: AiAgent) =>
    setAgents(prev => (prev ? prev.map(a => (a.id === updated.id ? updated : a)) : prev));

  const sessionLabel = (id: string | null) => (id ? (sessions.find(s => s.id === id)?.name ?? id) : 'All numbers');

  const patchAgent = async (agent: AiAgent, data: AiAgentInput, okMessage: string) => {
    try {
      replaceAgent(await aiAgentsApi.update(agent.id, data));
      toast.success(okMessage);
    } catch (err) {
      toast.error('Could not update agent', errorText(err));
    }
  };

  const handleSubmitForm = async (data: AiAgentInput) => {
    if (!form) return;
    try {
      if (form.agent) {
        replaceAgent(await aiAgentsApi.update(form.agent.id, data));
        toast.success('Agent saved');
      } else {
        const created = await aiAgentsApi.create({ ...data, name: data.name ?? '' });
        setAgents(prev => [created, ...(prev ?? [])]);
        toast.success(form.external ? 'External agent connected' : 'Agent created');
      }
      setForm(null);
    } catch (err) {
      toast.error('Could not save agent', errorText(err));
    }
  };

  const handleDelete = async (agent: AiAgent) => {
    if (!window.confirm(`Delete "${agent.name}"? This cannot be undone.`)) return;
    try {
      await aiAgentsApi.delete(agent.id);
      setAgents(prev => (prev ? prev.filter(a => a.id !== agent.id) : prev));
      toast.success('Agent deleted');
    } catch (err) {
      toast.error('Could not delete agent', errorText(err));
    }
  };

  const handleBuildAgent = async () => {
    if (!builderPrompt.trim()) {
      toast.warning('Please describe the agent you want to create');
      return;
    }
    if (aiCreditsService.getBalance() < 10) {
      toast.warning('Insufficient AI credits to generate new agent');
      return;
    }
    setIsBuilding(true);
    setBuildError(null);
    try {
      const created = await aiAgentsApi.build(builderPrompt.trim());
      aiCreditsService.deduct('agent_reply', 'Astra AI Agent Builder', 10);
      setAgents(prev => [created, ...(prev ?? [])]);
      setBuilderPrompt('');
      setActiveTab('agents');
      setForm({ agent: created, external: false });
      toast.success('Agent drafted — review it, then switch on auto-reply (-10 credits)');
    } catch (err) {
      setBuildError(errorText(err));
    } finally {
      setIsBuilding(false);
    }
  };

  const handlePing = async (agent: AiAgent) => {
    setPingingId(agent.id);
    try {
      const res = await aiAgentsApi.ping(agent.id);
      replaceAgent({ ...agent, externalStatus: res.ok ? 'connected' : 'error', lastPingMs: res.latencyMs });
      if (res.ok) {
        toast.success(`Connected (${res.latencyMs} ms)`, res.reply ? `Reply: ${res.reply.slice(0, 160)}` : undefined);
      } else {
        toast.error(`Connection failed (${res.latencyMs} ms)`, res.error);
      }
    } catch (err) {
      toast.error('Connection test failed', errorText(err));
    } finally {
      setPingingId(null);
    }
  };

  const renderList = (list: AiAgent[], emptyText: string, renderCard: (a: AiAgent) => ReactNode) => {
    if (loadError) {
      return (
        <div className="empty-state">
          <p>Could not load agents: {loadError}</p>
          <button className="btn-secondary" onClick={loadAgents}>
            <RotateCw size={14} /> Retry
          </button>
        </div>
      );
    }
    if (!agents) {
      return (
        <div className="empty-state">
          <Loader2 size={20} className="animate-spin" />
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="empty-state">
          <p>{emptyText}</p>
        </div>
      );
    }
    return <div className="agents-grid">{list.map(renderCard)}</div>;
  };

  const renderInternalCard = (agent: AiAgent) => (
    <div key={agent.id} className="agent-card">
      <div className="agent-card-header">
        <div className="agent-avatar-box">
          <Bot size={22} />
        </div>
        <div className="agent-info">
          <h3 className="agent-name">
            {agent.name}
            {agent.autonomous && agent.status === 'active' && (
              <span title="Auto-reply on" style={{ color: '#6366f1' }}>
                <Zap size={14} />
              </span>
            )}
          </h3>
          <span className="agent-role">{agent.role}</span>
        </div>
        <span className={`agent-status-badge ${agent.status === 'active' ? 'active' : 'paused'}`}>
          {agent.status === 'active' ? 'Active' : agent.status === 'draft' ? 'Draft' : 'Paused'}
        </span>
      </div>

      {agent.description && <p className="agent-desc">{agent.description}</p>}

      <div className="agent-meta-tags">
        <span className="meta-tag">Model: {agent.model || 'default'}</span>
        <span className="meta-tag">Answers on: {sessionLabel(agent.sessionId)}</span>
        <span className="meta-tag">
          Keywords: {agent.triggerKeywords.length ? agent.triggerKeywords.join(', ') : 'any chat'}
        </span>
        <span className="meta-tag" style={{ color: '#16a34a' }}>
          {agent.conversationsHandled.toLocaleString()} chats handled
        </span>
      </div>

      <div className="agent-card-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="toggle-switch-container">
            <input
              type="checkbox"
              checked={agent.status === 'active'}
              onChange={e =>
                patchAgent(
                  agent,
                  { status: e.target.checked ? 'active' : 'paused' },
                  e.target.checked ? 'Agent activated' : 'Agent paused',
                )
              }
            />
            <span>Active</span>
          </label>
          <label className="toggle-switch-container">
            <input
              type="checkbox"
              checked={agent.autonomous}
              onChange={e =>
                patchAgent(
                  agent,
                  { autonomous: e.target.checked },
                  e.target.checked ? 'Auto-reply on' : 'Auto-reply off',
                )
              }
            />
            <span>Auto-reply to customers</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary" style={smallBtn} onClick={() => setTestAgent(agent)}>
            <MessageSquare size={12} /> Test
          </button>
          <button
            className="btn-secondary"
            style={smallBtn}
            onClick={() => setForm({ agent, external: false })}
            aria-label={`Edit ${agent.name}`}
          >
            <Pencil size={12} />
          </button>
          <button className="deal-delete-btn" onClick={() => handleDelete(agent)} aria-label={`Delete ${agent.name}`}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderExternalCard = (agent: AiAgent) => (
    <div key={agent.id} className="agent-card">
      <div className="agent-card-header">
        <div className="agent-avatar-box" style={{ background: '#0284c7' }}>
          <Globe size={22} />
        </div>
        <div className="agent-info">
          <h3 className="agent-name">{agent.name}</h3>
          <span className="agent-role" style={{ textTransform: 'uppercase' }}>
            {agent.externalPlatform ?? 'custom'}
          </span>
        </div>
        <span className={`agent-status-badge ${agent.externalStatus === 'connected' ? 'active' : 'paused'}`}>
          {agent.externalStatus === 'connected' ? 'Connected' : agent.externalStatus === 'error' ? 'Error' : 'Untested'}
        </span>
      </div>

      <div
        style={{
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div>
          <strong>Webhook: </strong>
          <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{agent.externalWebhookUrl}</code>
        </div>
        <div>
          <strong>Response path: </strong>
          <code>{agent.responseJsonPath || '(whole body)'}</code>
        </div>
        <div>
          <strong>Answers on: </strong>
          {sessionLabel(agent.sessionId)} · <strong>Auto-reply: </strong>
          {agent.autonomous ? 'on' : 'off'}
        </div>
        {agent.lastPingMs != null && <div>Last ping: {agent.lastPingMs} ms</div>}
      </div>

      <div className="agent-card-footer">
        <button
          className="btn-secondary"
          style={smallBtn}
          onClick={() => handlePing(agent)}
          disabled={pingingId === agent.id}
        >
          <RotateCw size={12} className={pingingId === agent.id ? 'animate-spin' : ''} />
          Test connection
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn-secondary"
            style={smallBtn}
            onClick={() => setForm({ agent, external: true })}
            aria-label={`Edit ${agent.name}`}
          >
            <Pencil size={12} />
          </button>
          <button className="deal-delete-btn" onClick={() => handleDelete(agent)} aria-label={`Delete ${agent.name}`}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  const tabBtn = (tab: Tab, icon: ReactNode, label: string) => (
    <button className={`ai-agents-tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
      {icon}
      {label}
    </button>
  );

  const tabIntro = (text: string, action: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{text}</p>
      {action}
    </div>
  );

  return (
    <div className="ai-agents-page" data-testid="ai-agents-page">
      <PageHeader
        title="AI Agents & Voice Engine"
        subtitle="Manage AI agents that answer WhatsApp chats, build agents from a description, connect external agents, and preview voices"
      />

      <div className="ai-agents-nav-tabs">
        {tabBtn('agents', <Bot size={16} />, `AI Agents (${internalAgents.length})`)}
        {tabBtn('builder', <Sparkles size={16} />, 'Agent Builder (Astra)')}
        {tabBtn('external', <Globe size={16} />, `External Agents (${externalAgents.length})`)}
        {tabBtn('voice', <Mic size={16} />, 'Voice (Sarvam)')}
      </div>

      {activeTab === 'agents' && (
        <>
          {tabIntro(
            'AI agents answer customers on WhatsApp using their system prompt.',
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={() => setActiveTab('builder')}>
                <Sparkles size={16} /> Describe an agent
              </button>
              <button className="btn-primary" onClick={() => setForm({ agent: null, external: false })}>
                <Plus size={16} /> New Agent
              </button>
            </div>,
          )}
          <p
            style={{
              margin: 0,
              display: 'flex',
              gap: 6,
              alignItems: 'flex-start',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}
          >
            <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            An active agent with auto-reply on answers incoming WhatsApp chats that contain one of its keywords (or any
            chat if it has none). A human taking over a chat, or a matching workflow, always wins.
          </p>
          {renderList(
            internalAgents,
            'No agents yet — create one or describe one in the Builder tab',
            renderInternalCard,
          )}
        </>
      )}

      {activeTab === 'builder' && (
        <div className="builder-hero-card">
          <div className="builder-header">
            <div className="builder-icon">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Describe your agent
              </h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Describe what your agent should do in plain English, Gujarati, or Hindi. The AI drafts its name, system
                prompt and keywords. It starts with auto-reply off so you can review it first.
              </p>
            </div>
          </div>

          <textarea
            className="builder-prompt-textarea"
            aria-label="Agent description"
            placeholder="e.g. Build an AI agent for my electronics store in Surat. It should help customers choose smartphones, share warranty details, and ask for their address for home delivery..."
            value={builderPrompt}
            onChange={e => setBuilderPrompt(e.target.value)}
          />

          <div className="builder-templates-row">
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Quick Templates:
            </span>
            <button
              type="button"
              className="template-pill"
              onClick={() =>
                setBuilderPrompt(
                  'Create an Italian Restaurant reservation agent that takes table bookings, party size, booking time, and confirms the booking.',
                )
              }
            >
              🍽️ Restaurant Table Booking Bot
            </button>
            <button
              type="button"
              className="template-pill"
              onClick={() =>
                setBuilderPrompt(
                  'Create a Real Estate broker agent in Ahmedabad. Inquire whether customer wants 2BHK or 3BHK flat, budget range, and schedule site visit.',
                )
              }
            >
              🏢 Real Estate Lead Qualifier
            </button>
            <button
              type="button"
              className="template-pill"
              onClick={() =>
                setBuilderPrompt(
                  'Create an Automobile workshop booking bot for car servicing, oil change, pickup & drop address, and a billing quote.',
                )
              }
            >
              🚗 Car Service & Maintenance Bot
            </button>
          </div>

          {buildError && (
            <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: '0.875rem' }}>
              {buildError}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              className="btn-primary"
              style={{ padding: '10px 20px', fontSize: '0.9375rem' }}
              onClick={handleBuildAgent}
              disabled={isBuilding}
            >
              {isBuilding ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Building agent...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Build Agent (-10 cr)
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'external' && (
        <>
          {tabIntro(
            'Connect agents built on Flowise, n8n, Dify, LangChain, Botpress, or any REST webhook to WhatsApp.',
            <button className="btn-primary" onClick={() => setForm({ agent: null, external: true })}>
              <Plus size={16} /> Connect External Agent
            </button>,
          )}
          {renderList(externalAgents, 'No external agents connected yet', renderExternalCard)}
        </>
      )}

      {activeTab === 'voice' && <VoiceTab />}

      {testAgent && <AgentTestModal agent={testAgent} onClose={() => setTestAgent(null)} />}

      {form && (
        <AgentFormModal
          key={form.agent?.id ?? 'new'}
          agent={form.agent}
          external={form.external}
          sessions={sessions}
          models={models}
          onClose={() => setForm(null)}
          onSubmit={handleSubmitForm}
        />
      )}
    </div>
  );
}
export default AiAgents;
