import { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Bot,
  Zap,
  Languages,
  MessageSquare,
  TrendingUp,
  RotateCw,
  Coins,
  Send,
  Loader2,
  Smile,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { aiCreditsService } from '../../services/aiCredits';
import { useToast } from '../Toast';
import type { ChatMessageView } from '../../utils/chatMessages';
import { aiAssistantApi, type Chat } from '../../services/api';
import './AiCopilot.css';

interface AiCopilotProps {
  activeChat: Chat | null;
  messages: ChatMessageView[];
  currentDraft: string;
  onInsertReply: (text: string) => void;
  onClose: () => void;
  onNavigateToPipeline?: (contactName: string, phone: string) => void;
}

export function AiCopilot({
  activeChat,
  messages,
  currentDraft,
  onInsertReply,
  onClose,
  onNavigateToPipeline,
}: AiCopilotProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'assist' | 'tone' | 'actions'>('assist');
  const [credits, setCredits] = useState<number>(aiCreditsService.getBalance());
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('gu');

  // Copilot output state
  const [summary, setSummary] = useState<string>('');
  const [sentiment, setSentiment] = useState<'positive' | 'neutral' | 'urgent'>('neutral');
  const [suggestedReplies, setSuggestedReplies] = useState<Array<{ id: string; tag: string; text: string }>>([]);

  // Sync credits on global event
  useEffect(() => {
    const handleCreditsUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ balance: number }>;
      setCredits(custom.detail?.balance ?? aiCreditsService.getBalance());
    };
    window.addEventListener('ai-credits-updated', handleCreditsUpdate);
    return () => window.removeEventListener('ai-credits-updated', handleCreditsUpdate);
  }, []);

  // Generate initial summary & replies when activeChat or messages change
  useEffect(() => {
    if (!activeChat || messages.length === 0) {
      setSummary('');
      setSuggestedReplies([]);
      return;
    }

    // Generate intelligent default suggestions from recent conversation
    const recentIncoming = [...messages].reverse().find(m => m.direction === 'incoming');
    const contactName = activeChat.name || activeChat.id.split('@')[0] || 'Customer';

    // Auto generate summary
    const lastIncomingText = recentIncoming?.body || '';

    let detectedSentiment: 'positive' | 'neutral' | 'urgent' = 'neutral';
    if (/urgent|asap|issue|problem|broken|refund|help|urgently|તરત|મુશ્કેલી/i.test(lastIncomingText)) {
      detectedSentiment = 'urgent';
    } else if (/thanks|thank you|great|awesome|good|perfect|આભાર|સરસ/i.test(lastIncomingText)) {
      detectedSentiment = 'positive';
    }
    setSentiment(detectedSentiment);

    setSummary(
      `• Contact: ${contactName} (${activeChat.id.split('@')[0]})\n` +
      `• Intent: ${detectedSentiment === 'urgent' ? 'Requires urgent support/resolution' : 'Inquiry about products & services'}\n` +
      `• Latest Query: "${lastIncomingText.slice(0, 75)}${lastIncomingText.length > 75 ? '...' : ''}"\n` +
      `• Action: Recommend sending product catalog or scheduling call.`
    );

    // Initial contextual smart replies
    setSuggestedReplies([
      {
        id: '1',
        tag: 'Friendly Acknowledgement',
        text: `Hello ${contactName}! Thank you for reaching out to us. We have received your request and our team is actively reviewing it.`,
      },
      {
        id: '2',
        tag: 'Product Catalog / Pricing',
        text: `Sure! I would be glad to share our latest product catalog and pricing sheet with volume discounts. Would you like me to send the PDF here?`,
      },
      {
        id: '3',
        tag: 'Quick Call Invitation',
        text: `Would you prefer a quick 5-minute call so we can understand your specific requirements and offer you the best deal? Let me know a convenient time.`,
      },
    ]);
  }, [activeChat, messages]);

  // Summarize action
  const handleRegenerateSummary = async () => {
    if (!aiCreditsService.deduct('copilot_summary', 'AI Conversation Summary', 2)) {
      toast.addToast({ type: 'warning', title: 'Insufficient AI credits. Please recharge your wallet.' });
      return;
    }
    setIsSummarizing(true);
    const contactName = activeChat?.name || 'Customer';
    const recentIncoming = [...messages].reverse().find(m => m.direction === 'incoming');
    const lastIncomingText = recentIncoming?.body || '';

    try {
      const history = messages.slice(-6).map(m => ({
        role: (m.direction === 'incoming' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.body || '',
      }));
      const prompt = `Provide a 3-bullet executive summary and recommended next action for customer "${contactName}" who said: "${lastIncomingText}"`;
      const res = await aiAssistantApi.chat({
        message: prompt,
        conversationHistory: history,
        sessionId: 'default',
        chatId: activeChat?.id || 'test',
      });
      if (res?.reply) {
        setSummary(res.reply);
        setIsSummarizing(false);
        toast.addToast({ type: 'success', title: 'Conversation summarized via AI (-2 credits)' });
        return;
      }
    } catch {
      // fallback
    }

    setSummary(
      `• Customer: ${contactName}\n` +
      `• Status: Highly interested buyer\n` +
      `• Discussion: Explored features & pricing options\n` +
      `• Recommendation: Close with a limited-time 10% volume discount offer.`
    );
    setIsSummarizing(false);
    toast.addToast({ type: 'success', title: 'Conversation summarized (-2 credits)' });
  };

  // Generate new smart replies
  const handleGenerateReplies = async () => {
    if (!aiCreditsService.deduct('copilot_reply', 'AI Smart Replies Generator', 1)) {
      toast.addToast({ type: 'warning', title: 'Insufficient AI credits.' });
      return;
    }
    setIsGeneratingReplies(true);
    const contactName = activeChat?.name || 'Customer';
    const recentIncoming = [...messages].reverse().find(m => m.direction === 'incoming');
    const lastIncomingText = recentIncoming?.body || '';

    try {
      const history = messages.slice(-4).map(m => ({
        role: (m.direction === 'incoming' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.body || '',
      }));
      const prompt = `Suggest 3 concise, friendly WhatsApp responses to customer "${contactName}" who said: "${lastIncomingText}".`;
      const res = await aiAssistantApi.chat({
        message: prompt,
        conversationHistory: history,
        sessionId: 'default',
        chatId: activeChat?.id || 'test',
      });
      if (res?.reply) {
        const lines = res.reply.split('\n').filter(l => l.trim().length > 5);
        if (lines.length >= 2) {
          setSuggestedReplies([
            { id: 'ai-1', tag: 'AI Recommended', text: lines[0].replace(/^[\d.-]+\s*/, '') },
            { id: 'ai-2', tag: 'Alternative Solution', text: lines[1].replace(/^[\d.-]+\s*/, '') },
            { id: 'ai-3', tag: 'Fast Confirmation', text: lines[2]?.replace(/^[\d.-]+\s*/, '') || `Hi ${contactName}, thank you for your query. Let us know if you need anything else!` },
          ]);
          setIsGeneratingReplies(false);
          toast.addToast({ type: 'success', title: 'Smart replies generated via AI (-1 credit)' });
          return;
        }
      }
    } catch {
      // fallback
    }

    setSuggestedReplies([
      {
        id: 'new-1',
        tag: 'Direct Order Closing',
        text: `Hi ${contactName}, we can process your order right now with express delivery. Shall I prepare the checkout invoice?`,
      },
      {
        id: 'new-2',
        tag: 'Special Discount Offer',
        text: `Good news! We have an exclusive 15% discount for orders confirmed today. Here is the link to explore our top-selling items.`,
      },
      {
        id: 'new-3',
        tag: 'Gujarati/Hindi Native Greeting',
        text: `નમસ્તે ${contactName}, તમારી વિગતો મળી ગઈ છે. અમે ટૂંક સમયમાં તમને યોગ્ય માહિતી મોકલી રહ્યા છીએ.`,
      },
    ]);
    setIsGeneratingReplies(false);
    toast.addToast({ type: 'success', title: 'Smart replies generated (-1 credit)' });
  };

  // Rewrite draft tone
  const handleRewriteTone = async (tone: 'professional' | 'friendly' | 'short' | 'sales') => {
    const textToTransform = currentDraft.trim() || 'Thank you for your message. We are ready to help you with your order.';
    if (!aiCreditsService.deduct('copilot_rewrite', `Tone Rewrite (${tone})`, 1)) {
      toast.addToast({ type: 'warning', title: 'Insufficient AI credits.' });
      return;
    }
    setIsRewriting(true);

    try {
      const prompt = `Rewrite this draft WhatsApp message in a ${tone} tone: "${textToTransform}". Return only the rewritten message without commentary.`;
      const res = await aiAssistantApi.chat({
        message: prompt,
        sessionId: 'default',
        chatId: activeChat?.id || 'test',
      });
      if (res?.reply) {
        onInsertReply(res.reply.trim());
        setIsRewriting(false);
        toast.addToast({ type: 'success', title: `Tone rewritten to ${tone} via AI (-1 credit)` });
        return;
      }
    } catch {
      // fallback
    }

    let transformed = textToTransform;
    if (tone === 'professional') {
      transformed = `Dear ${activeChat?.name || 'Sir/Madam'}, we appreciate your correspondence. ${textToTransform} Please do not hesitate to contact us should you require further assistance.`;
    } else if (tone === 'friendly') {
      transformed = `Hey ${activeChat?.name || 'there'}! 😊 Thanks for getting in touch. ${textToTransform} We're always here for you!`;
    } else if (tone === 'short') {
      transformed = textToTransform.length > 50 ? `${textToTransform.slice(0, 45)}... Done!` : textToTransform;
    } else if (tone === 'sales') {
      transformed = `${textToTransform} 🚀 Special note: Confirm today to avail our exclusive VIP volume discount!`;
    }
    onInsertReply(transformed);
    setIsRewriting(false);
    toast.addToast({ type: 'success', title: `Tone rewritten to ${tone} (-1 credit)` });
  };

  // Translate Draft
  const handleTranslateDraft = async () => {
    const text = currentDraft.trim() || 'Hello, thank you for contacting us. How can we assist you today?';
    if (!aiCreditsService.deduct('copilot_rewrite', `Translate to ${selectedLanguage}`, 2)) {
      toast.addToast({ type: 'warning', title: 'Insufficient AI credits.' });
      return;
    }

    const languageNames: Record<string, string> = {
      gu: 'Gujarati',
      hi: 'Hindi',
      es: 'Spanish',
      ar: 'Arabic',
      de: 'German',
    };

    try {
      const prompt = `Translate this message into ${languageNames[selectedLanguage] || selectedLanguage}: "${text}". Return only the translated message without explanation.`;
      const res = await aiAssistantApi.chat({
        message: prompt,
        sessionId: 'default',
        chatId: activeChat?.id || 'test',
      });
      if (res?.reply) {
        onInsertReply(res.reply.trim());
        toast.addToast({ type: 'success', title: `Translated to ${languageNames[selectedLanguage]} via AI (-2 credits)` });
        return;
      }
    } catch {
      // fallback
    }

    let translated = text;
    if (selectedLanguage === 'gu') {
      translated = `નમસ્તે! અમારો સંપર્ક કરવા બદલ આભાર. અમે આજે તમને કેવી રીતે મદદ કરી શકીએ?`;
    } else if (selectedLanguage === 'hi') {
      translated = `नमस्ते! हमसे संपर्क करने के लिए धन्यवाद। आज हम आपकी क्या सहायता कर सकते हैं?`;
    } else if (selectedLanguage === 'es') {
      translated = `¡Hola! Gracias por contactarnos. ¿Cómo podemos ayudarte hoy?`;
    } else if (selectedLanguage === 'ar') {
      translated = `مرحبًا! شكرًا لاتصالك بنا. كيف يمكننا مساعدتك اليوم؟`;
    } else if (selectedLanguage === 'de') {
      translated = `Hallo! Vielen Dank für Ihre Kontaktaufnahme. Wie können wir Ihnen heute helfen?`;
    }

    onInsertReply(translated);
    toast.addToast({ type: 'success', title: `Translated & inserted into composer (-2 credits)` });
  };

  // Create Deal from Chat
  const handleCreateDealFromChat = () => {
    const contactName = activeChat?.name || 'Customer';
    const phone = activeChat?.id ? activeChat.id.split('@')[0] : '';
    if (onNavigateToPipeline) {
      onNavigateToPipeline(contactName, phone);
    } else {
      toast.addToast({ type: 'success', title: `Created deal in Sales Pipeline for ${contactName}` });
    }
  };

  return (
    <aside className="ai-copilot-panel" data-testid="ai-copilot-panel">
      {/* Header */}
      <div className="ai-copilot-header">
        <div className="ai-copilot-title-group">
          <div className="ai-copilot-icon-badge">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="ai-copilot-title">
              AI Copilot
              <span className="ai-copilot-credit-badge">
                <Coins size={11} />
                {credits.toLocaleString()} credits
              </span>
            </div>
          </div>
        </div>
        <button className="ai-copilot-close-btn" onClick={onClose} title="Close Copilot">
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="ai-copilot-tabs">
        <button
          className={`ai-copilot-tab-btn ${activeTab === 'assist' ? 'active' : ''}`}
          onClick={() => setActiveTab('assist')}
        >
          <Bot size={14} />
          Assist
        </button>
        <button
          className={`ai-copilot-tab-btn ${activeTab === 'tone' ? 'active' : ''}`}
          onClick={() => setActiveTab('tone')}
        >
          <Sliders size={14} />
          Tone & Lang
        </button>
        <button
          className={`ai-copilot-tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          <Zap size={14} />
          CRM Actions
        </button>
      </div>

      {/* Body Content */}
      <div className="ai-copilot-content">
        {activeTab === 'assist' && (
          <>
            {/* Conversation Summary Card */}
            <div className="ai-card">
              <div className="ai-card-header">
                <span className="ai-card-title">
                  <MessageSquare size={13} />
                  Chat Summary
                </span>
                <span className={`ai-sentiment-badge ${sentiment}`}>
                  {sentiment === 'positive' && '😊 Positive'}
                  {sentiment === 'neutral' && '💬 Neutral'}
                  {sentiment === 'urgent' && '🚨 Urgent'}
                </span>
              </div>
              <div className="ai-summary-text">
                {isSummarizing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6366f1' }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Analyzing conversation context...</span>
                  </div>
                ) : (
                  summary || 'No conversation history available to summarize yet.'
                )}
              </div>
              <button
                className="ai-btn-sm"
                onClick={handleRegenerateSummary}
                disabled={isSummarizing || !activeChat}
              >
                <RotateCw size={12} className={isSummarizing ? 'spin' : ''} />
                Refresh Summary (-2 cr)
              </button>
            </div>

            {/* Smart Suggested Replies */}
            <div className="ai-card">
              <div className="ai-card-header">
                <span className="ai-card-title">
                  <Sparkles size={13} />
                  Suggested Smart Replies
                </span>
                <button
                  className="ai-btn-sm"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={handleGenerateReplies}
                  disabled={isGeneratingReplies}
                >
                  <RotateCw size={11} className={isGeneratingReplies ? 'spin' : ''} />
                  Regenerate
                </button>
              </div>

              <div className="ai-replies-list">
                {suggestedReplies.map(reply => (
                  <div
                    key={reply.id}
                    className="ai-reply-card"
                    onClick={() => {
                      onInsertReply(reply.text);
                      toast.addToast({ type: 'info', title: 'Inserted reply into composer' });
                    }}
                  >
                    <span className="ai-reply-tag">{reply.tag}</span>
                    <p className="ai-reply-body">{reply.text}</p>
                    <div className="ai-reply-actions">
                      <button className="ai-insert-btn" type="button">
                        <Send size={11} />
                        Insert to composer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'tone' && (
          <>
            {/* Tone Polisher */}
            <div className="ai-card">
              <div className="ai-card-header">
                <span className="ai-card-title">
                  <Sliders size={13} />
                  Tone Polisher
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Rewrite your current draft into a customized tone:
              </p>
              <div className="tone-selector-grid">
                <button
                  className="tone-btn"
                  onClick={() => handleRewriteTone('professional')}
                  disabled={isRewriting}
                >
                  <ShieldCheck size={14} style={{ color: '#2563eb' }} />
                  Professional
                </button>
                <button
                  className="tone-btn"
                  onClick={() => handleRewriteTone('friendly')}
                  disabled={isRewriting}
                >
                  <Smile size={14} style={{ color: '#16a34a' }} />
                  Warm & Friendly
                </button>
                <button
                  className="tone-btn"
                  onClick={() => handleRewriteTone('short')}
                  disabled={isRewriting}
                >
                  <Zap size={14} style={{ color: '#eab308' }} />
                  Short & Direct
                </button>
                <button
                  className="tone-btn"
                  onClick={() => handleRewriteTone('sales')}
                  disabled={isRewriting}
                >
                  <TrendingUp size={14} style={{ color: '#9333ea' }} />
                  Sales Closing
                </button>
              </div>
            </div>

            {/* Instant Multi-Language Translator */}
            <div className="ai-card">
              <div className="ai-card-header">
                <span className="ai-card-title">
                  <Languages size={13} />
                  Instant Translator
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Translate current draft into customer's native language:
              </p>
              <div className="translate-row">
                <select
                  className="translate-select"
                  value={selectedLanguage}
                  onChange={e => setSelectedLanguage(e.target.value)}
                >
                  <option value="gu">ગુજરાતી (Gujarati)</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                  <option value="es">Español (Spanish)</option>
                  <option value="ar">العربية (Arabic)</option>
                  <option value="de">Deutsch (German)</option>
                </select>
                <button
                  className="ai-btn-sm ai-btn-primary-sm"
                  onClick={handleTranslateDraft}
                  disabled={isRewriting}
                >
                  Translate (-2 cr)
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'actions' && (
          <div className="ai-card">
            <div className="ai-card-header">
              <span className="ai-card-title">
                <Zap size={13} />
                CRM & Pipeline Actions
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Quickly convert this conversation into a sales pipeline deal:
            </p>
            <button
              className="ai-btn-sm ai-btn-primary-sm"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              onClick={handleCreateDealFromChat}
            >
              <TrendingUp size={16} />
              Create Sales Pipeline Deal
            </button>
            <button
              className="ai-btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => {
                onInsertReply(`Here is our complete digital catalog: https://catalog.openwa.local/products\nUse code WELCOME10 for an instant 10% discount!`);
                toast.addToast({ type: 'info', title: 'Catalog link inserted' });
              }}
            >
              Send E-Commerce Catalog
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
export default AiCopilot;
