import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
  Text,
} from 'react-native';
import { Header } from './src/components/Header';
import { BottomNav, TabName } from './src/components/BottomNav';
import { ConnectChannelModal } from './src/components/ConnectChannelModal';
import { LoginScreen } from './src/screens/LoginScreen';
import { HubScreen, ScreenId } from './src/screens/HubScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { CrmScreen } from './src/screens/CrmScreen';
import { AutomationsScreen } from './src/screens/AutomationsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { CatalogScreen } from './src/screens/CatalogScreen';
import { BroadcastsScreen } from './src/screens/BroadcastsScreen';
import { FlowsBuilderScreen } from './src/screens/FlowsBuilderScreen';
import { FollowUpScreen } from './src/screens/FollowUpScreen';
import { ReviewsScreen } from './src/screens/ReviewsScreen';
import { MediaLibraryScreen } from './src/screens/MediaLibraryScreen';
import { IntegrationFabricScreen } from './src/screens/IntegrationFabricScreen';
import { VoiceHubScreen } from './src/screens/VoiceHubScreen';
import { AIAgentScreen } from './src/screens/AIAgentScreen';
import { WebhookInspectorScreen } from './src/screens/WebhookInspectorScreen';
import { Colors } from './src/theme/colors';
import { api } from './src/services/api';
import {
  Workspace,
  PlatformConnection,
  QuickStat,
  ActivityItem,
  InboxConversation,
  CrmDeal,
  FollowUpTask,
  GoogleReview,
  WhatsAppBroadcast,
  CatalogProduct,
  WhatsAppFlow,
  WorkflowRule,
  MediaAsset,
  IntegrationApp,
  WebhookLog,
} from './src/types';

export default function App() {
  // SaaS Multi-Tenant State
  const [workspaces, setWorkspaces] = useState<Workspace[]>(api.getInitialWorkspaces());
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(workspaces[0]);

  // Omnichannel Platform State
  const [stats, setStats] = useState<QuickStat[]>(api.getInitialStats());
  const [channels, setChannels] = useState<PlatformConnection[]>(api.getInitialChannels());
  const [activities, setActivities] = useState<ActivityItem[]>(api.getInitialActivities());
  const [conversations, setConversations] = useState<InboxConversation[]>(api.getInitialConversations());
  const [deals, setDeals] = useState<CrmDeal[]>(api.getInitialDeals());
  const [followUps, setFollowUps] = useState<FollowUpTask[]>(api.getInitialFollowUps());
  const [reviews, setReviews] = useState<GoogleReview[]>(api.getInitialReviews());
  const [broadcasts, setBroadcasts] = useState<WhatsAppBroadcast[]>(api.getInitialBroadcasts());
  const [products, setProducts] = useState<CatalogProduct[]>(api.getInitialProducts());
  const [flows, setFlows] = useState<WhatsAppFlow[]>(api.getInitialFlows());
  const [workflows, setWorkflows] = useState<WorkflowRule[]>(api.getInitialWorkflows());
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(api.getInitialMediaAssets());
  const [integrations, setIntegrations] = useState<IntegrationApp[]>(api.getInitialIntegrations());
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>(api.getInitialWebhookLogs());

  // Navigation State
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('hub');
  const [activeTab, setActiveTab] = useState<TabName>('hub');
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Authentication & Session State (Matching Artha Web Dashboard)
  const [authState, setAuthState] = useState<'checking' | 'logged_in' | 'logged_out'>('checking');
  const [currentUserRole, setCurrentUserRole] = useState<string>('admin');

  // Live Production Backend Data Loader
  const loadLiveData = async () => {
    setIsRefreshing(true);
    try {
      await api.init();
      // 1. Live channels
      const chRes = await api.fetchLiveChannels();
      if (chRes.success && chRes.data && chRes.data.length > 0) {
        setChannels(chRes.data);
      }
      // 2. Live stats
      const stRes = await api.fetchLiveStats();
      if (stRes.success && stRes.data && stRes.data.length > 0) {
        setStats(stRes.data);
      }
      // 3. Live workspaces
      const wsRes = await api.fetchLiveWorkspaces();
      if (wsRes.success && wsRes.data && wsRes.data.length > 0) {
        setWorkspaces(wsRes.data);
        setActiveWorkspace(wsRes.data[0]);
      }
      // 4. Live conversations
      const convRes = await api.fetchLiveConversations();
      if (convRes.success && convRes.data && convRes.data.length > 0) {
        setConversations(convRes.data);
      }
      // 5. Live deals
      const dealRes = await api.fetchLiveDeals();
      if (dealRes.success && dealRes.data && dealRes.data.length > 0) {
        setDeals(dealRes.data);
      }
      // 6. Live workflows
      const wfRes = await api.fetchLiveWorkflows();
      if (wfRes.success && wfRes.data && wfRes.data.length > 0) {
        setWorkflows(wfRes.data);
      }
      // 7. Live campaigns
      const cmpRes = await api.fetchLiveCampaigns();
      if (cmpRes.success && cmpRes.data && cmpRes.data.length > 0) {
        setBroadcasts(cmpRes.data);
      }
      // 8. Live webhook logs
      const logRes = await api.fetchLiveWebhookLogs();
      if (logRes.success && logRes.data && logRes.data.length > 0) {
        setWebhookLogs(logRes.data);
      }
    } catch {
      // Keep state resilient on initial boot / offline
    } finally {
      setIsRefreshing(false);
    }
  };

  // Check initial authentication against hosted server
  useEffect(() => {
    const checkInitialAuth = async () => {
      await api.init();
      const existingKey = api.getApiKey();
      if (existingKey) {
        const val = await api.validateConnection();
        if (val.valid) {
          setCurrentUserRole(val.role || 'admin');
          setAuthState('logged_in');
          await loadLiveData();
          return;
        }
      }
      setAuthState('logged_out');
    };

    checkInitialAuth();
  }, []);

  const handleLoginSuccess = async (role: string) => {
    setCurrentUserRole(role);
    setAuthState('logged_in');
    await loadLiveData();
  };

  const handleExploreDemo = () => {
    setCurrentUserRole('admin');
    setAuthState('logged_in');
  };

  const handleLogout = async () => {
    await api.logout();
    setAuthState('logged_out');
  };

  // Sync activeTab with currentScreen
  const handleTabChange = (tab: TabName) => {
    setActiveTab(tab);
    setCurrentScreen(tab as ScreenId);
  };

  const handleNavigate = (screenId: ScreenId) => {
    setCurrentScreen(screenId);
    if (screenId === 'hub' || screenId === 'inbox' || screenId === 'crm' || screenId === 'automations' || screenId === 'settings') {
      setActiveTab(screenId as TabName);
    }
  };

  const handleBackToHub = () => {
    setCurrentScreen('hub');
    setActiveTab('hub');
  };

  // Channel Connection Handler
  const handleChannelConnected = (newChannel: PlatformConnection) => {
    setChannels((prev) => [newChannel, ...prev]);

    const newActivity: ActivityItem = {
      id: `act-${Date.now()}`,
      senderName: 'Gateway Security',
      avatarText: 'GW',
      timestamp: 'Just now',
      message: `Successfully connected ${newChannel.name} (${newChannel.identifier})`,
      channel: newChannel.name,
      channelType: newChannel.type,
    };
    setActivities((prev) => [newActivity, ...prev]);

    const newLog: WebhookLog = {
      id: `log-${Date.now()}`,
      event: `${newChannel.type}.channel.connected`,
      source: 'OpenWA Cloud API Gateway',
      status: 'DELIVERED',
      statusCode: 200,
      timestamp: new Date().toLocaleTimeString(),
    };
    setWebhookLogs((prev) => [newLog, ...prev]);
    void loadLiveData();
  };

  // Chat message send handler
  const handleSendMessage = (conversationId: string, text: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === conversationId) {
          return {
            ...c,
            lastMessage: text,
            timestamp: 'Just now',
            messages: [
              ...c.messages,
              {
                id: `msg-${Date.now()}`,
                sender: 'user',
                text,
                timestamp: 'Just now',
                status: 'delivered',
                channel: c.channel,
              },
            ],
          };
        }
        return c;
      })
    );
    void api.sendChatMessage(conversationId, text);
  };

  // Catalog share to chat handler
  const handleShareProductToChat = (product: CatalogProduct) => {
    // Add product share to Priya Patel's conversation
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === 'conv-1') {
          return {
            ...c,
            lastMessage: `[Catalog Item] ${product.title} - ${product.price}`,
            timestamp: 'Just now',
            messages: [
              ...c.messages,
              {
                id: `msg-${Date.now()}`,
                sender: 'user',
                text: `Here is our ${product.title} (${product.price}). Would you like me to reserve units for you?`,
                timestamp: 'Just now',
                status: 'delivered',
                channel: 'whatsapp',
              },
            ],
          };
        }
        return c;
      })
    );

    // Switch to Inbox
    handleNavigate('inbox');
  };

  // CRM Deal advancement handler
  const handleAdvanceDeal = (dealId: string) => {
    const stageFlow: Record<CrmDeal['stage'], CrmDeal['stage']> = {
      new: 'qualified',
      qualified: 'proposal',
      proposal: 'won',
      won: 'won',
    };

    let nextStage: CrmDeal['stage'] = 'won';
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id === dealId) {
          nextStage = stageFlow[d.stage];
          return {
            ...d,
            stage: nextStage,
          };
        }
        return d;
      })
    );
    void api.advanceDealStage(dealId, nextStage);
  };

  // Broadcast campaign launch handler
  const handleSendBroadcast = (newBc: WhatsAppBroadcast) => {
    setBroadcasts((prev) => [newBc, ...prev]);
    void api.launchCampaign({
      name: newBc.name,
      templateName: newBc.templateName,
      status: 'scheduled',
    });
  };

  // Follow-up nudge handler
  const handleNudgeContact = (task: FollowUpTask) => {
    setFollowUps((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: 'completed' } : t))
    );
  };

  // Google review reply handler
  const handlePostReviewReply = (reviewId: string, reply: string) => {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, replyStatus: 'replied', draftReply: reply } : r
      )
    );
  };

  // Integration toggle handler
  const handleToggleIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((app) =>
        app.id === id
          ? {
              ...app,
              status: app.status === 'CONNECTED' ? 'DISCONNECTED' : 'CONNECTED',
            }
          : app
      )
    );
  };

  const unreadCount = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  if (authState === 'checking') {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centerContent]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.splashText}>Verifying Artha Gateway Connection...</Text>
      </SafeAreaView>
    );
  }

  if (authState === 'logged_out') {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        onExploreDemo={handleExploreDemo}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.appContainer}>
        {/* Top App Header with Workspace selector & Live status */}
        <Header
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={setActiveWorkspace}
          unreadCount={unreadCount}
          onOpenNotifications={() => handleNavigate('inbox')}
        />

        {/* Dynamic Screen View Router */}
        <View style={styles.screenWrapper}>
          {currentScreen === 'hub' && (
            <HubScreen
              stats={stats}
              channels={channels}
              activities={activities}
              onOpenConnectModal={() => setConnectModalOpen(true)}
              onNavigateScreen={handleNavigate}
              onRefresh={loadLiveData}
              isRefreshing={isRefreshing}
            />
          )}

          {currentScreen === 'inbox' && (
            <InboxScreen
              conversations={conversations}
              onSendMessage={handleSendMessage}
            />
          )}

          {currentScreen === 'crm' && (
            <CrmScreen
              deals={deals}
              onAdvanceDeal={handleAdvanceDeal}
            />
          )}

          {currentScreen === 'automations' && (
            <AutomationsScreen
              workflows={workflows}
              onToggleWorkflow={(id) => {
                let nextActive = true;
                setWorkflows((prev) =>
                  prev.map((wf) => {
                    if (wf.id === id) {
                      nextActive = !wf.isActive;
                      return { ...wf, isActive: nextActive };
                    }
                    return wf;
                  })
                );
                void api.toggleWorkflowActive(id, nextActive);
              }}
            />
          )}

          {currentScreen === 'settings' && (
            <SettingsScreen
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              webhookLogs={webhookLogs}
              onSelectWorkspace={setActiveWorkspace}
              onAddWorkspace={(ws) => setWorkspaces((prev) => [ws, ...prev])}
              onLogout={handleLogout}
            />
          )}

          {currentScreen === 'catalog' && (
            <CatalogScreen
              products={products}
              onBack={handleBackToHub}
              onShareToChat={handleShareProductToChat}
              onAddProduct={(p) => setProducts((prev) => [p, ...prev])}
            />
          )}

          {currentScreen === 'broadcasts' && (
            <BroadcastsScreen
              broadcasts={broadcasts}
              onBack={handleBackToHub}
              onSendBroadcast={handleSendBroadcast}
            />
          )}

          {currentScreen === 'flows' && (
            <FlowsBuilderScreen
              flows={flows}
              onBack={handleBackToHub}
            />
          )}

          {currentScreen === 'followup' && (
            <FollowUpScreen
              tasks={followUps}
              onBack={handleBackToHub}
              onNudgeContact={handleNudgeContact}
            />
          )}

          {currentScreen === 'reviews' && (
            <ReviewsScreen
              reviews={reviews}
              onBack={handleBackToHub}
              onPostReply={handlePostReviewReply}
            />
          )}

          {currentScreen === 'media' && (
            <MediaLibraryScreen
              assets={mediaAssets}
              onBack={handleBackToHub}
              onPostStatus={() => {
                const newAsset: MediaAsset = {
                  id: `media-${Date.now()}`,
                  title: 'WhatsApp Status 24h Story Live',
                  type: 'status',
                  fileSize: '3.8 MB',
                  uploadedAt: 'Just now',
                  previewUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&q=80',
                };
                setMediaAssets((prev) => [newAsset, ...prev]);
              }}
            />
          )}

          {currentScreen === 'integrations' && (
            <IntegrationFabricScreen
              integrations={integrations}
              onBack={handleBackToHub}
              onToggleIntegration={handleToggleIntegration}
            />
          )}

          {currentScreen === 'voice-hub' && (
            <VoiceHubScreen onBack={handleBackToHub} />
          )}

          {currentScreen === 'ai-agent' && (
            <AIAgentScreen onBack={handleBackToHub} />
          )}

          {currentScreen === 'webhooks' && (
            <WebhookInspectorScreen
              logs={webhookLogs}
              onBack={handleBackToHub}
            />
          )}
        </View>

        {/* Bottom Nav Dock */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          inboxUnread={unreadCount}
        />

        {/* Connect Channel Modal Sheet */}
        <ConnectChannelModal
          visible={connectModalOpen}
          onClose={() => setConnectModalOpen(false)}
          onChannelConnected={handleChannelConnected}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  appContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  screenWrapper: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  splashText: {
    color: Colors.onSurfaceVariant,
    fontSize: 14,
    marginTop: 16,
    fontWeight: '500',
  },
});
