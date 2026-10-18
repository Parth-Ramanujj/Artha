import { useState, useEffect, useCallback, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { RoleProvider, useRole, type UserRole } from './hooks/useRole';
import { ErrorBoundary } from './components/ErrorBoundary';
import { API_BASE_URL } from './services/api';
import { clearActorState, resolveStartupValidation } from './utils/authLifecycle';
import './App.css';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Chats = lazy(() => import('./pages/Chats').then(m => ({ default: m.Chats })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const MessageTester = lazy(() => import('./pages/MessageTester').then(m => ({ default: m.MessageTester })));
const Infrastructure = lazy(() => import('./pages/Infrastructure').then(m => ({ default: m.Infrastructure })));
const Plugins = lazy(() => import('./pages/Plugins'));
const Conversations = lazy(() => import('./pages/Conversations').then(m => ({ default: m.Conversations })));
const Workflows = lazy(() => import('./pages/Workflows').then(m => ({ default: m.Workflows })));
const Campaigns = lazy(() => import('./pages/Campaigns').then(m => ({ default: m.Campaigns })));
const AiSettings = lazy(() => import('./pages/AiSettings').then(m => ({ default: m.AiSettings })));
const Workspaces = lazy(() => import('./pages/Workspaces').then(m => ({ default: m.Workspaces })));
const CannedResponses = lazy(() => import('./pages/CannedResponses').then(m => ({ default: m.CannedResponses })));
const Notifications = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })));
const ContactSegments = lazy(() => import('./pages/ContactSegments').then(m => ({ default: m.ContactSegments })));
const AssignmentRules = lazy(() => import('./pages/AssignmentRules').then(m => ({ default: m.AssignmentRules })));
const SlaTracking = lazy(() => import('./pages/SlaTracking').then(m => ({ default: m.SlaTracking })));
const AbTesting = lazy(() => import('./pages/AbTesting').then(m => ({ default: m.AbTesting })));
const IntegrationsPage = lazy(() => import('./pages/Integrations').then(m => ({ default: m.Integrations })));
const ChatbotTraining = lazy(() => import('./pages/ChatbotTraining').then(m => ({ default: m.ChatbotTraining })));
const CampaignAnalytics = lazy(() => import('./pages/CampaignAnalytics').then(m => ({ default: m.CampaignAnalytics })));
const WorkflowAnalytics = lazy(() => import('./pages/WorkflowAnalytics').then(m => ({ default: m.WorkflowAnalytics })));
const AdvisorAlerts = lazy(() => import('./pages/AdvisorAlerts').then(m => ({ default: m.AdvisorAlerts })));
const FeedbackPage = lazy(() => import('./pages/Feedback').then(m => ({ default: m.Feedback })));
const SyncManager = lazy(() => import('./pages/SyncManager').then(m => ({ default: m.SyncManager })));
const FollowupRecovery = lazy(() => import('./pages/FollowupRecovery').then(m => ({ default: m.FollowupRecovery })));
const Leads = lazy(() => import('./pages/Leads').then(m => ({ default: m.Leads })));
const SalesPipeline = lazy(() => import('./pages/SalesPipeline').then(m => ({ default: m.SalesPipeline })));
const AiAgents = lazy(() => import('./pages/AiAgents').then(m => ({ default: m.AiAgents })));
const ShopifyCommerce = lazy(() => import('./pages/ShopifyCommerce').then(m => ({ default: m.ShopifyCommerce })));
const RolesManagement = lazy(() => import('./pages/RolesManagement').then(m => ({ default: m.RolesManagement })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function AppContent() {
  // Initialize from sessionStorage to avoid setState in effect
  const savedKey = sessionStorage.getItem('openwa_api_key');
  const [isAuthenticated, setIsAuthenticated] = useState(!!savedKey);
  const [, setApiKey] = useState(savedKey || '');
  const { setRole, role } = useRole();

  const handleLogin = async (key: string) => {
    setApiKey(key);
    sessionStorage.setItem('openwa_api_key', key);

    // Fetch the role from API
    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate`, {
        method: 'POST',
        headers: { 'X-API-Key': key },
      });
      if (response.ok) {
        const data = await response.json();
        setRole(data.role as UserRole);
      }
    } catch {
      // Default to viewer if we can't fetch role
      setRole('viewer');
    }

    setIsAuthenticated(true);
  };

  const handleLogout = useCallback(() => {
    setApiKey('');
    setIsAuthenticated(false);
    setRole(null);
    sessionStorage.removeItem('openwa_api_key');
    // Wipe the React Query cache too: it is keyed by resource, not actor, so without a full
    // clear a logout → login in the same tab with a different key/scope shows the previous
    // actor's sessions/messages/apiKeys/audit rows.
    clearActorState(queryClient);
  }, [setRole]);

  // Re-validate and refresh the role on mount if already authenticated
  useEffect(() => {
    if (!savedKey) return;

    fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'POST',
      headers: { 'X-API-Key': savedKey },
    })
      .then(async res => {
        const decision = resolveStartupValidation(res.status, await res.json().catch(() => null));
        if (decision.action === 'logout') {
          handleLogout();
        } else if (decision.action === 'role') {
          setRole(decision.role);
        }
      })
      .catch(() => {
        // Network failure (API unreachable): keep the cached role so a transient outage at
        // page load doesn't eject the user — an explicit 401/403 above still logs out.
      });
  }, [savedKey, setRole, handleLogout]);

  const loadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  if (!isAuthenticated) {
    return (
      <Suspense fallback={loadingFallback}>
        <Login onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={loadingFallback}>
          <Routes>
            <Route path="/" element={<Layout onLogout={handleLogout} userRole={role} />}>
              <Route index element={<Dashboard />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="chats" element={<Chats />} />
              <Route path="webhooks" element={<Webhooks />} />
              <Route path="templates" element={<Templates />} />
              {role === 'admin' && <Route path="api-keys" element={<ApiKeys />} />}
              {role === 'admin' && <Route path="workspaces" element={<Workspaces />} />}
              <Route path="logs" element={<Logs />} />
              <Route path="message-tester" element={<MessageTester />} />
              <Route path="conversations" element={<Conversations />} />
              <Route path="workflows" element={<Workflows />} />
              <Route path="campaigns" element={<Campaigns />} />
              {(role === 'admin' || role === 'operator') && <Route path="ai" element={<AiSettings />} />}
              {role === 'admin' && <Route path="infrastructure" element={<Infrastructure />} />}
              {role === 'admin' && <Route path="plugins" element={<Plugins />} />}
              <Route path="canned-responses" element={<CannedResponses />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="contact-segments" element={<ContactSegments />} />
              {(role === 'admin' || role === 'operator') && (
                <Route path="assignment-rules" element={<AssignmentRules />} />
              )}
              <Route path="sla" element={<SlaTracking />} />
              <Route path="ab-testing" element={<AbTesting />} />
              {role === 'admin' && <Route path="integrations" element={<IntegrationsPage />} />}
              <Route path="chatbot-training" element={<ChatbotTraining />} />
              <Route path="campaign-analytics" element={<CampaignAnalytics />} />
              <Route path="workflow-analytics" element={<WorkflowAnalytics />} />
              <Route path="advisor-alerts" element={<AdvisorAlerts />} />
              <Route path="feedback" element={<FeedbackPage />} />
              {role === 'admin' && <Route path="sync" element={<SyncManager />} />}
              <Route path="followup" element={<FollowupRecovery />} />
              <Route path="leads" element={<Leads />} />
              <Route path="sales-pipeline" element={<SalesPipeline />} />
              <Route path="ai-agents" element={<AiAgents />} />
              <Route path="commerce" element={<ShopifyCommerce />} />
              {role === 'admin' && <Route path="roles" element={<RolesManagement />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <AppContent />
        </RoleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
