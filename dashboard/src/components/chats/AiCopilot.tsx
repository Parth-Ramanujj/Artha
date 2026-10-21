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
import { aiCopilotApi, messageApi, type Chat, type CopilotMessage, type CopilotTone } from '../../services/api';
import './AiCopilot.css';

interface AiCopilotProps {
  activeChat: Chat | null;
  /** WhatsApp number (session) the chat belongs to; needed to send the catalog. */
  sessionId?: string;
  messages: ChatMessageView[];
  currentDraft: string;
  onInsertReply: (text: string) => void;
  onClose: () => void;
  onNavigateToPipeline?: (contactName: string, phone: string) => void;
}

export function AiCopilot({
  activeChat,
  sessionId,
  messages,
  currentDraft,
  onInsertReply,
  onClose,
  onNavigateToPipeline,
}: AiCopilotProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'assist' | 'tone' | 'actions'>('assist');
  const [sendingCatalog, setSendingCatalog] = useState(false);
  const [credits, setCredits] = useState<number>(aiCreditsService.getBalance());
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('gu');

  // Copilot output state — empty until the user asks the AI; never prefilled with canned text.
  const [summary, setSummary] = useState<string>('');
  const [sentiment, setSentiment] = useState<'positive' | 'neutral' | 'urgent' | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<Array<{ id: string; tag: string; text: string }>>([]);

  // Reset AI output when the user switches chats (render-time reset instead of an effect).
  const chatId = activeChat?.id ?? null;
  const [shownChatId, setShownChatId] = useState<string | null>(chatId);
  if (shownChatId !== chatId) {
    setShownChatId(chatId);
    setSummary('');
    setSentiment(null);
    setSuggestedReplies([]);
  }

  // Sync credits on global event
  useEffect(() => {
    const handleCreditsUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ balance: number }>;
      setCredits(custom.detail?.balance ?? aiCreditsService.getBalance());
    };
    window.addEventListener('ai-credits-updated', handleCreditsUpdate);
    return () => window.removeEventListener('ai-credits-updated', handleCreditsUpdate);
  }, []);

  const contactName = activeChat?.name || undefined;
  const latestIncoming = [...messages].reverse().find(m => m.direction === 'incoming' && m.body?.trim());

  const recentMessages = (): CopilotMessage[] =>
    messages
      .filter(m => m.body?.trim())
      .slice(-20)
      .map(m => ({ role: m.direction === 'incoming' ? 'customer' : 'agent', text: m.body }));

  const hasCredits = (amount: number) => {
    if (aiCreditsService.getBalance() >= amount) return true;
    toast.addToast({ type: 'warning', title: 'Insufficient AI credits. Please recharge your wallet.' });
    return false;
  };

  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

  // Summarize action
  const handleSummarize = async () => {
    const history = recentMessages();
    if (history.length === 0) {
      toast.addToast({ type: 'warning', title: 'No messages to summarize yet' });
      return;
    }
    if (!hasCredits(2)) return;
    setIsSummarizing(true);
    try {
      const res = await aiCopilotApi.summary(history, contactName);
      setSummary(res.summary);
      setSentiment(res.sentiment);
      aiCreditsService.deduct('copilot_summary', 'AI Conversation Summary', 2);
      toast.addToast({ type: 'success', title: 'Conversation summarized (-2 credits)' });
    } catch (err) {
      toast.error('Could not summarize conversation', errorText(err));
    } finally {
      setIsSummarizing(false);
    }
  };

  // Generate smart replies
  const handleGenerateReplies = async () => {
    const history = recentMessages();
    if (history.length === 0) {
      toast.addToast({ type: 'warning', title: 'No messages to reply to yet' });
      return;
    }
    if (!hasCredits(1)) return;
    setIsGeneratingReplies(true);
    try {
      const res = await aiCopilotApi.replies(history, contactName);
      setSuggestedReplies(res.replies.map((r, i) => ({ id: `ai-${Date.now()}-${i}`, tag: r.tag, text: r.text })));
      aiCreditsService.deduct('copilot_reply', 'AI Smart Replies Generator', 1);
      toast.addToast({ type: 'success', title: 'Smart replies generated (-1 credit)' });
    } catch (err) {
      toast.error('Could not generate replies', errorText(err));
    } finally {
      setIsGeneratingReplies(false);
    }
  };

  // Rewrite draft tone
  const handleRewriteTone = async (tone: CopilotTone) => {
    const text = currentDraft.trim();
    if (!text) {
      toast.addToast({ type: 'warning', title: 'Type a message first' });
      return;
    }
    if (!hasCredits(1)) return;
    setIsRewriting(true);
    try {
      const res = await aiCopilotApi.rewrite(text, tone, recentMessages());
      onInsertReply(res.text.trim());
      aiCreditsService.deduct('copilot_rewrite', `Tone Rewrite (${tone})`, 1);
      toast.addToast({ type: 'success', title: `Tone rewritten to ${tone} (-1 credit)` });
    } catch (err) {
      toast.error('Could not rewrite message', errorText(err));
    } finally {
      setIsRewriting(false);
    }
  };

  const languageNames: Record<string, string> = {
    gu: 'Gujarati',
    hi: 'Hindi',
    es: 'Spanish',
    ar: 'Arabic',
    de: 'German',
  };

  // Translate Draft
  const handleTranslateDraft = async () => {
    const text = currentDraft.trim();
    if (!text) {
      toast.addToast({ type: 'warning', title: 'Type a message first' });
      return;
    }
    if (!hasCredits(2)) return;
    const language = languageNames[selectedLanguage] || selectedLanguage;
    setIsRewriting(true);
    try {
      const res = await aiCopilotApi.translate(text, language);
      onInsertReply(res.text.trim());
      aiCreditsService.deduct('copilot_rewrite', `Translate to ${language}`, 2);
      toast.addToast({ type: 'success', title: `Translated to ${language} (-2 credits)` });
    } catch (err) {
      toast.error('Could not translate message', errorText(err));
    } finally {
      setIsRewriting(false);
    }
  };

  // Create Deal from Chat
  // Sends the business's real WhatsApp catalog to this chat (asks first: it goes straight to the customer).
  const handleSendCatalog = async () => {
    if (!sessionId || !activeChat) return;
    if (!window.confirm(`Send your WhatsApp catalog to ${activeChat.name || 'this contact'} now?`)) return;
    setSendingCatalog(true);
    try {
      await messageApi.sendCatalog(sessionId, activeChat.id, currentDraft.trim() || undefined);
      toast.addToast({ type: 'success', title: 'Catalog sent' });
    } catch (err) {
      toast.addToast({
        type: 'error',
        title: 'Could not send the catalog',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSendingCatalog(false);
    }
  };

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
                {sentiment && (
                  <span className={`ai-sentiment-badge ${sentiment}`}>
                    {sentiment === 'positive' && '😊 Positive'}
                    {sentiment === 'neutral' && '💬 Neutral'}
                    {sentiment === 'urgent' && '🚨 Urgent'}
                  </span>
                )}
              </div>
              <div className="ai-summary-text">
                {isSummarizing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6366f1' }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Analyzing conversation context...</span>
                  </div>
                ) : summary ? (
                  summary
                ) : latestIncoming ? (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Latest message: “{latestIncoming.body.slice(0, 120)}
                    {latestIncoming.body.length > 120 ? '…' : ''}”
                  </span>
                ) : (
                  'No conversation history available to summarize yet.'
                )}
              </div>
              <button className="ai-btn-sm" onClick={handleSummarize} disabled={isSummarizing || !activeChat}>
                <RotateCw size={12} className={isSummarizing ? 'spin' : ''} />
                {summary ? 'Refresh Summary (-2 cr)' : 'Summarize conversation (-2 cr)'}
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
                  disabled={isGeneratingReplies || !activeChat}
                >
                  <RotateCw size={11} className={isGeneratingReplies ? 'spin' : ''} />
                  {suggestedReplies.length ? 'Regenerate' : 'Suggest replies'}
                </button>
              </div>

              <div className="ai-replies-list">
                {isGeneratingReplies && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6366f1', fontSize: '12px' }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Drafting replies...</span>
                  </div>
                )}
                {!isGeneratingReplies && suggestedReplies.length === 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                    Click “Suggest replies” to draft responses from this conversation (-1 cr).
                  </p>
                )}
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
                <button className="tone-btn" onClick={() => handleRewriteTone('professional')} disabled={isRewriting}>
                  <ShieldCheck size={14} style={{ color: '#2563eb' }} />
                  Professional
                </button>
                <button className="tone-btn" onClick={() => handleRewriteTone('friendly')} disabled={isRewriting}>
                  <Smile size={14} style={{ color: '#16a34a' }} />
                  Warm & Friendly
                </button>
                <button className="tone-btn" onClick={() => handleRewriteTone('short')} disabled={isRewriting}>
                  <Zap size={14} style={{ color: '#eab308' }} />
                  Short & Direct
                </button>
                <button className="tone-btn" onClick={() => handleRewriteTone('sales')} disabled={isRewriting}>
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
                <button className="ai-btn-sm ai-btn-primary-sm" onClick={handleTranslateDraft} disabled={isRewriting}>
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
              disabled={!sessionId || !activeChat || sendingCatalog}
              onClick={() => void handleSendCatalog()}
            >
              {sendingCatalog ? <Loader2 size={16} className="animate-spin" /> : null}
              Send WhatsApp Catalog
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
export default AiCopilot;
