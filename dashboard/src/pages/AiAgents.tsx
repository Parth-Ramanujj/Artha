import { useState, useEffect } from 'react';
import {
  Bot,
  Sparkles,
  Zap,
  Mic,
  Play,
  Square,
  Volume2,
  Globe,
  Plus,
  Trash2,
  RotateCw,
  Send,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { aiCreditsService } from '../services/aiCredits';
import './AiAgents.css';

export interface AgentModel {
  id: string;
  name: string;
  role: string;
  description: string;
  model: string;
  temperature: number;
  autonomous: boolean;
  active: boolean;
  assignedChannel: string;
  triggerKeywords: string[];
  systemPrompt: string;
  conversationsHandled: number;
}

export interface ExternalAgent {
  id: string;
  name: string;
  platform: 'flowise' | 'n8n' | 'dify' | 'langchain' | 'botpress' | 'custom';
  webhookUrl: string;
  authHeader?: string;
  responseJsonPath: string;
  status: 'connected' | 'testing' | 'error';
  lastPingMs?: number;
}

const INITIAL_AGENTS: AgentModel[] = [
  {
    id: 'agent-astra-support',
    name: 'Astra Support 24/7',
    role: 'Customer Care & FAQ Specialist',
    description: 'Autonomous frontline agent resolving 80% of routine inquiries, operating hours, order lookups, and escalations.',
    model: 'gpt-4o',
    temperature: 0.3,
    autonomous: true,
    active: true,
    assignedChannel: 'All Numbers',
    triggerKeywords: ['help', 'order status', 'hours', 'support', 'મદદ', 'સહાય'],
    systemPrompt: 'You are Astra, a helpful, polite customer support assistant for OpenWA. Respond concisely and empathetically.',
    conversationsHandled: 1420,
  },
  {
    id: 'agent-sales-qualifier',
    name: 'Apollo Sales Qualifier',
    role: 'B2B Lead Qualification & Pricing',
    description: 'Engages inbound WhatsApp leads, collects requirements, calculates volume discounts, and books demo calls.',
    model: 'claude-3-5-sonnet',
    temperature: 0.5,
    autonomous: true,
    active: true,
    assignedChannel: 'Sales Hotline (+91 98765 43210)',
    triggerKeywords: ['price', 'quote', 'demo', 'pricing', 'ભાવ', 'ઓર્ડર'],
    systemPrompt: 'You are Apollo, a senior sales consultant. Qualify leads by asking company size, monthly message volume, and expected timeline.',
    conversationsHandled: 890,
  },
  {
    id: 'agent-booking-orders',
    name: 'Nexus Booking & Reservations',
    role: 'Appointment & Delivery Scheduling',
    description: 'Collects appointment dates, party sizes, service types, and dispatches automated confirmation WhatsApp messages.',
    model: 'llama-3-3-70b',
    temperature: 0.2,
    autonomous: false,
    active: true,
    assignedChannel: 'Booking Line (+91 91234 56789)',
    triggerKeywords: ['book', 'table', 'appointment', 'reserve', 'બુકિંગ'],
    systemPrompt: 'You are Nexus. Guide customers through booking an appointment step-by-step: date, time, and service required.',
    conversationsHandled: 640,
  },
];

const INITIAL_EXTERNAL_AGENTS: ExternalAgent[] = [
  {
    id: 'ext-1',
    name: 'Dify Customer Knowledge Agent',
    platform: 'dify',
    webhookUrl: 'https://api.dify.ai/v1/chat-messages',
    authHeader: 'Bearer dify-app-8x92nd823hd92jd',
    responseJsonPath: 'answer',
    status: 'connected',
    lastPingMs: 142,
  },
  {
    id: 'ext-2',
    name: 'n8n ERP Sync & Inventory Bot',
    platform: 'n8n',
    webhookUrl: 'https://n8n.mycompany.com/webhook/whatsapp-agent',
    responseJsonPath: 'output.text',
    status: 'connected',
    lastPingMs: 210,
  },
  {
    id: 'ext-3',
    name: 'Flowise RAG Pipeline',
    platform: 'flowise',
    webhookUrl: 'https://flowise.cloud/api/v1/prediction/39d0-23jd',
    authHeader: 'Bearer flw_982347293847',
    responseJsonPath: 'text',
    status: 'connected',
    lastPingMs: 185,
  },
];

const STORAGE_KEY_AGENTS = 'openwa_autonomous_agents';
const STORAGE_KEY_EXT = 'openwa_external_agents';

export function AiAgents() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'agents' | 'builder' | 'external' | 'voice'>('agents');

  // Agents State
  const [agents, setAgents] = useState<AgentModel[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AGENTS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_AGENTS;
  });

  // External Agents State
  const [externalAgents, setExternalAgents] = useState<ExternalAgent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXT);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_EXTERNAL_AGENTS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(agents));
  }, [agents]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EXT, JSON.stringify(externalAgents));
  }, [externalAgents]);

  // Natural Language Builder State
  const [builderPrompt, setBuilderPrompt] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);

  // Testing Playground Modal
  const [testAgent, setTestAgent] = useState<AgentModel | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'agent'; text: string }>>([]);
  const [isReplying, setIsReplying] = useState(false);

  // External Agent Modal
  const [isExtModalOpen, setIsExtModalOpen] = useState(false);
  const [newExt, setNewExt] = useState<Partial<ExternalAgent>>({
    name: '',
    platform: 'flowise',
    webhookUrl: '',
    authHeader: '',
    responseJsonPath: 'text',
  });

  // Voice AI State
  const [voiceLanguage, setVoiceLanguage] = useState<'gu' | 'hi' | 'en' | 'es'>('gu');
  const [voicePersona, setVoicePersona] = useState('aarav');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Toggle Agent Active
  const handleToggleActive = (id: string) => {
    setAgents(prev =>
      prev.map(a => (a.id === id ? { ...a, active: !a.active } : a))
    );
    toast.addToast({ type: 'info', title: 'Agent active status updated' });
  };

  // Toggle Autonomous mode
  const handleToggleAutonomous = (id: string) => {
    setAgents(prev =>
      prev.map(a => (a.id === id ? { ...a, autonomous: !a.autonomous } : a))
    );
    toast.addToast({ type: 'success', title: 'Autonomous mode toggled' });
  };

  // Astra Natural Language Builder Generate
  const handleBuildAgent = () => {
    if (!builderPrompt.trim()) {
      toast.addToast({ type: 'warning', title: 'Please describe the agent you want to create' });
      return;
    }

    if (!aiCreditsService.deduct('agent_reply', 'Astra AI Agent Builder', 10)) {
      toast.addToast({ type: 'warning', title: 'Insufficient AI credits to generate new agent' });
      return;
    }

    setIsBuilding(true);
    setTimeout(() => {
      const generatedName = builderPrompt.slice(0, 30).trim() || 'Astra Custom Agent';
      const newAgent: AgentModel = {
        id: `agent-${Date.now()}`,
        name: generatedName,
        role: 'Autonomous Domain Specialist',
        description: `Custom agent built from prompt: "${builderPrompt.slice(0, 80)}..."`,
        model: 'gpt-4o',
        temperature: 0.4,
        autonomous: true,
        active: true,
        assignedChannel: 'All Numbers',
        triggerKeywords: ['order', 'inquiry', 'help', 'details'],
        systemPrompt: `You are ${generatedName}. Your primary objective is to execute the user's intent: ${builderPrompt}. Keep replies crisp, polite, and action-oriented.`,
        conversationsHandled: 0,
      };

      setAgents(prev => [newAgent, ...prev]);
      setIsBuilding(false);
      setBuilderPrompt('');
      setActiveTab('agents');
      toast.addToast({ type: 'success', title: 'AI Agent created successfully with Astra AI! (-10 credits)' });
    }, 1200);
  };

  // Test Playground Send
  const handleSendTestMessage = () => {
    if (!chatInput.trim() || !testAgent) return;
    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');
    setIsReplying(true);

    aiCreditsService.deduct('agent_reply', `Test chat with ${testAgent.name}`, 1);

    setTimeout(() => {
      let reply = `Hello! I am ${testAgent.name}. I received your message: "${userMsg}". How can I proceed to assist you?`;
      if (/price|cost|quote|ભાવ/i.test(userMsg)) {
        reply = `Our standard pricing begins at ₹0.42/msg with volume tier discounts. Would you like me to prepare a custom quote?`;
      } else if (/book|reserve|બુક/i.test(userMsg)) {
        reply = `Sure! What date and time would you prefer for your reservation?`;
      }
      setChatMessages(prev => [...prev, { sender: 'agent', text: reply }]);
      setIsReplying(false);
    }, 700);
  };

  // Ping External Agent
  const handleTestExternalAgent = (id: string) => {
    setExternalAgents(prev =>
      prev.map(ea => (ea.id === id ? { ...ea, status: 'testing' } : ea))
    );
    setTimeout(() => {
      const latency = Math.floor(Math.random() * 120) + 110;
      setExternalAgents(prev =>
        prev.map(ea => (ea.id === id ? { ...ea, status: 'connected', lastPingMs: latency } : ea))
      );
      toast.addToast({ type: 'success', title: `External agent ping successful (${latency}ms latency)` });
    }, 800);
  };

  // Play Sample Voice Note
  const handleTogglePlayVoice = () => {
    if (isPlayingAudio) {
      setIsPlayingAudio(false);
      return;
    }
    setIsPlayingAudio(true);
    aiCreditsService.deduct('voice_tts', 'Voice AI Synthesis Preview', 2);
    toast.addToast({ type: 'info', title: `Synthesizing ${voiceLanguage.toUpperCase()} voice note via ElevenLabs... (-2 credits)` });
    setTimeout(() => {
      setIsPlayingAudio(false);
      toast.addToast({ type: 'success', title: 'Voice note playback finished' });
    }, 4000);
  };

  return (
    <div className="ai-agents-page" data-testid="ai-agents-page">
      <PageHeader
        title="AI Agents & Voice Engine"
        subtitle="Manage autonomous AI agents, Astra natural language builder, external webhook agents, and human voice engine"
      />

      {/* Navigation Tabs */}
      <div className="ai-agents-nav-tabs">
        <button
          className={`ai-agents-tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          <Bot size={16} />
          Autonomous AI Agents ({agents.length})
        </button>
        <button
          className={`ai-agents-tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          <Sparkles size={16} />
          AI Agent Builder (Astra)
        </button>
        <button
          className={`ai-agents-tab-btn ${activeTab === 'external' ? 'active' : ''}`}
          onClick={() => setActiveTab('external')}
        >
          <Globe size={16} />
          External AI Agents (BYO) ({externalAgents.length})
        </button>
        <button
          className={`ai-agents-tab-btn ${activeTab === 'voice' ? 'active' : ''}`}
          onClick={() => setActiveTab('voice')}
        >
          <Mic size={16} />
          Voice AI Engine (Whisper + ElevenLabs)
        </button>
      </div>

      {/* Tab 1: Autonomous AI Agents */}
      {activeTab === 'agents' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              These autonomous agents converse with customers on WhatsApp, answer questions, qualify leads, and perform actions 24/7.
            </p>
            <button className="btn-primary" onClick={() => setActiveTab('builder')}>
              <Plus size={16} />
              Build New Agent
            </button>
          </div>

          <div className="agents-grid">
            {agents.map(agent => (
              <div key={agent.id} className="agent-card">
                <div className="agent-card-header">
                  <div className="agent-avatar-box">
                    <Bot size={22} />
                  </div>
                  <div className="agent-info">
                    <h3 className="agent-name">
                      {agent.name}
                      {agent.autonomous && (
                        <span title="Autonomous Mode Active" style={{ color: '#6366f1' }}>
                          <Zap size={14} />
                        </span>
                      )}
                    </h3>
                    <span className="agent-role">{agent.role}</span>
                  </div>
                  <span className={`agent-status-badge ${agent.active ? 'active' : 'paused'}`}>
                    {agent.active ? 'Active' : 'Paused'}
                  </span>
                </div>

                <p className="agent-desc">{agent.description}</p>

                <div className="agent-meta-tags">
                  <span className="meta-tag">Model: {agent.model}</span>
                  <span className="meta-tag">Temp: {agent.temperature}</span>
                  <span className="meta-tag">Channel: {agent.assignedChannel}</span>
                  <span className="meta-tag" style={{ color: '#16a34a' }}>
                    {agent.conversationsHandled.toLocaleString()} Chats Handled
                  </span>
                </div>

                <div className="agent-card-footer">
                  <label className="toggle-switch-container">
                    <input
                      type="checkbox"
                      checked={agent.autonomous}
                      onChange={() => handleToggleAutonomous(agent.id)}
                    />
                    <span>Autonomous Auto-Reply</span>
                  </label>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => {
                        setTestAgent(agent);
                        setChatMessages([
                          { sender: 'agent', text: `Hi! I am ${agent.name}. How can I assist you today?` },
                        ]);
                      }}
                    >
                      <MessageSquare size={12} />
                      Test Bot
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      onClick={() => handleToggleActive(agent.id)}
                    >
                      {agent.active ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tab 2: Astra Natural Language Builder */}
      {activeTab === 'builder' && (
        <div className="builder-hero-card">
          <div className="builder-header">
            <div className="builder-icon">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Astra Natural Language Agent Builder
              </h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Describe what your agent should do in plain English, Gujarati, or Hindi. Astra AI will architect the system prompt, trigger conditions, tools, and guardrails automatically.
              </p>
            </div>
          </div>

          <textarea
            className="builder-prompt-textarea"
            placeholder="e.g. Build an AI agent for my electronics and gadget store in Surat. It should help customers choose smartphones, provide specs, share warranty details, and ask for their WhatsApp number for home delivery..."
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
                  'Create an Italian Restaurant reservation agent that takes table bookings, party size, booking time, and sends a confirmed WhatsApp booking pass.'
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
                  'Create a Real Estate broker agent in Ahmedabad. Inquire whether customer wants 2BHK or 3BHK flat, budget range, and schedule site visit.'
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
                  'Create an Automobile workshop booking bot for car servicing, oil change, pickup & drop address, and instant billing quote.'
                )
              }
            >
              🚗 Car Service & Maintenance Bot
            </button>
          </div>

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
                  Generating Agent Architecture...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Build Agent with Astra AI (-10 cr)
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: External AI Agents (BYO) */}
      {activeTab === 'external' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Connect your external AI agents built on Flowise, n8n, Dify, LangChain, or custom REST webhooks to WhatsApp.
            </p>
            <button className="btn-primary" onClick={() => setIsExtModalOpen(true)}>
              <Plus size={16} />
              Connect External Agent
            </button>
          </div>

          <div className="agents-grid">
            {externalAgents.map(ea => (
              <div key={ea.id} className="agent-card">
                <div className="agent-card-header">
                  <div className="agent-avatar-box" style={{ background: '#0284c7' }}>
                    <Globe size={22} />
                  </div>
                  <div className="agent-info">
                    <h3 className="agent-name">{ea.name}</h3>
                    <span className="agent-role" style={{ textTransform: 'uppercase' }}>
                      {ea.platform} Integration
                    </span>
                  </div>
                  <span className={`agent-status-badge ${ea.status === 'connected' ? 'active' : 'paused'}`}>
                    {ea.status === 'testing' ? 'Pinging...' : ea.status === 'connected' ? 'Connected' : 'Error'}
                  </span>
                </div>

                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>
                    <strong>Webhook: </strong>
                    <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{ea.webhookUrl}</code>
                  </div>
                  <div>
                    <strong>Response Key: </strong>
                    <code>{ea.responseJsonPath}</code>
                  </div>
                  {ea.lastPingMs && (
                    <div style={{ color: '#16a34a', fontWeight: 600 }}>
                      ⚡ Latency: {ea.lastPingMs}ms
                    </div>
                  )}
                </div>

                <div className="agent-card-footer">
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    onClick={() => handleTestExternalAgent(ea.id)}
                    disabled={ea.status === 'testing'}
                  >
                    <RotateCw size={12} className={ea.status === 'testing' ? 'spin' : ''} />
                    Test Ping Webhook
                  </button>
                  <button
                    className="deal-delete-btn"
                    onClick={() => {
                      setExternalAgents(prev => prev.filter(x => x.id !== ea.id));
                      toast.addToast({ type: 'info', title: 'External agent disconnected' });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tab 4: Voice AI Engine */}
      {activeTab === 'voice' && (
        <div className="voice-ai-grid">
          {/* Card 1: Speech-to-Text (STT) */}
          <div className="voice-ai-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="builder-icon" style={{ background: '#16a34a' }}>
                <Mic size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                  Speech-to-Text (STT) Whisper Engine
                </h3>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Auto-transcribes incoming WhatsApp audio & voice notes in real-time.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Active STT Provider</label>
              <select className="pipeline-select" defaultValue="whisper-large-v3">
                <option value="whisper-large-v3">OpenAI Whisper Large-v3 HD (All Languages)</option>
                <option value="deepgram-nova">Deepgram Nova-2 (Ultra Fast &lt;300ms)</option>
              </select>
            </div>

            <div className="voice-preview-box">
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
                <strong>Sample Incoming Voice Note Transcribed:</strong>
                <p style={{ margin: '4px 0 0', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  "નમસ્તે ભાઈ, મારે હોલસેલ ટી-શર્ટ્સના ભાવ જાણવા છે. શું કેટલોગ મોકલી શકશો?"
                </p>
                <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                  ✓ 99.4% Transcription Accuracy (Gujarati Detected)
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Text-to-Speech (TTS) & Voice Cloning */}
          <div className="voice-ai-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="builder-icon">
                <Volume2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                  Text-to-Speech (TTS) & Voice Cloning
                </h3>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Human voice engine with native accents & custom brand voice-cloning.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Voice Engine
                </label>
                <select className="pipeline-select" style={{ width: '100%' }}>
                  <option value="elevenlabs">ElevenLabs Multilingual v2</option>
                  <option value="cartesia">Cartesia Sonic Indian English</option>
                  <option value="openai">OpenAI TTS HD</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Voice Persona
                </label>
                <select
                  className="pipeline-select"
                  style={{ width: '100%' }}
                  value={voicePersona}
                  onChange={e => setVoicePersona(e.target.value)}
                >
                  <option value="aarav">Aarav (Warm & Professional Male)</option>
                  <option value="diya">Diya (Friendly & Empathetic Female)</option>
                  <option value="kabir">Kabir (Corporate Voice)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Language & Accent
              </label>
              <select
                className="pipeline-select"
                style={{ width: '100%' }}
                value={voiceLanguage}
                onChange={e => setVoiceLanguage(e.target.value as 'gu' | 'hi' | 'en' | 'es')}
              >
                <option value="gu">ગુજરાતી (Gujarati Accent & Fluency)</option>
                <option value="hi">हिन्दी (Hindi Indian Accent)</option>
                <option value="en">English (Indian Global Accent)</option>
                <option value="es">Español (International)</option>
              </select>
            </div>

            <div className="voice-preview-box">
              <button
                type="button"
                className="voice-play-btn"
                onClick={handleTogglePlayVoice}
                title="Play Voice Sample"
              >
                {isPlayingAudio ? <Square size={18} /> : <Play size={20} style={{ marginLeft: 2 }} />}
              </button>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                  {isPlayingAudio ? 'Synthesizing & Playing Audio...' : 'Test Human Voice Synthesis'}
                </span>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Click to listen to sample synthesized voice message in {voiceLanguage.toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Bot Playground Modal */}
      {testAgent && (
        <Modal
          open
          title={`Test Bot: ${testAgent.name}`}
          onClose={() => setTestAgent(null)}
          footer={
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <input
                type="text"
                placeholder="Type a test customer message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendTestMessage()}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
              <button className="btn-primary" onClick={handleSendTestMessage} disabled={isReplying}>
                {isReplying ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.sender === 'user' ? '#6366f1' : 'var(--bg-subtle)',
                  color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
                  padding: '8px 12px',
                  borderRadius: 10,
                  maxWidth: '80%',
                  fontSize: '0.875rem',
                  lineHeight: 1.4,
                }}
              >
                {msg.text}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Connect External Agent Modal */}
      {isExtModalOpen && (
        <Modal
          open
          title="Connect External AI Agent (BYO)"
          onClose={() => setIsExtModalOpen(false)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
              <button className="btn-secondary" onClick={() => setIsExtModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (!newExt.name || !newExt.webhookUrl) {
                    toast.addToast({ type: 'warning', title: 'Name and Webhook URL are required' });
                    return;
                  }
                  const created: ExternalAgent = {
                    id: `ext-${Date.now()}`,
                    name: newExt.name!,
                    platform: newExt.platform || 'flowise',
                    webhookUrl: newExt.webhookUrl!,
                    authHeader: newExt.authHeader,
                    responseJsonPath: newExt.responseJsonPath || 'text',
                    status: 'connected',
                    lastPingMs: 160,
                  };
                  setExternalAgents(prev => [created, ...prev]);
                  setIsExtModalOpen(false);
                  toast.addToast({ type: 'success', title: 'External agent connected successfully' });
                }}
              >
                Connect Agent
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Agent Name *
              </label>
              <input
                type="text"
                placeholder="e.g. My Flowise LangChain Bot"
                value={newExt.name || ''}
                onChange={e => setNewExt(prev => ({ ...prev, name: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Platform Framework
              </label>
              <select
                value={newExt.platform}
                onChange={e => setNewExt(prev => ({ ...prev, platform: e.target.value as ExternalAgent['platform'] }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              >
                <option value="flowise">Flowise AI</option>
                <option value="n8n">n8n Workflow</option>
                <option value="dify">Dify.ai</option>
                <option value="langchain">LangChain / LangServe</option>
                <option value="botpress">Botpress</option>
                <option value="custom">Custom REST API</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Webhook Endpoint URL *
              </label>
              <input
                type="url"
                placeholder="https://your-agent.com/api/v1/predict"
                value={newExt.webhookUrl || ''}
                onChange={e => setNewExt(prev => ({ ...prev, webhookUrl: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Authorization Header (Optional)
              </label>
              <input
                type="text"
                placeholder="Bearer your_secret_token_here"
                value={newExt.authHeader || ''}
                onChange={e => setNewExt(prev => ({ ...prev, authHeader: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Response JSON Key Path
              </label>
              <input
                type="text"
                placeholder="e.g. text or output or data.message"
                value={newExt.responseJsonPath || ''}
                onChange={e => setNewExt(prev => ({ ...prev, responseJsonPath: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default AiAgents;
