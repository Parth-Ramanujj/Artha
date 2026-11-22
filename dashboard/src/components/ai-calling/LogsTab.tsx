import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Filter,
  Loader2,
  Mic,
  Phone,
  PhoneCall,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Volume2,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import {
  aiCallingApi,
  type AiCall,
  type AiCallingDiagnosticsResult,
  type AiCallingLogsResponse,
  type AiCallingSetup,
} from '../../services/api';
import { useToast } from '../Toast';
import { CallDrawer } from './CallDrawer';
import { EmptyState, Pill } from './shared';
import { errorText, formatDuration, formatWhen, panel } from './callMeta';

const LEVEL_COLORS: Record<string, string> = {
  error: '#ef4444',
  warn: '#f59e0b',
  info: '#3b82f6',
  debug: '#64748b',
};

const SUBSYSTEM_ICONS: Record<string, ReactNode> = {
  stt: <Mic size={13} />,
  tts: <Volume2 size={13} />,
  llm: <Sparkles size={13} />,
  media: <Wifi size={13} />,
  dialer: <Phone size={13} />,
  call: <PhoneCall size={13} />,
  config: <Settings size={13} />,
};

const SUBSYSTEM_LABELS: Record<string, string> = {
  stt: 'STT (Speech)',
  tts: 'TTS (Voice)',
  llm: 'LLM (AI)',
  media: 'Media/WebSocket',
  dialer: 'Twilio Dialer',
  call: 'Call Session',
  config: 'Settings/Keys',
};

export function LogsTab({
  setup: _setup,
  refreshKey,
  onActivity,
}: {
  setup?: AiCallingSetup | null;
  refreshKey: number;
  onActivity?: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<AiCallingLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>('all');
  const [subsystem, setSubsystem] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Diagnostics state
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<AiCallingDiagnosticsResult | null>(null);
  const [showDiagModal, setShowDiagModal] = useState(false);

  // Call drawer for inspecting a failed call
  const [inspectCall, setInspectCall] = useState<AiCall | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const fetchLogs = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const res = await aiCallingApi.logs({
          level: level === 'all' ? undefined : level,
          subsystem: subsystem === 'all' ? undefined : subsystem,
          search: search || undefined,
          callId: selectedCallId || undefined,
          limit: 200,
        });
        setData(res);
        if (quiet) onActivity?.();
      } catch (err) {
        if (!quiet) toast.error(errorText(err, 'Could not load AI calling logs'));
      } finally {
        setLoading(false);
      }
    },
    [level, subsystem, search, selectedCallId, onActivity, toast],
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleClearLogs = async () => {
    if (!window.confirm('Clear all in-memory live diagnostic logs?')) return;
    try {
      await aiCallingApi.clearLogs();
      toast.success('Live diagnostic logs cleared');
      fetchLogs();
    } catch (err) {
      toast.error(errorText(err, 'Failed to clear logs'));
    }
  };

  const handleRunDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setShowDiagModal(true);
    try {
      const res = await aiCallingApi.diagnostics();
      setDiagnosticsResult(res);
    } catch (err) {
      toast.error(errorText(err, 'Diagnostics check failed'));
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  const handleExportJson = () => {
    if (!data) return;
    const json = JSON.stringify(data.events, null, 2);
    navigator.clipboard.writeText(json);
    toast.success('Logs copied to clipboard (JSON)');
  };

  const openCallDetails = async (callId: string) => {
    setInspectLoading(true);
    try {
      const call = await aiCallingApi.call(callId);
      setInspectCall(call);
    } catch (err) {
      toast.error(errorText(err, 'Could not load call details'));
    } finally {
      setInspectLoading(false);
    }
  };

  const events = data?.events ?? [];
  const counts = data?.subsystemCounts ?? { all: 0, error: 0, warn: 0, info: 0 };
  const failedCalls = data?.recentFailedCalls ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Banner & Action Controls */}
      <div
        style={{
          ...panel,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 15 }}>
            <Activity size={18} color="var(--primary)" />
            Diagnostics & Logs
          </div>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: '#ef444422',
              color: '#ef4444',
              border: '1px solid #ef444466',
            }}
          >
            {counts.error ?? 0} errors
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: '#f59e0b22',
              color: '#f59e0b',
              border: '1px solid #f59e0b66',
            }}
          >
            {counts.warn ?? 0} warnings
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {counts.all ?? 0} total events
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={handleRunDiagnostics}
            disabled={diagnosticsRunning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {diagnosticsRunning ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
            Run Engine Diagnostics
          </button>

          <button
            className="btn-secondary"
            onClick={handleExportJson}
            title="Export filtered logs as JSON"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Copy size={14} /> Copy JSON
          </button>

          <button
            className="btn-secondary"
            onClick={handleClearLogs}
            title="Clear in-memory logs"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#ef4444' }}
          >
            <Trash2 size={14} /> Clear
          </button>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              marginLeft: 4,
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Live auto-refresh (3s)
          </label>

          <button
            className="btn-secondary"
            onClick={() => fetchLogs()}
            title="Refresh logs"
            style={{ padding: '6px 10px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Diagnostics Modal / Panel */}
      {showDiagModal && (
        <div
          style={{
            ...panel,
            borderColor: diagnosticsResult?.allOk ? '#22c55e66' : '#ef444466',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
              <Wrench size={18} color={diagnosticsResult?.allOk ? '#22c55e' : '#f59e0b'} />
              System Diagnostics & Engine Health Check
              {diagnosticsRunning && <Loader2 size={16} className="animate-spin" />}
            </div>
            <button
              onClick={() => setShowDiagModal(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <X size={18} />
            </button>
          </div>

          {diagnosticsRunning && !diagnosticsResult && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13.5 }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              Testing STT, TTS, LLM and telephony connections...
            </div>
          )}

          {diagnosticsResult && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {diagnosticsResult.items.map(item => (
                <div
                  key={item.key}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'var(--bg-primary)',
                    border: `1px solid ${
                      item.status === 'ok'
                        ? '#22c55e44'
                        : item.status === 'warning'
                          ? '#f59e0b44'
                          : '#ef444444'
                    }`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13.5 }}>
                      {SUBSYSTEM_ICONS[item.subsystem]}
                      {item.name}
                    </div>
                    {item.status === 'ok' ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#22c55e',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <CheckCircle2 size={14} /> Ready
                      </span>
                    ) : item.status === 'warning' ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#f59e0b',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <AlertTriangle size={14} /> Warning
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#ef4444',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <AlertCircle size={14} /> Error
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.message}</div>
                  {item.latencyMs !== undefined && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Ping: {item.latencyMs} ms</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Failed Calls Breakdown */}
      {failedCalls.length > 0 && (
        <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
              <AlertCircle size={16} color="#ef4444" />
              Recent Call Failures & Crashes ({failedCalls.length})
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Phone & browser test calls that stopped with an error
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {failedCalls.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: '10px 14px',
                  background: 'var(--bg-primary)',
                  borderRadius: 10,
                  border: '1px solid #ef444433',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Pill color={c.channel === 'browser' ? '#8b5cf6' : '#3b82f6'}>
                    {c.channel === 'browser' ? 'Browser Test' : 'Phone Call'}
                  </Pill>
                  <span style={{ fontWeight: 600 }}>{c.contactName ? `${c.contactName} (${c.phone})` : c.phone}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{formatWhen(c.createdAt)}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    Duration: {formatDuration(c.durationSeconds)} ({c.turnsCount} turns)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      maxWidth: 450,
                      color: '#ef4444',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={c.error ?? 'Call failed'}
                  >
                    {c.error ?? 'Call failed'}
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => openCallDetails(c.id)}
                    disabled={inspectLoading}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    Inspect Call
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginRight: 2 }}>
            <Filter size={13} style={{ verticalAlign: '-1px' }} /> Subsystem:
          </span>
          {['all', 'stt', 'tts', 'llm', 'media', 'dialer', 'call', 'config'].map(s => (
            <button
              key={s}
              onClick={() => setSubsystem(s)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: subsystem === s ? 700 : 500,
                border: `1px solid ${subsystem === s ? 'var(--primary)' : 'var(--border)'}`,
                background: subsystem === s ? 'var(--primary)' : 'var(--bg-secondary)',
                color: subsystem === s ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {s !== 'all' && SUBSYSTEM_ICONS[s]}
              {s === 'all' ? 'All Subsystems' : SUBSYSTEM_LABELS[s] ?? s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Level:</span>
            {['all', 'error', 'warn', 'info'].map(l => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                style={{
                  padding: '3px 9px',
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: level === l ? 700 : 500,
                  border: `1px solid ${
                    level === l ? LEVEL_COLORS[l] ?? 'var(--primary)' : 'var(--border)'
                  }`,
                  background:
                    level === l
                      ? `${LEVEL_COLORS[l] ?? 'var(--primary)'}22`
                      : 'var(--bg-secondary)',
                  color: level === l ? LEVEL_COLORS[l] ?? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', width: 220 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 9,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
              }}
            />
            <input
              type="text"
              placeholder="Search message or call ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 10px 5px 28px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                fontSize: 12.5,
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {selectedCallId && (
            <button
              className="btn-secondary"
              onClick={() => setSelectedCallId(null)}
              style={{ fontSize: 11.5, padding: '4px 8px' }}
              title="Clear call filter"
            >
              Call: {selectedCallId.slice(0, 8)}… <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Log Events Stream Table */}
      <div
        style={{
          ...panel,
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading && events.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            Loading logs...
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={32} color="#22c55e" />}
            title="No logs found"
            hint={
              search || level !== 'all' || subsystem !== 'all'
                ? 'Try adjusting your filters or search keywords.'
                : 'No diagnostic events or errors recorded. Start a test call or run engine diagnostics.'
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left', width: 140, color: 'var(--text-secondary)' }}>
                    Timestamp
                  </th>
                  <th style={{ padding: '9px 14px', textAlign: 'left', width: 90, color: 'var(--text-secondary)' }}>
                    Level
                  </th>
                  <th style={{ padding: '9px 14px', textAlign: 'left', width: 130, color: 'var(--text-secondary)' }}>
                    Subsystem
                  </th>
                  <th style={{ padding: '9px 14px', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    Message & Event Trace
                  </th>
                  <th style={{ padding: '9px 14px', textAlign: 'right', width: 110, color: 'var(--text-secondary)' }}>
                    Call ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => {
                  const isExpanded = expandedLogId === ev.id;
                  const levelColor = LEVEL_COLORS[ev.level] ?? '#64748b';
                  const dateStr = new Date(ev.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <tr
                      key={ev.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isExpanded ? 'var(--bg-primary)' : 'transparent',
                      }}
                    >
                      <td colSpan={5} style={{ padding: 0 }}>
                        <div
                          onClick={() => setExpandedLogId(isExpanded ? null : ev.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '140px 90px 130px 1fr 110px',
                            padding: '9px 14px',
                            cursor: 'pointer',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'monospace' }}>
                            {dateStr}
                          </div>

                          <div>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '1px 6px',
                                borderRadius: 4,
                                fontSize: 10.5,
                                fontWeight: 700,
                                color: levelColor,
                                background: `${levelColor}1c`,
                                border: `1px solid ${levelColor}44`,
                              }}
                            >
                              {ev.level.toUpperCase()}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              color: 'var(--text-primary)',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {SUBSYSTEM_ICONS[ev.subsystem]}
                            {ev.subsystem.toUpperCase()}
                          </div>

                          <div
                            style={{
                              color: ev.level === 'error' ? '#ef4444' : 'var(--text-primary)',
                              fontWeight: ev.level === 'error' ? 600 : 400,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              paddingRight: 10,
                            }}
                          >
                            {ev.message}
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            {ev.callId ? (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedCallId(ev.callId ?? null);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--primary)',
                                  fontSize: 11.5,
                                  cursor: 'pointer',
                                  fontFamily: 'monospace',
                                }}
                                title={`Filter by call ${ev.callId}`}
                              >
                                {ev.callId.slice(0, 8)}…
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>
                            )}
                          </div>
                        </div>

                        {/* Expanded Payload / Details View */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: '10px 18px 14px',
                              background: 'var(--bg-primary)',
                              borderTop: '1px dashed var(--border)',
                              fontSize: 12,
                              fontFamily: 'monospace',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 6,
                              }}
                            >
                              <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Event ID: {ev.id} · Timestamp: {ev.timestamp}
                                {ev.channel && ` · Channel: ${ev.channel}`}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                {ev.callId && (
                                  <button
                                    className="btn-secondary"
                                    onClick={() => ev.callId && openCallDetails(ev.callId)}
                                    style={{ padding: '2px 8px', fontSize: 11 }}
                                  >
                                    View Call Drawer
                                  </button>
                                )}
                                <button
                                  className="btn-secondary"
                                  onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(ev, null, 2));
                                    toast.success('Log entry copied');
                                  }}
                                  style={{ padding: '2px 8px', fontSize: 11 }}
                                >
                                  Copy
                                </button>
                              </div>
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                padding: 10,
                                borderRadius: 8,
                                background: 'var(--bg-secondary)',
                                overflowX: 'auto',
                                maxHeight: 250,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {JSON.stringify(
                                {
                                  message: ev.message,
                                  subsystem: ev.subsystem,
                                  level: ev.level,
                                  callId: ev.callId,
                                  channel: ev.channel,
                                  details: ev.details,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer for inspecting failed calls */}
      {inspectCall && (
        <CallDrawer
          call={inspectCall}
          onClose={() => setInspectCall(null)}
          onChanged={c => setInspectCall(c)}
        />
      )}
    </div>
  );
}
