import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Settings,
  Bot,
  Plus,
  Search,
  Trash2,
  Edit3,
  Eye,
  Send,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Download,
  CheckCheck,
  Sliders,
  UserCheck,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { chatbotApi, aiApi } from '../services/api';
import './ChatbotTraining.css';

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  type?: string;
  fileType?: string;
  status?: string;
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AiConfig {
  enabled: boolean;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  useKnowledgeBase?: boolean;
  autoHandoff?: boolean;
  handoffKeywords?: string;
  fallbackMessage?: string;
  maxContextMessages?: number;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  confidence?: string;
  sourceDocs?: string[];
}

const PRESET_KNOWLEDGE_PACKS = [
  {
    packId: 'insurance',
    title: 'Health & Term Insurance Pack',
    icon: '🏥',
    description: 'Complete guidelines for cashless hospitalization, term insurance KYC, and waiting periods in Gujarati & English.',
    docs: [
      {
        title: 'ટર્મ ઇન્સ્યોરન્સ પાત્રતા અને જરૂરી ડોક્યુમેન્ટ્સ (Term Insurance KYC)',
        type: 'faq',
        content: `ટર્મ ઇન્સ્યોરન્સ ખરીદવા માટે જરૂરી માહિતી:
1. પાત્રતા ઉંમર: 18 થી 65 વર્ષ.
2. ઓળખનો પુરાવો (ID Proof): આધાર કાર્ડ, પાન કાર્ડ (PAN Card ફરજિયાત છે).
3. સરનામાનો પુરાવો: લાઇટ બિલ, આધાર કાર્ડ, અથવા પાસપોર્ટ.
4. આવકનો પુરાવો (Income Proof):
   - નોકરિયાત વર્ગ: છેલ્લા 3 મહિનાની સેલેરી સ્લિપ + 6 મહિનાનું બેંક સ્ટેટમેન્ટ.
   - વેપારી / સેલ્ફ એમ્પ્લોઇડ: છેલ્લા 2 વર્ષના ITR (ઇન્કમ ટેક્સ રિટર્ન) + કમ્પ્યુટેશન ઓફ ઇન્કમ.
5. મેડિકલ ટેસ્ટ: મોટાભાગના કિસ્સામાં 45 વર્ષથી વધુ ઉંમર અથવા ₹50 લાખથી વધુ સમ એશ્યોર્ડ માટે ટેલિ-મેડિકલ અથવા હોમ બ્લડ ટેસ્ટ જરૂરી હોય છે.`,
      },
      {
        title: 'કેશલેસ ક્લેઇમ પ્રક્રિયા અને નિયમો (Cashless Hospitalization Guide)',
        type: 'guideline',
        content: `કેશલેસ હોસ્પિટલાઇઝેશન કેવી રીતે મેળવવું:
1. નેટવર્ક હોસ્પિટલ: દર્દીને વીમા કંપનીની નેટવર્ક હોસ્પિટલમાં દાખલ કરવાના રહેશે.
2. પ્લાન્ડ દાખલ (Planned Admission): દાખલ થવાના 48 કલાક પહેલાં હોસ્પિટલના TPA ડેસ્ક પર પ્રી-ઓથોરાઇઝેશન ફોર્મ સબમિટ કરવું.
3. ઇમરજન્સી દાખલ (Emergency Admission): દાખલ થયાના 24 કલાકની અંદર હોસ્પિટલ TPA દ્વારા કંપનીને જાણ કરવી.
4. જરૂરી કાગળો: હેલ્થ કાર્ડ, આધાર કાર્ડ, ડોક્ટરની પ્રિસ્ક્રિપ્શન, પ્રારંભિક ડાયગ્નોસિસ રિપોર્ટ્સ.
5. મંજૂરી સમય: સામાન્ય રીતે કંપની 1 થી 2 કલાકમાં પ્રાથમિક મંજૂરી (Initial Approval) મોકલે છે.
6. ડિસ્ચાર્જ સમયે: અંતિમ બિલ મોકલ્યા પછી 2 કલાકમાં ફાઇનલ કેશલેસ ક્લિયરન્સ મળે છે.`,
      },
      {
        title: 'પ્રી-એક્ઝિસ્ટિંગ બીમારીઓ અને વેટિંગ પિરિયડ (Pre-Existing Diseases)',
        type: 'product',
        content: `પ્રી-એક્ઝિસ્ટિંગ ડિસીઝ (PED) ના મહત્વના નિયમો:
1. વ્યાખ્યા: પોલિસી ખરીદતા પહેલા થયેલી કોઈપણ બીમારી (જેમ કે ડાયાબિટીસ, બીપી, થાયરોઇડ).
2. વેટિંગ પિરિયડ: નિયમિત પોલિસીમાં 24 થી 36 મહિનાનો પ્રતીક્ષા સમયગાળો હોય છે.
3. ડે-1 કવર: અમુક સ્પેસિફિક પ્લાનમાં વધારાનું પ્રીમિયમ ભરીને ડે-1 થી કવરેજ મેળવી શકાય છે.
4. જાહેર કરવાની ફરજ: પોલિસી લેતી વખતે તમામ જૂની બીમારીઓ જાહેર કરવી ફરજિયાત છે, અન્યથા ક્લેઇમ રદ થઈ શકે છે.`,
      },
    ],
  },
  {
    packId: 'mutual_funds',
    title: 'Mutual Funds & SIP Wealth Pack',
    icon: '📈',
    description: 'Systematic Investment Plan (SIP) basics, tax saving ELSS, and compounding calculations.',
    docs: [
      {
        title: 'SIP (સિસ્ટમેટિક ઇન્વેસ્ટમેન્ટ પ્લાન) ની શરૂઆત અને લાભો',
        type: 'faq',
        content: `SIP એટલે શું અને કેવી રીતે ચાલુ કરવી:
1. લઘુત્તમ રોકાણ: માત્ર ₹500 પ્રતિ મહિને થી શરૂ કરી શકાય છે.
2. રુપી કોસ્ટ એવરેજિંગ: માર્કેટ વધે કે ઘટે, દર મહિને ઓટોમેટિક યુનિટ્સ ખરીદાય છે, જેથી માર્કેટ ટાઇમિંગનું જોખમ ઘટે છે.
3. પાવર ઓફ કમ્પાઉન્ડિંગ: લાંબા ગાળે (10+ વર્ષ) 12-15% અંદાજિત વળતર સાથે મોટી વેલ્થ તૈયાર થાય છે.
4. જરૂરી KYC: પાન કાર્ડ, આધાર કાર્ડ, બેંક એકાઉન્ટ વિગતો, અને કેન્સલ ચેક.
5. લિક્વિડિટી: ઓપન-એન્ડેડ ફંડ્સમાંથી ગમે ત્યારે પૈસા પાછા ખેંચી શકાય છે.`,
      },
      {
        title: 'ELSS ટેક્સ સેવિંગ મ્યુચ્યુઅલ ફંડ (Section 80C Tax Deduction)',
        type: 'product',
        content: `ELSS (Equity Linked Savings Scheme) ના ફાયદા:
1. કલમ 80C હેઠળ આવકવેરામાં વાર્ષિક ₹1.5 લાખ સુધીની કરબચત (Tax Exemption).
2. લૉક-ઇન પિરિયડ: તમામ ટેક્સ સેવિંગ સાધનોમાં સૌથી ઓછો - માત્ર 3 વર્ષ. (PPF માં 15 વર્ષ, FD માં 5 વર્ષ).
3. ઇક્વિટી ગ્રોથ: સંપૂર્ણ રોકાણ શેરબજારમાં થતું હોવાથી ફુગાવાને હરાવતું શ્રેષ્ઠ રિટર્ન મળવાની સંભાવના રહે છે.`,
      },
    ],
  },
  {
    packId: 'motor',
    title: 'Vehicle & Motor Insurance Pack',
    icon: '🚗',
    description: 'Zero depreciation, roadside assistance, and accident claim step-by-step checklist.',
    docs: [
      {
        title: 'ઝીરો ડેપ્રિશિયેશન (Bumper-to-Bumper) એડ-ઓન કવરના ફાયદા',
        type: 'product',
        content: `ઝીરો ડેપ (Zero Depreciation / Nil Dep) કવરના મુખ્ય મુદ્દા:
1. પૂરેપૂરું વળતર: અકસ્માત વખતે પ્લાસ્ટિક, ફાઈબર, કાચ કે રબરના પાર્ટ્સ પર કોઈપણ ડેપ્રિશિયેશન કાપ્યા વિના કંપની 100% ક્લેઇમ ચૂકવે છે.
2. સામાન્ય પોલિસી vs ઝીરો ડેપ: સ્ટાન્ડર્ડ પોલિસીમાં પ્લાસ્ટિક પાર્ટ્સ પર 50% સુધી કાપ મુકાય છે, જ્યારે ઝીરો ડેપમાં માત્ર ફાઈલ ચાર્જ ભરવાનો રહે છે.
3. વાહનની ઉંમર: સામાન્ય રીતે વાહન 5 વર્ષ જૂનું થાય ત્યાં સુધી જ ઝીરો ડેપ એડ-ઓન મળે છે.`,
      },
      {
        title: 'વાહન અકસ્માત ક્લેઇમ પ્રક્રિયા (Accident Claim Process)',
        type: 'guideline',
        content: `વાહન અકસ્માત સમયે તાત્કાલિક કરવાના પગલાં:
1. ફોટોગ્રાફ્સ: ઘટનાસ્થળે વાહનના ડેમેજના સ્પષ્ટ ફોટા અને વીડિયો લેવા.
2. ક્લેઇમ ઇન્ટિમેશન: ટોલ-ફ્રી નંબર અથવા WhatsApp બોટ દ્વારા તરત જ ક્લેઇમ રજીસ્ટર કરવો.
3. વાહન ગેરેજમાં મોકલવું: નેટવર્ક ગેરેજમાં ગાડી મોકલવી જેથી સર્વેયર તપાસ કરી શકે.
4. જરૂરી કાગળો: આર.સી. બુક (RC Copy), ડ્રાઇવિંગ લાયસન્સ (DL), પોલિસી કોપી, અને ક્લેઇમ ફોર્મ પર સહી.`,
      },
    ],
  },
];

const PRESET_SYSTEM_PERSONAS = [
  {
    title: '🌟 Friendly Gujarati Advisor (Recommended)',
    prompt: `You are PadosiAgent, a warm, polite, and exceptionally knowledgeable Gujarati and English-speaking insurance & wealth assistant.
Your main goal is to help customers understand insurance, Mutual Fund SIPs, and claims with zero jargon.
Rules:
1. Always respond in the language the user asked in (Gujarati, Hindi, or English).
2. Reference your knowledge base facts precisely. If an exact answer is not in your documents, provide helpful general context and offer to connect them to a senior advisor.
3. Be respectful and use culturally polite Gujarati phrases like "નમસ્તે", "ચોક્કસ", "આભાર".
4. When talking about financial returns, clarify that mutual fund investments are subject to market risks.`,
  },
  {
    title: '💼 Professional Wealth & Corporate Consultant',
    prompt: `You are an elite financial advisory chatbot representing a high-trust wealth management brokerage.
Maintain a crisp, highly analytical, and professional tone.
Provide bulleted breakdowns of policy features, tax implications, and claim turnaround times based strictly on company knowledge docs.`,
  },
  {
    title: '⚡ Fast & Crisp Support Bot',
    prompt: `You are a fast customer support WhatsApp agent. Keep every answer under 3 sentences unless the user explicitly asks for a detailed breakdown.
Focus on immediate answers, required documents, and next steps.`,
  },
];

export function ChatbotTraining() {
  const { t } = useTranslation();
  const toast = useToast();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'knowledge' | 'simulator' | 'config' | 'packs'>('knowledge');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [viewDoc, setViewDoc] = useState<KnowledgeDoc | null>(null);
  const [editDoc, setEditDoc] = useState<KnowledgeDoc | null>(null);
  const [form, setForm] = useState({ title: '', content: '', type: 'faq' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importingPackId, setImportingPackId] = useState<string | null>(null);
  const [isTogglingMaster, setIsTogglingMaster] = useState(false);

  // Simulator
  const [testPrompt, setTestPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'init',
      sender: 'ai',
      text: 'નમસ્તે! હું PadosiAgent AI સહાયક છું. તમે મને ઇન્સ્યોરન્સ, મ્યુચ્યુઅલ ફંડ SIP અથવા ક્લેઇમ વિશે કંઈપણ પૂછી શકો છો.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [testingAi, setTestingAi] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([chatbotApi.listDocs(), chatbotApi.getConfig()]);
      const rawDocs = Array.isArray(d) ? d : [];
      setDocs(
        rawDocs.map((item: any) => ({
          ...item,
          type: item.type || item.fileType || 'faq',
          enabled: item.status === 'ready' || item.enabled !== false,
        }))
      );
      if (c) {
        const conf = c as any;
        setConfig({
          ...conf,
          temperature: typeof conf.temperature === 'number' ? conf.temperature : 0.7,
        });
      }
    } catch {
      toast.error('Failed to load knowledge base data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditDoc(null);
    setForm({ title: '', content: '', type: 'faq' });
    setShowModal(true);
  };

  const openEdit = (doc: KnowledgeDoc) => {
    setEditDoc(doc);
    setForm({ title: doc.title, content: doc.content, type: doc.type || doc.fileType || 'faq' });
    setShowModal(true);
  };

  const handleToggleMasterAi = async () => {
    if (!config || isTogglingMaster) return;
    setIsTogglingMaster(true);
    const newStatus = !config.enabled;
    try {
      await chatbotApi.updateConfig({ enabled: newStatus });
      setConfig(prev => (prev ? { ...prev, enabled: newStatus } : null));
      toast.success(newStatus ? 'AI Assistant Activated' : 'AI Assistant Paused');
    } catch {
      toast.error('Failed to update AI status');
    } finally {
      setIsTogglingMaster(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    try {
      if (editDoc) {
        await chatbotApi.updateDoc(editDoc.id, form);
        toast.success('Document updated successfully');
      } else {
        await chatbotApi.createDoc(form);
        toast.success('Knowledge document added');
      }
      setShowModal(false);
      await load();
    } catch {
      toast.error('Failed to save document');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this knowledge document?')) return;
    try {
      await chatbotApi.deleteDoc(id);
      toast.success('Document deleted');
      await load();
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const handleCopyContent = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Content copied to clipboard');
  };

  const handleImportPack = async (pack: typeof PRESET_KNOWLEDGE_PACKS[0]) => {
    setImportingPackId(pack.packId);
    try {
      for (const doc of pack.docs) {
        await chatbotApi.createDoc(doc);
      }
      toast.success(`Imported ${pack.docs.length} documents from ${pack.title}!`);
      await load();
      setTab('knowledge');
    } catch {
      toast.error('Failed to import knowledge pack');
    } finally {
      setImportingPackId(null);
    }
  };

  const handleConfigSave = async () => {
    if (!config) return;
    try {
      await chatbotApi.updateConfig(config as unknown as Record<string, unknown>);
      toast.success('AI Configuration updated successfully');
    } catch {
      toast.error('Failed to update AI configuration');
    }
  };

  const handleSendTestQuery = async (queryToSend?: string) => {
    const text = (queryToSend || testPrompt).trim();
    if (!text || testingAi) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatHistory(prev => [...prev, userMsg]);
    setTestPrompt('');
    setTestingAi(true);

    try {
      const historyPayload = chatHistory.slice(-6).map(m => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }));

      const res = await aiApi.chat({
        message: text,
        conversationHistory: historyPayload,
      });

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confidence: res.confidence,
        sourceDocs: res.sourceDocs,
      };

      setChatHistory(prev => [...prev, aiMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: 'માફ કરશો, AI પ્રોસેસિંગમાં ક્ષતિ આવી છે. કૃપા કરીને LLM Configuration માં API કી અને મોડેલ સેટિંગ્સ તપાસો.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confidence: 'low',
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setTestingAi(false);
    }
  };

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return docs.filter(doc => {
      const matchesSearch =
        searchQuery === '' ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedTypeFilter === 'all' || (doc.type || doc.fileType) === selectedTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [docs, searchQuery, selectedTypeFilter]);

  // Document type counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length, faq: 0, product: 0, guideline: 0, custom: 0 };
    docs.forEach(d => {
      const t = d.type || d.fileType || 'faq';
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [docs]);

  const sampleQuestions = [
    'ટર્મ ઇન્સ્યોરન્સ લેવા માટે કયા ડોક્યુમેન્ટ જોઈએ?',
    'કેશલેસ હોસ્પિટલાઇઝેશન કેવી રીતે મળે?',
    'મ્યુચ્યુઅલ ફંડમાં ₹500 થી SIP કેવી રીતે ચાલુ કરવી?',
    'ઝીરો ડેપ્રિશિયેશન (Bumper-to-Bumper) ના શું ફાયદા છે?',
    'How do I claim insurance after a car accident?',
  ];

  if (loading && docs.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div className="cbt-container">
      {/* Header with Quick Action & Master AI Switch */}
      <div className="cbt-header">
        <div className="cbt-title-area">
          <div className="cbt-title-row">
            <h1 className="cbt-title">Chatbot Training & Knowledge Base</h1>
            <span className="cbt-engine-badge">
              <Sparkles size={13} /> RAG Knowledge Studio
            </span>
          </div>
          <p className="cbt-subtitle">
            Train your AI with Gujarati and English domain knowledge, simulate customer chats, and manage LLM parameters
          </p>
        </div>

        <div className="cbt-header-actions">
          {/* 1-Click Master AI Toggle */}
          <button
            onClick={handleToggleMasterAi}
            disabled={isTogglingMaster || !config}
            className={`cbt-master-toggle ${config?.enabled ? 'active' : 'inactive'}`}
            title="Click to toggle AI auto-reply on/off"
          >
            <span className="cbt-toggle-beacon" />
            {config?.enabled ? 'AI Auto-Reply Active' : 'AI Inactive (Click to Enable)'}
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setTab('packs')}
          >
            <Download size={14} /> Starter Packs
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={openCreate}
          >
            <Plus size={15} /> Add Document
          </button>
        </div>
      </div>

      {/* Top KPI Metrics Cards */}
      <div className="cbt-stats-grid">
        <div className="cbt-stat-card">
          <div>
            <div className="cbt-stat-label">Total Knowledge Docs</div>
            <div className="cbt-stat-value">{docs.length}</div>
          </div>
          <div className="cbt-stat-icon blue">
            <BookOpen size={22} />
          </div>
        </div>

        <div className="cbt-stat-card">
          <div>
            <div className="cbt-stat-label">FAQs & Q&A Pairs</div>
            <div className="cbt-stat-value" style={{ color: '#a855f7' }}>
              {typeCounts.faq || 0}
            </div>
          </div>
          <div className="cbt-stat-icon purple">
            <HelpCircle size={22} />
          </div>
        </div>

        <div className="cbt-stat-card">
          <div>
            <div className="cbt-stat-label">Product & Claim Guides</div>
            <div className="cbt-stat-value" style={{ color: '#10b981' }}>
              {(typeCounts.product || 0) + (typeCounts.guideline || 0)}
            </div>
          </div>
          <div className="cbt-stat-icon emerald">
            <ShieldCheck size={22} />
          </div>
        </div>

        <div className="cbt-stat-card">
          <div>
            <div className="cbt-stat-label">Active LLM Engine</div>
            <div className="cbt-stat-value" style={{ fontSize: 20, textTransform: 'uppercase' }}>
              {config?.provider || 'Groq'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {config?.model ? config.model.split('/').pop() : 'llama-3.3-70b'}
            </div>
          </div>
          <div className="cbt-stat-icon amber">
            <Zap size={22} />
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="cbt-tabs-nav">
        <button
          className={`cbt-tab-btn ${tab === 'knowledge' ? 'active' : ''}`}
          onClick={() => setTab('knowledge')}
        >
          <BookOpen size={16} /> Knowledge Base <span className="cbt-tab-count">{docs.length}</span>
        </button>
        <button
          className={`cbt-tab-btn ${tab === 'simulator' ? 'active' : ''}`}
          onClick={() => setTab('simulator')}
        >
          <Bot size={16} /> WhatsApp AI Simulator
        </button>
        <button
          className={`cbt-tab-btn ${tab === 'config' ? 'active' : ''}`}
          onClick={() => setTab('config')}
        >
          <Settings size={16} /> LLM & RAG Settings
        </button>
        <button
          className={`cbt-tab-btn ${tab === 'packs' ? 'active' : ''}`}
          onClick={() => setTab('packs')}
        >
          <Download size={16} /> Starter Packs
        </button>
      </div>

      {/* ──────────────── TAB 1: KNOWLEDGE BASE ──────────────── */}
      {tab === 'knowledge' && (
        <div>
          {/* Search, Filter Pills, and Actions */}
          <div className="cbt-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 360px', flexWrap: 'wrap' }}>
              <div className="cbt-search-box">
                <Search size={16} className="cbt-search-icon" />
                <input
                  type="text"
                  className="cbt-search-input"
                  placeholder="Search knowledge documents..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Type Filter Pills */}
              <div className="cbt-type-pills">
                {[
                  { id: 'all', label: 'All', count: docs.length },
                  { id: 'faq', label: 'FAQ', count: typeCounts.faq || 0 },
                  { id: 'product', label: 'Product Info', count: typeCounts.product || 0 },
                  { id: 'guideline', label: 'Guidelines', count: typeCounts.guideline || 0 },
                ].map(item => (
                  <button
                    key={item.id}
                    className={`cbt-type-pill ${selectedTypeFilter === item.id ? 'active' : ''}`}
                    onClick={() => setSelectedTypeFilter(item.id)}
                  >
                    <span>{item.label}</span>
                    <span style={{ opacity: 0.75, fontSize: 11, marginLeft: 4 }}>({item.count})</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={load}
                title="Refresh Documents"
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button className="btn btn-primary btn-sm" onClick={openCreate}>
                <Plus size={15} /> Add Document
              </button>
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="cbt-empty-state">
              <BookOpen size={48} className="cbt-empty-icon" />
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                {searchQuery ? 'No matching documents found' : 'No knowledge base documents yet'}
              </h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto 20px auto', lineHeight: 1.5 }}>
                {searchQuery
                  ? 'Try searching with different keywords or switch the filter categories above.'
                  : 'Add FAQs, product brochures, or insurance guidelines so your AI chatbot can accurately answer queries on WhatsApp.'}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={openCreate}>
                  <Plus size={15} /> Add First Document
                </button>
                <button className="btn btn-secondary" onClick={() => setTab('packs')}>
                  <Download size={15} /> Import Pre-built Pack
                </button>
              </div>
            </div>
          ) : (
            <div className="cbt-docs-grid">
              {filteredDocs.map(doc => {
                const docType = doc.type || doc.fileType || 'faq';
                const typeIcons: Record<string, string> = {
                  faq: '❓',
                  product: '📋',
                  guideline: '🛡️',
                  custom: '📄',
                };
                const badgeIcon = typeIcons[docType] || '📄';

                return (
                  <div key={doc.id} className="cbt-doc-card">
                    <div>
                      <div className="cbt-doc-header">
                        <span className="cbt-doc-title">
                          {doc.title}
                        </span>
                        <span className={`cbt-badge-type ${docType}`}>
                          {badgeIcon} {docType}
                        </span>
                      </div>

                      <div className="cbt-doc-preview">
                        {doc.content}
                      </div>
                    </div>

                    <div className="cbt-doc-footer">
                      <div>
                        {doc.content.length} chars &bull; {Math.ceil(doc.content.split(/\s+/).filter(Boolean).length)} words
                      </div>
                      <div className="cbt-doc-actions">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => setViewDoc(doc)}
                          title="View Document Details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleCopyContent(doc.content, doc.id)}
                          title="Copy Content"
                        >
                          {copiedId === doc.id ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                        </button>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => openEdit(doc)}
                          title="Edit Document"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDelete(doc.id)}
                          title="Delete Document"
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── TAB 2: WHATSAPP AI LIVE SIMULATOR ──────────────── */}
      {tab === 'simulator' && (
        <div className="cbt-sim-layout">
          {/* WhatsApp Window Frame */}
          <div className="cbt-chat-window">
            {/* WhatsApp Green Header Bar */}
            <div className="cbt-chat-header" style={{ background: '#075e54', color: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: '#128c7e',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 18,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                  }}
                >
                  🤖
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#ffffff' }}>
                    PadosiAgent AI <span style={{ opacity: 0.8, fontSize: 12, fontWeight: 500 }}>(Live Simulator)</span>
                  </div>
                  <div style={{ fontSize: 11.5, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6, color: '#e0f2fe' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#25d366', boxShadow: '0 0 6px #25d366' }} />
                    online &bull; Powered by {config?.provider || 'Groq'} RAG
                  </div>
                </div>
              </div>
              <button
                className="btn btn-xs"
                onClick={() =>
                  setChatHistory([
                    {
                      id: 'init',
                      sender: 'ai',
                      text: 'ચેટ રીસેટ થઈ ગઈ છે. તમે નવો પ્રશ્ન પૂછી શકો છો!',
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    },
                  ])
                }
                style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff', border: 'none', borderRadius: 8 }}
              >
                Clear Chat
              </button>
            </div>

            {/* WhatsApp Chat Messages Stream */}
            <div className="cbt-chat-messages">
              {chatHistory.map(msg => (
                <div
                  key={msg.id}
                  className={`cbt-msg-row ${msg.sender === 'user' ? 'user' : 'ai'}`}
                >
                  <div className="cbt-msg-bubble">
                    {msg.text}

                    {/* Source Documents Cited */}
                    {msg.sourceDocs && msg.sourceDocs.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          paddingTop: 6,
                          borderTop: '1px dashed rgba(0,0,0,0.12)',
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>📄 Referenced Knowledge:</span>
                        {msg.sourceDocs.map((s, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: 'var(--bg-tertiary)',
                              padding: '2px 7px',
                              borderRadius: 4,
                              fontWeight: 600,
                              border: '1px solid var(--border)',
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="cbt-msg-meta">
                      <span>{msg.timestamp}</span>
                      {msg.sender === 'user' && <CheckCheck size={14} color="#53bdeb" />}
                    </div>
                  </div>
                </div>
              ))}

              {testingAi && (
                <div
                  className="cbt-msg-row ai"
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 14,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <RefreshCw size={14} className="animate-spin" color="var(--primary)" />
                  <span>PadosiAgent is analyzing knowledge base...</span>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="cbt-chat-input-bar">
              <input
                type="text"
                className="input input-sm"
                style={{ flex: 1, borderRadius: 24, padding: '10px 18px', height: 42 }}
                placeholder="Type a message (Gujarati, Hindi, or English)..."
                value={testPrompt}
                onChange={e => setTestPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendTestQuery()}
                disabled={testingAi}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleSendTestQuery()}
                disabled={testingAi || !testPrompt.trim()}
                style={{ borderRadius: '50%', width: 42, height: 42, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Quick Prompts & Knowledge Context Sidebar */}
          <div className="cbt-sim-sidebar">
            <div className="cbt-sample-card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-primary)' }}>
                <Sparkles size={16} color="#6366f1" /> 1-Click Test Prompts
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
                Click any question to simulate how PadosiAgent references your knowledge base:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {sampleQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    className="cbt-sample-pill"
                    onClick={() => handleSendTestQuery(q)}
                    disabled={testingAi}
                  >
                    💬 {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="cbt-sample-card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: 'var(--text-primary)' }}>
                RAG In-Memory Context
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.45 }}>
                <strong style={{ color: 'var(--primary)' }}>{docs.length} active documents</strong> loaded. Queries semantically match against these documents for high-accuracy answers.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {docs.slice(0, 4).map(d => (
                  <div
                    key={d.id}
                    style={{
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <CheckCircle2 size={13} color="#10b981" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.title}
                    </span>
                  </div>
                ))}
                {docs.length > 4 && (
                  <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginTop: 4 }}>
                    + {docs.length - 4} more documents indexed
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 3: CONFIGURATION ──────────────── */}
      {tab === 'config' && config && (
        <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card 1: Engine Provider & Model */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
              <Zap size={18} color="#6366f1" /> LLM Provider & Model Selection
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                LLM Provider
                <select
                  className="input"
                  value={config.provider}
                  onChange={e => setConfig({ ...config, provider: e.target.value })}
                >
                  <option value="groq">Groq (Ultra-fast LLaMA 3.3 / GPT-OSS - Recommended)</option>
                  <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                  <option value="custom">Custom Endpoint / Local Ollama</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Model Identifier
                <input
                  className="input"
                  value={config.model}
                  onChange={e => setConfig({ ...config, model: e.target.value })}
                  placeholder="e.g. llama-3.3-70b-versatile or gpt-4o"
                />
              </label>
            </div>
          </div>

          {/* Card 2: System Persona & System Prompt */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                <Bot size={18} color="#a855f7" /> System Instruction & Persona
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Click to load persona:</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {PRESET_SYSTEM_PERSONAS.map(p => (
                <button
                  key={p.title}
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setConfig({ ...config, systemPrompt: p.prompt })}
                >
                  + {p.title}
                </button>
              ))}
            </div>

            <textarea
              className="input"
              rows={6}
              value={config.systemPrompt}
              onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
              placeholder="Instruct the AI on persona, rules, and language..."
              style={{ lineHeight: 1.5, resize: 'vertical' }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              💡 Tip: Instruct the AI to respond in the user&apos;s preferred language (Gujarati, Hindi, or English).
            </div>
          </div>

          {/* Card 3: Temperature & Token Sampling */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
              <Sliders size={18} color="#f59e0b" /> Sampling & Temperature
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
                  <span>Temperature: {config.temperature ?? 0.7}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>
                    {(config.temperature ?? 0.7) <= 0.3 ? '🎯 Strict & Factual' : (config.temperature ?? 0.7) <= 0.8 ? '⚖️ Balanced' : '🎨 Creative'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={config.temperature ?? 0.7}
                  onChange={e => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Max Output Tokens
                <input
                  className="input"
                  type="number"
                  value={config.maxTokens}
                  onChange={e => setConfig({ ...config, maxTokens: parseInt(e.target.value, 10) || 2000 })}
                />
              </label>
            </div>
          </div>

          {/* Card 4: Human Advisor Handoff */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
              <UserCheck size={18} color="#10b981" /> Human Advisor Handoff & Guardrails
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Handoff Trigger Keywords
                <input
                  className="input"
                  value={config.handoffKeywords || ''}
                  onChange={e => setConfig({ ...config, handoffKeywords: e.target.value })}
                  placeholder="advisor, human, agent, મદદ, વાત કરવી છે"
                />
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 400 }}>
                  Comma-separated keywords that immediately route conversation to a human agent.
                </span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Fallback Message
                <input
                  className="input"
                  value={config.fallbackMessage || ''}
                  onChange={e => setConfig({ ...config, fallbackMessage: e.target.value })}
                  placeholder="હું સમજી શક્યો નથી. હું તમને અમારા એડવાઈઝર સાથે કનેક્ટ કરું છું."
                />
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 400 }}>
                  Message sent when AI cannot find relevant knowledge base matches.
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-primary" onClick={handleConfigSave}>
                Save AI Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 4: STARTER TRAINING PACKS ──────────────── */}
      {tab === 'packs' && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>Pre-built Domain Knowledge Packs</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: 0 }}>
              Quickly seed your knowledge base with industry-standard Gujarati and English insurance & investment information.
            </p>
          </div>

          <div className="cbt-packs-grid">
            {PRESET_KNOWLEDGE_PACKS.map(pack => {
              const isImporting = importingPackId === pack.packId;
              return (
                <div key={pack.packId} className="cbt-pack-card">
                  <div>
                    <div className="cbt-pack-header">
                      <div className="cbt-pack-icon">{pack.icon}</div>
                      <div>
                        <div className="cbt-pack-title">{pack.title}</div>
                        <span style={{ fontSize: 11.5, color: 'var(--primary)', fontWeight: 600 }}>{pack.docs.length} Curated Documents</span>
                      </div>
                    </div>
                    <div className="cbt-pack-desc">
                      {pack.description}
                    </div>

                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                      Included Documents:
                    </div>
                    <div className="cbt-pack-docs-list">
                      {pack.docs.map((d, i) => (
                        <div key={i} className="cbt-pack-doc-item">
                          <CheckCircle2 size={13} color="#10b981" />
                          <span>{d.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => handleImportPack(pack)}
                    disabled={isImporting}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40 }}
                  >
                    {isImporting ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                    {isImporting ? 'Importing Documents...' : `Import ${pack.docs.length} Documents`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: CREATE / EDIT DOCUMENT ──────────────── */}
      {showModal && (
        <Modal
          title={editDoc ? 'Edit Knowledge Document' : 'Add Knowledge Document'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Document Title *
              <input
                className="input"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Term Insurance KYC Guidelines"
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Category / Type
              <select
                className="input"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option value="faq">FAQ (Frequently Asked Questions)</option>
                <option value="product">Product Info & Brochures</option>
                <option value="guideline">Guideline & Claim Rules</option>
                <option value="custom">Custom Knowledge</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Knowledge Content *</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 400 }}>
                  {form.content.length} characters &bull; {Math.ceil(form.content.split(/\s+/).filter(Boolean).length)} words
                </span>
              </div>
              <textarea
                className="input"
                rows={9}
                value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })}
                placeholder="Enter detailed facts, FAQs, product features, terms, or guidelines here..."
                style={{ lineHeight: 1.5, resize: 'vertical' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editDoc ? 'Update Document' : 'Save Document'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────── MODAL: VIEW DOCUMENT DETAILS ──────────────── */}
      {viewDoc && (
        <Modal title={viewDoc.title} onClose={() => setViewDoc(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`cbt-badge-type ${viewDoc.type || viewDoc.fileType || 'faq'}`}>
                {viewDoc.type || viewDoc.fileType}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {viewDoc.content.length} characters &bull; Created {new Date(viewDoc.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 16,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                maxHeight: 380,
                overflowY: 'auto',
                color: 'var(--text-primary)',
              }}
            >
              {viewDoc.content}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button
                className="btn btn-secondary"
                onClick={() => handleCopyContent(viewDoc.content, viewDoc.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {copiedId === viewDoc.id ? <Check size={14} color="#22c55e" /> : <Copy size={14} />} Copy Text
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const d = viewDoc;
                    setViewDoc(null);
                    openEdit(d);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Edit3 size={14} /> Edit
                </button>
                <button className="btn btn-secondary" onClick={() => setViewDoc(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
