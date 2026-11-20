import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Heart,
  MessageCircle,
  Calendar,
  Send,
  Plus,
  Trash2,
  Play,
  Sparkles,
  Bot,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  Radio,
  Edit2,
  BookOpen,
} from 'lucide-react';
import { SetupGuide } from '../components/social-automation/SetupGuide';
import { ActivityFeed } from '../components/social-automation/ActivityFeed';
import { HealthPanel, type HealthAction } from '../components/social-automation/HealthPanel';
import { API_BASE_URL, socialAutomationApi } from '../services/api';
import type {
  SocialAccount,
  SocialPost,
  SocialCommentRule,
  SocialCommentLog,
  SocialOverview,
  SimulateCommentResult,
  SocialMediaType,
} from '../types/socialAutomation';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import './SalesAgent.css';
import './SocialAutomation.css';

const InstagramIcon = ({ size = 16, color = '#ec4899', style }: { size?: number; color?: string; style?: React.CSSProperties }) => (
  <svg style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const FacebookIcon = ({ size = 16, color = '#1877f2', style }: { size?: number; color?: string; style?: React.CSSProperties }) => (
  <svg style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

function parseList(json: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseMeta(json: string | null | undefined): { lastError?: string; webhookError?: string } {
  try {
    const v: unknown = JSON.parse(json || '{}');
    return v && typeof v === 'object' ? (v as { lastError?: string; webhookError?: string }) : {};
  } catch {
    return {};
  }
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: Calendar },
  { id: 'activity', label: 'Activity & Logs', icon: Radio },
  { id: 'posts', label: 'Scheduled Posts', icon: Send },
  { id: 'rules', label: 'Auto-Reply & Like Rules', icon: Sparkles },
  { id: 'accounts', label: 'Connected Accounts', icon: Share2 },
  { id: 'simulator', label: 'Comment Simulator', icon: Bot },
  { id: 'guide', label: 'Setup Guide', icon: BookOpen },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function SocialAutomation() {
  useDocumentTitle('Social Automation');

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<SocialOverview | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [rules, setRules] = useState<SocialCommentRule[]>([]);
  const [logs, setLogs] = useState<SocialCommentLog[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Post form state
  const [newPost, setNewPost] = useState({
    platform: 'instagram' as 'instagram' | 'facebook',
    caption: '',
    mediaUrl: '',
    mediaType: 'IMAGE' as SocialMediaType,
    scheduledAt: '',
    publishNow: true,
  });

  // Rule form state
  const [newRule, setNewRule] = useState({
    name: '',
    platform: 'all' as 'all' | 'instagram' | 'facebook',
    matchType: 'contains' as 'contains' | 'exact' | 'regex' | 'all',
    keywords: 'price, cost, rate, details',
    replyTemplates: 'Hello {username}! Thanks for reaching out. Please check your DM for pricing! 😊\nHey {username}! Sent all the details directly to your inbox! ✨',
    autoLike: false,
    autoDm: false,
    autoDmTemplate: 'Hi {username}, here is our catalog: https://example.com/catalog',
    useAi: false,
    aiPrompt: 'You are a friendly customer success manager. Provide a 1-sentence warm reply.',
    delaySeconds: 3,
  });

  // Account form state
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(null);
  const [newAccount, setNewAccount] = useState({
    platform: 'instagram' as 'instagram' | 'facebook',
    accountName: '',
    accountId: '',
    accessToken: '',
    pageId: '',
    webhookVerifyToken: '',
  });

  // Simulator state
  const [simComment, setSimComment] = useState('Hey! What is the price of this product?');
  const [simUser, setSimUser] = useState('rahul_patel');
  const [simPlatform, setSimPlatform] = useState<'instagram' | 'facebook'>('instagram');
  const [simResult, setSimResult] = useState<SimulateCommentResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovData, accData, postData, ruleData, logData] = await Promise.all([
        socialAutomationApi.overview().catch(() => null),
        socialAutomationApi.accounts().catch(() => []),
        socialAutomationApi.posts().catch(() => []),
        socialAutomationApi.rules().catch(() => []),
        socialAutomationApi.logs(100).catch(() => []),
      ]);

      if (ovData) setOverview(ovData);
      setAccounts(accData);
      setPosts(postData);
      setRules(ruleData);
      setLogs(logData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load social automation data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    // Keeps Activity and the health panel current while comments arrive.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadData();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const handleHealthAction = (to: HealthAction) => {
    if (to === 'connect') handleOpenNewAccountModal();
    else setActiveTab(to);
  };

  const copyToClipboard = (text: string, field: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Actions
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // datetime-local is the viewer's local time; send an absolute ISO instant.
      const scheduled = newPost.publishNow || !newPost.scheduledAt ? undefined : new Date(newPost.scheduledAt);
      if (scheduled && scheduled.getTime() <= Date.now()) {
        setError('Pick a time in the future, or tick Publish Immediately');
        return;
      }
      const saved = await socialAutomationApi.createPost({
        ...newPost,
        scheduledAt: scheduled?.toISOString(),
      });
      setShowPostModal(false);
      if (saved.status === 'failed') setError(`Publishing failed: ${saved.error || 'unknown error'}`);
      else setNotice(saved.status === 'published' ? 'Post published!' : saved.status === 'scheduled' ? 'Post scheduled!' : 'Draft saved');
      setNewPost({
        platform: 'instagram',
        caption: '',
        mediaUrl: '',
        mediaType: 'IMAGE',
        scheduledAt: '',
        publishNow: true,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    }
  };

  const handlePublishNow = async (id: string) => {
    try {
      setError(null);
      setNotice('Publishing post to Meta...');
      const post = await socialAutomationApi.publishPostNow(id);
      if (post.status === 'published') setNotice('Post published!');
      else {
        setNotice(null);
        setError(`Publishing failed: ${post.error || 'unknown error'}`);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await socialAutomationApi.deletePost(id);
      setNotice('Post deleted');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const keywordsArray = newRule.keywords.split(',').map(k => k.trim()).filter(Boolean);
      const templatesArray = newRule.replyTemplates.split('\n').map(t => t.trim()).filter(Boolean);

      await socialAutomationApi.createRule({
        ...newRule,
        keywords: keywordsArray,
        replyTemplates: templatesArray,
        enabled: true,
      });
      setShowRuleModal(false);
      setNotice('Automation rule created successfully!');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  const handleToggleRule = async (id: string, currentEnabled: boolean) => {
    try {
      await socialAutomationApi.toggleRule(id, !currentEnabled);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Delete this auto-reply rule?')) return;
    try {
      await socialAutomationApi.deleteRule(id);
      setNotice('Rule deleted');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleOpenNewAccountModal = () => {
    setEditingAccount(null);
    setNewAccount({
      platform: 'instagram',
      accountName: '',
      accountId: '',
      accessToken: '',
      pageId: '',
      webhookVerifyToken: '',
    });
    setShowAccountModal(true);
  };

  const handleEditAccount = (acc: SocialAccount) => {
    setEditingAccount(acc);
    setNewAccount({
      platform: acc.platform,
      accountName: acc.accountName,
      accountId: acc.accountId,
      accessToken: '',
      pageId: acc.pageId || '',
      webhookVerifyToken: acc.webhookVerifyToken || '',
    });
    setShowAccountModal(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await socialAutomationApi.updateAccount(editingAccount.id, {
          platform: newAccount.platform,
          accountName: newAccount.accountName,
          accountId: newAccount.accountId,
          // Empty token = keep the stored one (the API never sends it back).
          accessToken: newAccount.accessToken.trim() || undefined,
          pageId: newAccount.pageId || undefined,
          webhookVerifyToken: newAccount.webhookVerifyToken || undefined,
        });
        setNotice('Meta account updated and re-verified successfully!');
      } else {
        await socialAutomationApi.createAccount({
          ...newAccount,
          pageId: newAccount.platform === 'instagram' ? newAccount.pageId : undefined,
          webhookVerifyToken: newAccount.webhookVerifyToken || undefined,
        });
        setNotice('Meta account connected successfully!');
      }
      setShowAccountModal(false);
      setEditingAccount(null);
      setNewAccount({
        platform: 'instagram',
        accountName: '',
        accountId: '',
        accessToken: '',
        pageId: '',
        webhookVerifyToken: '',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    }
  };

  const handleTestAccount = async (id: string) => {
    try {
      const res = await socialAutomationApi.testAccount(id);
      if (res.valid && res.webhookError) {
        setNotice(null);
        setError(`Connected as ${res.name || 'OK'}, but comment webhooks could not be turned on: ${res.webhookError}`);
      } else if (res.valid) {
        setError(null);
        setNotice(`Connected as ${res.name || 'OK'}. Posting and comment webhooks are ready.`);
      } else {
        setError(`Verification failed: ${res.error || 'Invalid token'}`);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test error');
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!window.confirm('Disconnect this account?')) return;
    try {
      await socialAutomationApi.deleteAccount(id);
      setNotice('Account disconnected');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    setError(null);
    try {
      const res = await socialAutomationApi.simulateComment({
        commentText: simComment,
        fromUserName: simUser,
        platform: simPlatform,
      });
      setSimResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const webhookUrl = new URL(`${API_BASE_URL}/social-automation/webhook`, window.location.origin).href;

  return (
    <div className="sa-page social-page">
      {/* Header */}
      <PageHeader
        title="Social Automation"
        subtitle="Automate Instagram & Facebook posts, schedule media, auto-reply to comments & auto-like"
        actions={
          <div className="sa-actions">
            <button className="btn btn-secondary" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => setShowPostModal(true)}>
              <Plus size={14} /> New Post
            </button>
          </div>
        }
      />

      {/* Notifications */}
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sa-notice" role="status">
          {notice}
        </p>
      )}

      <HealthPanel overview={overview} accounts={accounts} rules={rules} logs={logs} posts={posts} onAction={handleHealthAction} />

      {/* Stats Cards */}
      <section className="sa-stats" aria-label="Social Automation Stats">
        <div className="sa-stat">
          <span className="sa-stat-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <InstagramIcon size={18} /> {overview?.connectedAccounts ?? accounts.length}
          </span>
          <span className="sa-stat-label">Connected Accounts</span>
        </div>

        <div className="sa-stat ok">
          <span className="sa-stat-value">{overview?.publishedPosts ?? posts.filter(p => p.status === 'published').length}</span>
          <span className="sa-stat-label">Published Posts</span>
        </div>

        <div className="sa-stat">
          <span className="sa-stat-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={16} /> {overview?.scheduledPosts ?? posts.filter(p => p.status === 'scheduled').length}
          </span>
          <span className="sa-stat-label">Scheduled in Queue</span>
        </div>

        <div className="sa-stat">
          <span className="sa-stat-value" style={{ color: '#ec4899', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Heart size={16} fill="#ec4899" /> {overview?.autoLikesGiven ?? logs.filter(l => l.liked).length}
          </span>
          <span className="sa-stat-label">Comments Auto-Liked</span>
        </div>

        <div className="sa-stat">
          <span className="sa-stat-value" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <MessageCircle size={16} /> {overview?.autoRepliesSent ?? logs.filter(l => l.replied).length}
          </span>
          <span className="sa-stat-label">Auto-Replies Sent</span>
        </div>
      </section>

      {/* Navigation Tabs */}
      <nav className="sa-tabs" aria-label="Social automation navigation">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sa-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={14} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: 'middle' }} />
            {label}
            {id === 'posts' && posts.length > 0 && ` (${posts.length})`}
            {id === 'rules' && rules.length > 0 && ` (${rules.length})`}
            {id === 'accounts' && accounts.length > 0 && ` (${accounts.length})`}
          </button>
        ))}
      </nav>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {accounts.length === 0 && (
            <div className="sa-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>No Meta Accounts Connected</strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                  Connect your Instagram Business or Facebook Page to start publishing scheduled posts and auto-replying to comments.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => handleOpenNewAccountModal()}>
                <Plus size={14} /> Connect Account
              </button>
            </div>
          )}

          {/* Quick Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div className="sa-panel">
              <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={16} color="var(--primary)" /> Automated Post Publishing
              </h3>
              <p className="sa-help">
                Schedule posts ahead of time with images, reels, and captions. The in-process engine publishes directly to Meta Graph API.
              </p>
              <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('posts')}>
                  View Posts ({posts.length})
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowPostModal(true)}>
                  <Plus size={14} /> Create Post
                </button>
              </div>
            </div>

            <div className="sa-panel">
              <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Heart size={16} color="#ec4899" /> Comment Auto-Reply & Likes
              </h3>
              <p className="sa-help">
                When customers comment on your Instagram/FB posts, OpenWA automatically likes the comment, rotates reply templates, and can trigger AI responses.
              </p>
              <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('rules')}>
                  Manage Rules ({rules.length})
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowRuleModal(true)}>
                  <Plus size={14} /> Add Rule
                </button>
              </div>
            </div>

            <div className="sa-panel">
              <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bot size={16} color="#10b981" /> Interactive Simulator
              </h3>
              <p className="sa-help">
                Test your auto-reply rules and AI response in real time before going live on Instagram or Facebook.
              </p>
              <div style={{ marginTop: 'auto' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('simulator')}>
                  Launch Simulator
                </button>
              </div>
            </div>
          </div>

          {/* Latest activity preview */}
          <div className="sa-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Latest Activity</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('activity')}>
                View All
              </button>
            </div>
            <ActivityFeed posts={posts} logs={logs} rules={rules} onPublish={id => void handlePublishNow(id)} limit={6} />
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="sa-panel">
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Activity &amp; Logs</h3>
          <p className="sa-help">Every post and every customer comment, newest first, with what Artha did and how to fix anything that failed.</p>
          <ActivityFeed posts={posts} logs={logs} rules={rules} onPublish={id => void handlePublishNow(id)} />
        </div>
      )}

      {/* TAB 2: SCHEDULED POSTS */}
      {activeTab === 'posts' && (
        <div className="sa-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>All Posts ({posts.length})</h3>
              <p className="sa-help" style={{ marginTop: '0.2rem' }}>Scheduled and published posts across Instagram and Facebook</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowPostModal(true)}>
              <Plus size={14} /> New Post
            </button>
          </div>

          {posts.length === 0 ? (
            <div className="social-empty">
              <Send size={36} />
              <h3>No posts scheduled or published</h3>
              <p>Schedule your photo or video post to Instagram Business and Facebook Pages.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowPostModal(true)}>
                <Plus size={14} /> Create First Post
              </button>
            </div>
          ) : (
            <div className="social-posts-grid" style={{ marginTop: '0.75rem' }}>
              {posts.map(post => (
                <div key={post.id} className="social-post-card">
                  {post.mediaUrl && (
                    <div className="social-post-thumb-wrap">
                      <img src={post.mediaUrl} alt="Post preview" className="social-post-thumb" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                      <span className={`social-post-status-pill ${post.status}`}>{post.status}</span>
                    </div>
                  )}
                  <div className="social-post-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className={`social-platform-badge ${post.platform}`}>
                        {post.platform === 'instagram' ? <InstagramIcon size={12} /> : <FacebookIcon size={12} />}
                        {post.platform}
                      </span>
                      <span className="sa-muted" style={{ fontSize: '0.75rem' }}>
                        {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Immediate'}
                      </span>
                    </div>

                    <p className="social-post-caption">{post.caption}</p>

                    {post.error && (
                      <div className="sa-error" style={{ fontSize: '0.78rem' }}>
                        {post.error}
                      </div>
                    )}

                    <div className="social-post-meta">
                      <div className="sa-actions">
                        {post.status !== 'published' && post.status !== 'publishing' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => void handlePublishNow(post.id)}>
                            <Play size={12} /> Publish Now
                          </button>
                        )}
                        {post.permalink && (
                          <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                            <ExternalLink size={12} /> Open
                          </a>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={() => void handleDeletePost(post.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUTO-REPLY & LIKE RULES */}
      {activeTab === 'rules' && (
        <div className="sa-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Auto-Reply & Like Rules ({rules.length})</h3>
              <p className="sa-help" style={{ marginTop: '0.2rem' }}>
                When users comment on your posts, automatically hit like (❤️), reply with smart templates (💬), and send direct messages.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowRuleModal(true)}>
              <Plus size={14} /> New Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="social-empty">
              <Sparkles size={36} />
              <h3>No rules configured yet</h3>
              <p>Create a rule to auto-reply and like comments containing keywords like "price", "info", or "details".</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowRuleModal(true)}>
                <Plus size={14} /> Add First Rule
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
              {rules.map(rule => (
                <div key={rule.id} className="social-rule-card">
                  <div className="social-rule-head">
                    <h4 className="social-rule-title">
                      <span className={`social-platform-badge ${rule.platform}`}>
                        {rule.platform === 'instagram' ? <InstagramIcon size={12} /> : rule.platform === 'facebook' ? <FacebookIcon size={12} /> : null}
                        {rule.platform}
                      </span>
                      {rule.name}
                    </h4>

                    <div className="sa-actions">
                      <button
                        className={`btn btn-sm ${rule.enabled ? 'btn-secondary' : 'btn-danger'}`}
                        onClick={() => void handleToggleRule(rule.id, rule.enabled)}
                      >
                        {rule.enabled ? 'Active' : 'Paused'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => void handleDeleteRule(rule.id)}>
                        <Trash2 size={12} color="#ef4444" />
                      </button>
                    </div>
                  </div>

                  <div className="social-rule-tags">
                    <span className="social-tag">
                      <strong>Match:</strong> {rule.matchType}
                      {rule.matchType !== 'all' && ` (${parseList(rule.keywords).join(', ')})`}
                    </span>
                    {rule.autoLike && <span className="social-tag like">❤️ Auto-Like ON (Facebook)</span>}
                    {rule.useAi && <span className="social-tag ai">🤖 AI Smart Reply ON</span>}
                    {rule.autoDm && <span className="social-tag dm">✉️ Private DM ON</span>}
                    <span className="social-tag">⏱️ {rule.delaySeconds}s Delay</span>
                    <span className="social-tag">🎯 Triggered: {rule.triggerCount || 0} times</span>
                  </div>

                  <div className="social-rule-reply-preview">
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      REPLY TEMPLATES:
                    </div>
                    {parseList(rule.replyTemplates).join(' / ') || (rule.useAi ? 'AI-written reply' : 'No reply')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONNECTED ACCOUNTS */}
      {activeTab === 'accounts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="sa-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Connected Accounts ({accounts.length})</h3>
                <p className="sa-help" style={{ marginTop: '0.2rem' }}>
                  Manage connected Instagram Business Accounts and Facebook Pages with Meta Graph API.
                </p>
              </div>
              <div className="sa-actions">
                <button className="btn btn-secondary" onClick={() => setActiveTab('guide')}>
                  <BookOpen size={14} /> Setup Guide
                </button>
                <button className="btn btn-primary" onClick={() => handleOpenNewAccountModal()}>
                  <Plus size={14} /> Connect Account
                </button>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="social-empty">
                <InstagramIcon size={36} />
                <h3>No social accounts connected</h3>
                <p>Connect your Instagram Professional / Business Account or Facebook Page.</p>
                <p>First time? The Setup Guide walks you through every step on Instagram, Facebook and Meta.</p>
                <div className="sa-actions" style={{ justifyContent: 'center' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('guide')}>
                    <BookOpen size={14} /> Open Setup Guide
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => handleOpenNewAccountModal()}>
                    <Plus size={14} /> Connect Account
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
                <table className="social-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Account Name</th>
                      <th>Account ID</th>
                      <th>Linked Page ID</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(acc => (
                      <tr key={acc.id}>
                        <td>
                          <span className={`social-platform-badge ${acc.platform}`}>
                            {acc.platform === 'instagram' ? <InstagramIcon size={12} /> : <FacebookIcon size={12} />}
                            {acc.platform}
                          </span>
                        </td>
                        <td><strong>{acc.accountName}</strong></td>
                        <td><code>{acc.accountId}</code></td>
                        <td>{acc.pageId ? <code>{acc.pageId}</code> : '—'}</td>
                        <td>
                          <span className={`sa-chip ${acc.status === 'connected' ? 'whatsapp' : 'warn'}`}>
                            {acc.status}
                          </span>
                          {(() => {
                            const meta = parseMeta(acc.metadata);
                            const problem = acc.status === 'connected' ? meta.webhookError : meta.lastError;
                            return problem ? (
                              <div className="sa-help" title={problem} style={{ marginTop: '0.25rem', maxWidth: 260 }}>
                                {acc.status === 'connected' ? 'Webhooks off: ' : ''}
                                {problem}
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td>
                          <div className="sa-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => handleEditAccount(acc)} title="Edit / Update credentials">
                              <Edit2 size={12} /> Edit
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => void handleTestAccount(acc.id)} title="Test Meta connection">
                              <CheckCircle2 size={12} /> Test
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => void handleDeleteAccount(acc.id)} title="Disconnect account">
                              <Trash2 size={12} color="#ef4444" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Meta Webhook Integration Box */}
          <div className="sa-panel">
            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Radio size={16} color="var(--primary)" /> Meta Webhooks Configuration
            </h3>
            <p className="sa-help">
              To receive live comments, add these in your Meta App Dashboard &gt; Webhooks (Instagram: <code>comments</code>; Page:{' '}
              <code>feed</code>). The server must have <code>META_APP_SECRET</code> set, or production refuses the deliveries.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
              <div>
                <label className="sa-muted" style={{ display: 'block', marginBottom: '0.25rem' }}>CALLBACK URL</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input className="input" readOnly value={webhookUrl} style={{ fontSize: '0.85rem' }} />
                  <button className="btn btn-secondary btn-sm" onClick={() => copyToClipboard(webhookUrl, 'url')}>
                    {copiedField === 'url' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="sa-muted" style={{ display: 'block', marginBottom: '0.25rem' }}>VERIFY TOKEN</label>
                {accounts.filter(a => a.webhookVerifyToken).length === 0 ? (
                  <p className="sa-help">Connect an account first; each account gets its own verify token.</p>
                ) : (
                  accounts
                    .filter(a => a.webhookVerifyToken)
                    .map(a => (
                      <div key={a.id} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                        <input
                          className="input"
                          readOnly
                          aria-label={`Verify token for ${a.accountName}`}
                          value={a.webhookVerifyToken ?? ''}
                          style={{ fontSize: '0.85rem' }}
                        />
                        <button
                          className="btn btn-secondary btn-sm"
                          aria-label={`Copy verify token for ${a.accountName}`}
                          onClick={() => copyToClipboard(a.webhookVerifyToken ?? '', `token-${a.id}`)}
                        >
                          {copiedField === `token-${a.id}` ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SETUP GUIDE */}
      {activeTab === 'guide' && (
        <SetupGuide
          webhookUrl={webhookUrl}
          verifyTokens={accounts
            .filter(a => a.webhookVerifyToken)
            .map(a => ({ id: a.id, name: a.accountName, token: a.webhookVerifyToken ?? '' }))}
          onConnectAccount={handleOpenNewAccountModal}
        />
      )}

      {/* TAB 5: SIMULATOR & LOGS */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Simulator Box */}
          <div className="social-sim-panel">
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bot size={18} color="var(--primary)" /> Interactive Comment Simulator
              </h3>
              <p className="sa-help" style={{ marginTop: '0.2rem' }}>
                Simulate any user comment to see if it triggers an auto-reply, auto-like, or private DM.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label className="sa-muted" style={{ display: 'block', marginBottom: '0.25rem' }}>Commenter Username</label>
                <input
                  className="input"
                  value={simUser}
                  onChange={e => setSimUser(e.target.value)}
                  placeholder="e.g. rohit_mehta"
                />
              </div>

              <div>
                <label className="sa-muted" style={{ display: 'block', marginBottom: '0.25rem' }}>Platform</label>
                <select
                  className="input"
                  value={simPlatform}
                  onChange={e => setSimPlatform(e.target.value as 'instagram' | 'facebook')}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>
            </div>

            <div>
              <label className="sa-muted" style={{ display: 'block', marginBottom: '0.25rem' }}>Comment Text</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  className="input sa-grow"
                  value={simComment}
                  onChange={e => setSimComment(e.target.value)}
                  placeholder="Type a sample comment..."
                />
                <button className="btn btn-primary" onClick={() => void handleSimulate()} disabled={simulating}>
                  <Bot size={14} /> {simulating ? 'Testing...' : 'Test Automation'}
                </button>
              </div>
            </div>

            {simResult && (
              <div className={`social-sim-result ${simResult.matched ? 'matched' : 'unmatched'}`}>
                {simResult.matched ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontWeight: 600 }}>
                      <CheckCircle2 size={16} /> Rule Matched: &quot;{simResult.ruleName}&quot; ({simResult.matchType})
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', margin: '0.5rem 0', fontSize: '0.85rem' }}>
                      <span><strong>Auto-Like:</strong> {simResult.willAutoLike ? '❤️ Yes (Comment will be liked)' : 'No'}</span>
                      <span><strong>Anti-Spam Delay:</strong> ⏱️ {simResult.delaySeconds}s</span>
                    </div>
                    <div className="social-rule-reply-preview">
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                        GENERATED AUTO-REPLY MESSAGE:
                      </div>
                      💬 &quot;{simResult.generatedReply}&quot;
                    </div>
                    {simResult.willAutoDm && simResult.dmText && (
                      <div className="social-rule-reply-preview" style={{ marginTop: '0.5rem', borderLeftColor: '#3b82f6' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#3b82f6', marginBottom: '0.2rem' }}>
                          PRIVATE DIRECT MESSAGE (DM):
                        </div>
                        ✉️ &quot;{simResult.dmText}&quot;
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                    <AlertCircle size={16} />
                    No active automation rule matched this comment text. It would be safely ignored.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* MODAL: NEW POST (Standard Modal Component) */}
      <Modal
        open={showPostModal}
        onClose={() => setShowPostModal(false)}
        title="Create & Schedule Social Post"
        footer={
          <div className="sa-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowPostModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={e => void handleCreatePost(e)}>
              {newPost.publishNow ? 'Publish Immediately' : 'Schedule Post'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleCreatePost} className="social-modal-form">
          <div className="social-form-row">
            <div className="social-form-group">
              <label>Target Platform</label>
              <select
                className="input"
                value={newPost.platform}
                onChange={e => setNewPost({ ...newPost, platform: e.target.value as 'instagram' | 'facebook' })}
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>
            <div className="social-form-group">
              <label>Media Format</label>
              <select
                className="input"
                value={newPost.mediaType}
                onChange={e => setNewPost({ ...newPost, mediaType: e.target.value as 'IMAGE' | 'VIDEO' })}
              >
                <option value="IMAGE">Photo / Image</option>
                <option value="VIDEO">Video / Reel</option>
              </select>
            </div>
          </div>

          <div className="social-form-group">
            <label>Public HTTPS Media URL</label>
            <input
              className="input"
              required
              placeholder="https://images.unsplash.com/..."
              value={newPost.mediaUrl}
              onChange={e => setNewPost({ ...newPost, mediaUrl: e.target.value })}
            />
            {newPost.mediaUrl && (
              <div style={{ marginTop: '0.5rem', maxHeight: 150, overflow: 'hidden', borderRadius: 8 }}>
                <img src={newPost.mediaUrl} alt="Preview" style={{ width: '100%', maxHeight: 150, objectFit: 'cover' }} onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              </div>
            )}
          </div>

          <div className="social-form-group">
            <label>Caption & Hashtags</label>
            <textarea
              className="input"
              rows={4}
              required
              placeholder="Write your engaging caption..."
              value={newPost.caption}
              onChange={e => setNewPost({ ...newPost, caption: e.target.value })}
            />
          </div>

          <label className="social-checkbox-row">
            <input
              type="checkbox"
              checked={newPost.publishNow}
              onChange={e => setNewPost({ ...newPost, publishNow: e.target.checked })}
            />
            <span>Publish Immediately (uncheck to schedule for future)</span>
          </label>

          {!newPost.publishNow && (
            <div className="social-form-group">
              <label>Schedule Date & Time</label>
              <input
                type="datetime-local"
                className="input"
                required={!newPost.publishNow}
                value={newPost.scheduledAt}
                onChange={e => setNewPost({ ...newPost, scheduledAt: e.target.value })}
              />
            </div>
          )}
        </form>
      </Modal>

      {/* MODAL: NEW RULE (Standard Modal Component) */}
      <Modal
        open={showRuleModal}
        onClose={() => setShowRuleModal(false)}
        title="New Auto-Reply & Auto-Like Rule"
        footer={
          <div className="sa-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowRuleModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={e => void handleCreateRule(e)}>
              Save Rule
            </button>
          </div>
        }
      >
        <form onSubmit={handleCreateRule} className="social-modal-form">
          <div className="social-form-group">
            <label>Rule Name</label>
            <input
              className="input"
              required
              placeholder="e.g. Price inquiry reply"
              value={newRule.name}
              onChange={e => setNewRule({ ...newRule, name: e.target.value })}
            />
          </div>

          <div className="social-form-row">
            <div className="social-form-group">
              <label>Platform</label>
              <select
                className="input"
                value={newRule.platform}
                onChange={e => setNewRule({ ...newRule, platform: e.target.value as 'all' | 'instagram' | 'facebook' })}
              >
                <option value="all">All Platforms</option>
                <option value="instagram">Instagram Only</option>
                <option value="facebook">Facebook Only</option>
              </select>
            </div>
            <div className="social-form-group">
              <label>Match Type</label>
              <select
                className="input"
                value={newRule.matchType}
                onChange={e => setNewRule({ ...newRule, matchType: e.target.value as 'contains' | 'exact' | 'regex' | 'all' })}
              >
                <option value="contains">Contains Keywords</option>
                <option value="exact">Exact Match</option>
                <option value="all">Match All Comments</option>
                <option value="regex">Regex</option>
              </select>
            </div>
          </div>

          {newRule.matchType !== 'all' && (
            <div className="social-form-group">
              <label>Trigger Keywords (comma separated)</label>
              <input
                className="input"
                placeholder="price, cost, rate, details, buy"
                value={newRule.keywords}
                onChange={e => setNewRule({ ...newRule, keywords: e.target.value })}
              />
            </div>
          )}

          <div className="social-form-group">
            <label>Reply Templates (one per line for rotation)</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Hi {username}! Check your DM for prices 😊&#10;Hey {username}! Sent you details! ✨"
              value={newRule.replyTemplates}
              onChange={e => setNewRule({ ...newRule, replyTemplates: e.target.value })}
            />
          </div>

          <div className="social-form-row">
            <label className="social-checkbox-row">
              <input
                type="checkbox"
                checked={newRule.autoLike}
                onChange={e => setNewRule({ ...newRule, autoLike: e.target.checked })}
              />
              <span>❤️ Auto-Like (Facebook only)</span>
            </label>

            <label className="social-checkbox-row">
              <input
                type="checkbox"
                checked={newRule.useAi}
                onChange={e => setNewRule({ ...newRule, useAi: e.target.checked })}
              />
              <span>🤖 AI Powered</span>
            </label>
          </div>

          <label className="social-checkbox-row">
            <input
              type="checkbox"
              checked={newRule.autoDm}
              onChange={e => setNewRule({ ...newRule, autoDm: e.target.checked })}
            />
            <span>✉️ Send Private Direct Message (DM)</span>
          </label>

          {newRule.autoDm && (
            <div className="social-form-group">
              <label>Direct Message (DM) Text</label>
              <input
                className="input"
                placeholder="Hi {username}, here is our catalog: https://..."
                value={newRule.autoDmTemplate}
                onChange={e => setNewRule({ ...newRule, autoDmTemplate: e.target.value })}
              />
            </div>
          )}

          <div className="social-form-group">
            <label>Anti-Spam Delay (0-10 seconds, recommended 2-5)</label>
            <input
              type="number"
              min={0}
              max={10}
              className="input"
              value={newRule.delaySeconds}
              onChange={e => setNewRule({ ...newRule, delaySeconds: Number(e.target.value) })}
            />
          </div>
        </form>
      </Modal>

      {/* MODAL: CONNECT / EDIT ACCOUNT (Standard Modal Component) */}
      <Modal
        open={showAccountModal}
        onClose={() => {
          setShowAccountModal(false);
          setEditingAccount(null);
        }}
        title={editingAccount ? `Update ${editingAccount.platform === 'instagram' ? 'Instagram' : 'Facebook'} Account` : 'Connect Meta Account'}
        footer={
          <div className="sa-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowAccountModal(false);
                setEditingAccount(null);
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={e => void handleSaveAccount(e)}>
              {editingAccount ? 'Save Changes' : 'Connect Account'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveAccount} className="social-modal-form">
          <p className="sa-help" style={{ margin: 0 }}>
            Not sure where to find the IDs or the token?{' '}
            <button
              type="button"
              className="sg-link"
              onClick={() => {
                setShowAccountModal(false);
                setEditingAccount(null);
                setActiveTab('guide');
              }}
            >
              Open the Setup Guide
            </button>
          </p>
          <div className="social-form-group">
            <label>Platform</label>
            <select
              className="input"
              value={newAccount.platform}
              onChange={e => setNewAccount({ ...newAccount, platform: e.target.value as 'instagram' | 'facebook' })}
            >
              <option value="instagram">Instagram Business / Creator</option>
              <option value="facebook">Facebook Page</option>
            </select>
          </div>

          <div className="social-form-group">
            <label>Account Label / Display Name</label>
            <input
              className="input"
              placeholder="e.g. My Brand Instagram"
              value={newAccount.accountName}
              onChange={e => setNewAccount({ ...newAccount, accountName: e.target.value })}
            />
          </div>

          <div className="social-form-group">
            <label>
              {newAccount.platform === 'instagram' ? 'Instagram Business Account ID' : 'Facebook Page ID'}
            </label>
            <input
              className="input"
              required
              placeholder={newAccount.platform === 'instagram' ? '17841400000000000' : '10002938482910'}
              value={newAccount.accountId}
              onChange={e => setNewAccount({ ...newAccount, accountId: e.target.value })}
            />
          </div>

          {newAccount.platform === 'instagram' && (
            <div className="social-form-group">
              <label>Linked Facebook Page ID</label>
              <input
                className="input"
                required
                placeholder="e.g. 1092837465019"
                value={newAccount.pageId}
                onChange={e => setNewAccount({ ...newAccount, pageId: e.target.value })}
              />
            </div>
          )}

          <div className="social-form-group">
            <label>Meta Long-Lived Access Token</label>
            <textarea
              className="input"
              rows={3}
              required={!editingAccount}
              placeholder={editingAccount ? 'Leave empty to keep the saved token' : 'EAAB...'}
              value={newAccount.accessToken}
              onChange={e => setNewAccount({ ...newAccount, accessToken: e.target.value })}
            />
            <span className="sa-help">
              Stored on the server and never shown again. Outside production, <code>mock_token</code> tests the flow without
              calling Meta.
            </span>
          </div>
        </form>
      </Modal>
    </div>
  );
}
