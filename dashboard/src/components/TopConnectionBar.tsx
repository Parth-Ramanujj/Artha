import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  WifiOff,
  Phone,
  ShieldCheck,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  QrCode,
  Zap,
  Sparkles,
  Coins,
} from 'lucide-react';
import { sessionApi, type Session } from '../services/api';
import { aiCreditsService } from '../services/aiCredits';
import './TopConnectionBar.css';

export function TopConnectionBar() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // AI Credits State
  const [credits, setCredits] = useState<number>(aiCreditsService.getBalance());
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  const creditsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCreditsUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ balance: number }>;
      setCredits(custom.detail?.balance ?? aiCreditsService.getBalance());
    };
    window.addEventListener('ai-credits-updated', handleCreditsUpdate);
    return () => window.removeEventListener('ai-credits-updated', handleCreditsUpdate);
  }, []);

  // Poll sessions list every 8 seconds to keep status in sync
  const { data: sessions, isLoading, isFetching, refetch } = useQuery<Session[]>({
    queryKey: ['sessions', 'connection-status'],
    queryFn: sessionApi.list,
    refetchInterval: 8000,
    staleTime: 5000,
  });

  // Determine active ready session
  const readySession = sessions?.find(s => s.status === 'ready');
  const connectingSession = sessions?.find(s => ['initializing', 'authenticating', 'qr_ready'].includes(s.status));
  const isConnected = !!readySession;
  const isConnecting = !isConnected && !!connectingSession;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (creditsDropdownRef.current && !creditsDropdownRef.current.contains(e.target as Node)) {
        setIsCreditsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatPhone = (phone?: string | null) => {
    if (!phone) return null;
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length === 12 && clean.startsWith('91')) {
      return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
    }
    return `+${clean}`;
  };

  return (
    <div className="top-connection-bar" data-testid="top-connection-bar">
      <div className="top-bar-left">
        <div className="connection-pill-wrapper" ref={dropdownRef}>
          <button
            className={`connection-pill ${isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}`}
            onClick={() => setIsDropdownOpen(prev => !prev)}
            aria-expanded={isDropdownOpen}
            title={isConnected ? 'Official WhatsApp API Connected (Click for details)' : 'WhatsApp Disconnected (Click to connect)'}
          >
            {/* Glowing Status Dot */}
            <span className="status-indicator">
              <span className={`status-dot ${isConnected ? 'online' : isConnecting ? 'warning' : 'offline'}`} />
              <span className={`status-pulse ${isConnected ? 'online' : isConnecting ? 'warning' : 'offline'}`} />
            </span>

            {/* Status Label & Details */}
            <div className="status-text-group">
              <span className="status-title">
                {isLoading ? (
                  'Checking WhatsApp Status...'
                ) : isConnected ? (
                  'WhatsApp API Connected'
                ) : isConnecting ? (
                  'WhatsApp Connecting...'
                ) : (
                  'WhatsApp Disconnected'
                )}
              </span>

              {isConnected && readySession?.phone && (
                <span className="status-phone-badge">
                  <Phone size={11} />
                  {formatPhone(readySession.phone) || readySession.phone}
                </span>
              )}
            </div>

            <ChevronDown size={14} className={`dropdown-chevron ${isDropdownOpen ? 'open' : ''}`} />
          </button>

          {/* Quick Details Dropdown */}
          {isDropdownOpen && (
            <div className="connection-dropdown-menu">
              <div className="dropdown-header">
                <div className="dropdown-header-status">
                  <span className={`status-dot-sm ${isConnected ? 'online' : isConnecting ? 'warning' : 'offline'}`} />
                  <strong>
                    {isConnected
                      ? 'WhatsApp Official / Engine Active'
                      : isConnecting
                        ? 'Pairing / Connecting Engine'
                        : 'No Active WhatsApp Session'}
                  </strong>
                </div>
                <button
                  className="dropdown-refresh-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    refetch();
                  }}
                  title="Refresh status"
                  disabled={isFetching}
                >
                  <RefreshCw size={13} className={isFetching ? 'spin' : ''} />
                </button>
              </div>

              <div className="dropdown-body">
                {isConnected && readySession ? (
                  <div className="session-info-card">
                    <div className="info-row">
                      <span className="info-label">Active Session</span>
                      <span className="info-value font-mono">{readySession.name}</span>
                    </div>
                    {readySession.phone && (
                      <div className="info-row">
                        <span className="info-label">Phone Number</span>
                        <span className="info-value highlight">{formatPhone(readySession.phone)}</span>
                      </div>
                    )}
                    {readySession.pushName && (
                      <div className="info-row">
                        <span className="info-label">Account Name</span>
                        <span className="info-value">{readySession.pushName}</span>
                      </div>
                    )}
                    <div className="info-row">
                      <span className="info-label">Health & Engine</span>
                      <span className="info-value success-badge">
                        <ShieldCheck size={12} />
                        Engine Ready
                      </span>
                    </div>
                  </div>
                ) : isConnecting && connectingSession ? (
                  <div className="session-info-card connecting">
                    <p className="connecting-desc">
                      Session <strong>{connectingSession.name}</strong> is currently waiting for pairing or QR code scan.
                    </p>
                    <Link to="/sessions" className="btn-action-sm primary" onClick={() => setIsDropdownOpen(false)}>
                      <QrCode size={13} />
                      Scan QR Code
                    </Link>
                  </div>
                ) : (
                  <div className="session-info-card empty">
                    <p className="empty-desc">
                      There is no active WhatsApp session connected. Workflows and outbound messages will run in simulation mode until connected.
                    </p>
                    <Link to="/sessions" className="btn-action-sm primary" onClick={() => setIsDropdownOpen(false)}>
                      <Zap size={13} />
                      Connect WhatsApp Session
                    </Link>
                  </div>
                )}
              </div>

              <div className="dropdown-footer">
                <Link to="/sessions" className="footer-link" onClick={() => setIsDropdownOpen(false)}>
                  Manage All Sessions
                  <ExternalLink size={12} />
                </Link>
                <Link to="/message-tester" className="footer-link" onClick={() => setIsDropdownOpen(false)}>
                  Test Outbound Message
                  <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="top-bar-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Wati AI Credits Pill */}
        <div className="ai-credits-pill-wrapper" ref={creditsDropdownRef}>
          <button
            type="button"
            className="ai-credits-topbar-pill"
            onClick={() => setIsCreditsOpen(prev => !prev)}
            title="Wati AI Credits Wallet"
          >
            <Sparkles size={13} style={{ color: '#a855f7' }} />
            <span style={{ fontWeight: 700 }}>{credits.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>AI Credits</span>
          </button>

          {isCreditsOpen && (
            <div className="ai-credits-topbar-dropdown">
              <div className="dropdown-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Coins size={15} style={{ color: '#eab308' }} />
                  <strong>Wati AI Enterprise Wallet</strong>
                </div>
                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>Active Tier</span>
              </div>
              <div className="dropdown-body" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Remaining Balance:</span>
                  <strong style={{ color: '#6366f1' }}>{credits.toLocaleString()} / 20,000</strong>
                </div>
                <div style={{ width: '100%', height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((credits / 20000) * 100))}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                      borderRadius: 3,
                    }}
                  />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
                  Used across AI Copilot in inbox, Astra autonomous bot replies, and Voice AI speech synthesis.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%', padding: '6px', fontSize: 12, justifyContent: 'center', marginTop: 4 }}
                  onClick={() => {
                    aiCreditsService.topUp(5000, 'Purchased 5,000 Extra AI Credits');
                    setCredits(aiCreditsService.getBalance());
                  }}
                >
                  + Top-Up 5,000 Credits
                </button>
              </div>
            </div>
          )}
        </div>

        {isConnected ? (
          <div className="live-status-pill online">
            <span className="live-dot" />
            <span className="live-label">LIVE</span>
          </div>
        ) : (
          <Link to="/sessions" className="connect-now-btn">
            <WifiOff size={13} />
            <span>Connect WhatsApp</span>
          </Link>
        )}
      </div>
    </div>
  );
}
