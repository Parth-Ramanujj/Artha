import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Webhook,
  Key,
  FileText,
  ClipboardList,
  LogOut,
  Send,
  Server,
  Puzzle,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Languages,
  Inbox,
  GitBranch,
  Megaphone,
  Bot,
  Building2,
  MessageSquareDashed,
  Bell,
  Users,
  UserCheck,
  Timer,
  FlaskConical,
  Plug,
  GraduationCap,
  BarChart3,
  Activity,
  BellRing,
  Star,
  RefreshCw,
  UserSearch,
  TrendingUp,
  Target,
  PhoneCall,
  Palette,
  Sparkles,
  ShoppingBag,
  ShieldAlert,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { type UserRole } from '../hooks/useRole';
import { languageOptions, resolveSupportedLanguage, rtlLanguages, type SupportedLanguage } from '../i18n';
import { healthApi } from '../services/api';
import { TopConnectionBar } from './TopConnectionBar';
import './Layout.css';

interface LayoutProps {
  onLogout: () => void;
  userRole: UserRole | null;
}

const allNavItems = [
  { to: '/', icon: LayoutDashboard, key: 'dashboard' as const, adminOnly: false },
  { to: '/sessions', icon: Smartphone, key: 'sessions' as const, adminOnly: false },
  { to: '/chats', icon: MessageSquare, key: 'chats' as const, adminOnly: false },
  { to: '/webhooks', icon: Webhook, key: 'webhooks' as const, adminOnly: false },
  { to: '/templates', icon: ClipboardList, key: 'templates' as const, adminOnly: false },
  { to: '/message-studio', icon: Palette, key: 'messageStudio' as const, adminOnly: false },
  { to: '/conversations', icon: Inbox, key: 'conversations' as const, adminOnly: false },
  { to: '/workflows', icon: GitBranch, key: 'workflows' as const, adminOnly: false },
  { to: '/campaigns', icon: Megaphone, key: 'campaigns' as const, adminOnly: false },
  { to: '/ai', icon: Bot, key: 'ai' as const, adminOnly: false },
  { to: '/workspaces', icon: Building2, key: 'workspaces' as const, adminOnly: true },
  { to: '/api-keys', icon: Key, key: 'apiKeys' as const, adminOnly: true },
  { to: '/message-tester', icon: Send, key: 'messageTester' as const, adminOnly: false },
  // Backend /infra/* is ADMIN-only; hide the nav item from non-admins (UX + defense-in-depth).
  { to: '/infrastructure', icon: Server, key: 'infrastructure' as const, adminOnly: true },
  { to: '/plugins', icon: Puzzle, key: 'plugins' as const, adminOnly: true },
  { to: '/canned-responses', icon: MessageSquareDashed, key: 'cannedResponses' as const, adminOnly: false },
  { to: '/notifications', icon: Bell, key: 'notifications' as const, adminOnly: false },
  { to: '/contact-segments', icon: Users, key: 'contactSegments' as const, adminOnly: false },
  { to: '/assignment-rules', icon: UserCheck, key: 'assignmentRules' as const, adminOnly: false },
  { to: '/sla', icon: Timer, key: 'sla' as const, adminOnly: false },
  { to: '/ab-testing', icon: FlaskConical, key: 'abTesting' as const, adminOnly: false },
  { to: '/integrations', icon: Plug, key: 'integrations' as const, adminOnly: true },
  { to: '/chatbot-training', icon: GraduationCap, key: 'chatbotTraining' as const, adminOnly: false },
  { to: '/campaign-analytics', icon: BarChart3, key: 'campaignAnalytics' as const, adminOnly: false },
  { to: '/workflow-analytics', icon: Activity, key: 'workflowAnalytics' as const, adminOnly: false },
  { to: '/advisor-alerts', icon: BellRing, key: 'advisorAlerts' as const, adminOnly: false },
  { to: '/feedback', icon: Star, key: 'feedback' as const, adminOnly: false },
  { to: '/sync', icon: RefreshCw, key: 'sync' as const, adminOnly: true },
  { to: '/followup', icon: UserSearch, key: 'followup' as const, adminOnly: false },
  { to: '/sales-pipeline', icon: TrendingUp, key: 'salesPipeline' as const, adminOnly: false },
  { to: '/leads', icon: Target, key: 'leads' as const, adminOnly: false },
  { to: '/ai-calling', icon: PhoneCall, key: 'aiCalling' as const, adminOnly: false },
  { to: '/ai-agents', icon: Sparkles, key: 'aiAgents' as const, adminOnly: false },
  { to: '/commerce', icon: ShoppingBag, key: 'commerce' as const, adminOnly: false },
  { to: '/roles', icon: ShieldAlert, key: 'roles' as const, adminOnly: true },
  { to: '/logs', icon: FileText, key: 'logs' as const, adminOnly: false },
];

type NavItemDef = (typeof allNavItems)[number];

const navSections: { id: string; paths: string[] }[] = [
  { id: 'core', paths: ['/', '/sessions'] },
  {
    id: 'messaging',
    paths: [
      '/chats',
      '/leads',

      '/ai-calling',
      '/sales-pipeline',
      '/conversations',
      '/canned-responses',
      '/templates',
      '/message-studio',
      '/message-tester',
      '/notifications',
      '/contact-segments',
    ],
  },
  {
    id: 'automation',
    paths: [
      '/workflows',
      '/campaigns',
      '/ai',
      '/ai-agents',
      '/chatbot-training',
      '/assignment-rules',
      '/followup',
      '/ab-testing',
    ],
  },
  { id: 'support', paths: ['/sla', '/advisor-alerts', '/feedback'] },
  { id: 'analytics', paths: ['/campaign-analytics', '/workflow-analytics'] },
  { id: 'integrations', paths: ['/webhooks', '/integrations', '/commerce', '/sync'] },
  { id: 'admin', paths: ['/workspaces', '/api-keys', '/roles', '/plugins', '/infrastructure', '/logs'] },
];

const OPEN_SECTIONS_KEY = 'sidebar-open-sections';

const themeIcons = { light: Sun, dark: Moon, system: Monitor };

export function Layout({ onLogout, userRole }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const ThemeIcon = themeIcons[theme];
  const themeLabel = t(`theme.${theme}`);

  const location = useLocation();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_SECTIONS_KEY) ?? '{}');
    } catch {
      return {};
    }
  });

  const isActivePath = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const activeSectionId = navSections.find(s => s.paths.some(isActivePath))?.id;
  const isSectionOpen = (id: string) => openSections[id] ?? id === activeSectionId;

  const toggleSection = (id: string) => {
    const next = { ...openSections, [id]: !isSectionOpen(id) };
    setOpenSections(next);
    try {
      localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode): section state simply isn't remembered
    }
  };

  const navGroups = navSections
    .map(section => ({
      ...section,
      items: section.paths
        .map(path => allNavItems.find(item => item.to === path))
        .filter((item): item is NavItemDef => !!item && (!item.adminOnly || userRole === 'admin')),
    }))
    .filter(group => group.items.length > 0);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Show the build-time version immediately, then replace it with the live running version from the
  // backend so a stale-built bundle can't display the wrong number. Falls back silently on error.
  const [version, setVersion] = useState(__APP_VERSION__);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    healthApi
      .check()
      .then(info => {
        if (active && info?.version) setVersion(info.version);
      })
      .catch(() => {
        /* keep the build-time fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const handleNavClick = () => {
    if (isMobile) setIsMobileOpen(false);
  };

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLanguageMenuOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isLanguageMenuOpen]);

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);
  const toggleMobile = () => setIsMobileOpen(!isMobileOpen);

  const currentLang = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);
  const languageLabel = languageOptions.find(option => option.value === currentLang)?.compactLabel ?? 'EN';
  const changeLanguage = (language: SupportedLanguage) => {
    setIsLanguageMenuOpen(false);
    void i18n.changeLanguage(language);
  };
  const isRtl = rtlLanguages.includes(currentLang);

  return (
    <div className="layout">
      {isMobile && (
        <header className="mobile-header">
          <button className="mobile-menu-btn" onClick={toggleMobile} aria-label={t('common.expand')}>
            {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="mobile-brand">
            <img src="/artha_logo.png" alt="Artha" className="sidebar-logo" />
            <span className="brand-name">{t('common.appName')}</span>
          </div>
          <div style={{ width: 40 }} />
        </header>
      )}

      {isMobile && isMobileOpen && <div className="sidebar-overlay" onClick={() => setIsMobileOpen(false)} />}

      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobile ? 'mobile' : ''} ${isMobileOpen ? 'open' : ''}`}
      >
        <div className="sidebar-header">
          <img src="/artha_logo.png" alt="Artha" className="sidebar-logo" />
          {!isCollapsed && (
            <div className="sidebar-brand">
              <span className="brand-name">{t('common.appName')}</span>
              <span className="brand-version">v{version}</span>
            </div>
          )}
        </div>

        {!isMobile && (
          <button
            className="collapse-toggle"
            onClick={toggleCollapse}
            title={isCollapsed ? t('common.expand') : t('common.collapse')}
            aria-label={isCollapsed ? t('common.expand') : t('common.collapse')}
          >
            {isCollapsed ? (
              isRtl ? (
                <ChevronLeft size={16} />
              ) : (
                <ChevronRight size={16} />
              )
            ) : isRtl ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </button>
        )}

        <nav className="sidebar-nav">
          {navGroups.map(group => {
            const isCore = group.id === 'core';
            const open = isCollapsed || isSectionOpen(group.id);
            return (
              <div key={group.id} className="nav-section">
                {!isCore && !isCollapsed && (
                  <button
                    type="button"
                    className="nav-section-header"
                    onClick={() => toggleSection(group.id)}
                    aria-expanded={open}
                  >
                    <span>{t(`nav.sections.${group.id}`)}</span>
                    <ChevronDown size={14} className={`nav-section-chevron${open ? ' open' : ''}`} />
                  </button>
                )}
                {!isCore && isCollapsed && <div className="nav-section-divider" />}
                {open &&
                  group.items.map(({ to, icon: Icon, key }) => {
                    const label = t(`nav.${key}`);
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        end={to === '/'}
                        onClick={handleNavClick}
                        title={isCollapsed ? label : undefined}
                      >
                        <Icon size={20} />
                        {!isCollapsed && <span>{label}</span>}
                      </NavLink>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="language-menu" ref={languageMenuRef}>
            <button
              className="theme-toggle-btn"
              onClick={() => setIsLanguageMenuOpen(open => !open)}
              title={t('common.language')}
              aria-label={t('common.language')}
              aria-haspopup="menu"
              aria-expanded={isLanguageMenuOpen}
            >
              <Languages size={18} />
              {!isCollapsed && <span>{languageLabel}</span>}
            </button>
            {isLanguageMenuOpen && (
              <div className="language-menu-list" role="menu" aria-label={t('common.language')}>
                {languageOptions.map(option => (
                  <button
                    key={option.value}
                    className={`language-menu-item ${option.value === currentLang ? 'active' : ''}`}
                    onClick={() => changeLanguage(option.value)}
                    role="menuitemradio"
                    aria-checked={option.value === currentLang}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="appearance-menu">
            <button
              className="theme-toggle-btn"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              title={t('theme.toggleTo', { value: t(resolvedTheme === 'dark' ? 'theme.light' : 'theme.dark') })}
              aria-label={t('theme.toggleTo', { value: t(resolvedTheme === 'dark' ? 'theme.light' : 'theme.dark') })}
            >
              <span className="appearance-button-cue" aria-hidden="true">
                <ThemeIcon size={16} />
              </span>
              {!isCollapsed && <span>{themeLabel}</span>}
            </button>
          </div>
          <button className="logout-btn" onClick={onLogout} title={isCollapsed ? t('common.logout') : undefined}>
            <LogOut size={20} />
            {!isCollapsed && <span>{t('common.logout')}</span>}
          </button>
        </div>
      </aside>

      <main className={`main-content ${isCollapsed ? 'expanded' : ''} ${isMobile ? 'mobile' : ''}`}>
        <TopConnectionBar />
        <Outlet />
      </main>
    </div>
  );
}
