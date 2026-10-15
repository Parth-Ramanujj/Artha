import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Download,
  Plus,
  Trash2,
  FileSpreadsheet,
  Database,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ExternalLink,
  Layers,
  Edit2,
  Search,
  Copy,
  Check,
  Eye,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { syncApi } from '../services/api';

interface SyncConfig {
  id: string;
  provider: string;
  name: string;
  direction: string;
  status: string;
  dataType: string;
  syncedCount: number;
  errorCount: number;
  lastError: string | null;
  lastSyncAt: string | null;
  enabled: boolean;
  config: {
    webhookUrl?: string;
    sheetUrl?: string;
    url?: string;
    apiKey?: string;
  } | null;
  createdAt: string;
}

interface SyncProvider {
  provider: string;
  label: string;
  dataTypes: string[];
  description: string;
}

export function SyncManager() {
  const { t } = useTranslation();
  const toast = useToast();
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [providers, setProviders] = useState<SyncProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');

  // Help Guide Accordion
  const [showGuide, setShowGuide] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    provider: 'google_sheets',
    name: '',
    direction: 'push',
    dataType: 'contacts',
    webhookUrl: '',
    apiKey: '',
  });

  // Data Preview Modal State
  const [previewConfig, setPreviewConfig] = useState<SyncConfig | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRecords, setPreviewRecords] = useState<any[]>([]);
  const [previewMode, setPreviewMode] = useState<'table' | 'json'>('table');

  const load = async () => {
    try {
      const [c, p] = await Promise.all([syncApi.list(), syncApi.providers()]);
      setConfigs(c as SyncConfig[]);
      setProviders(p);
    } catch {
      toast.error('Error', 'Failed to load sync configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreateModal = (providerId?: string) => {
    setEditingId(null);
    const p = providerId || providers[0]?.provider || 'google_sheets';
    const provObj = providers.find(item => item.provider === p);
    setForm({
      provider: p,
      name: provObj ? `${provObj.label} Sync` : 'WhatsApp Sync',
      direction: 'push',
      dataType: provObj?.dataTypes[0] || 'contacts',
      webhookUrl: '',
      apiKey: '',
    });
    setShowModal(true);
  };

  const openEditModal = (config: SyncConfig) => {
    setEditingId(config.id);
    setForm({
      provider: config.provider,
      name: config.name,
      direction: config.direction,
      dataType: config.dataType,
      webhookUrl: config.config?.webhookUrl || config.config?.sheetUrl || config.config?.url || '',
      apiKey: config.config?.apiKey || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.provider || !form.name.trim()) {
      toast.warning('Validation', 'Provider and Name are required');
      return;
    }

    const payload = {
      provider: form.provider,
      name: form.name.trim(),
      direction: form.direction,
      dataType: form.dataType,
      config: {
        webhookUrl: form.webhookUrl.trim() || undefined,
        sheetUrl: form.webhookUrl.trim() || undefined,
        apiKey: form.apiKey.trim() || undefined,
      },
    };

    try {
      if (editingId) {
        await syncApi.update(editingId, payload);
        toast.success('Updated', 'Sync configuration updated successfully');
      } else {
        await syncApi.create(payload);
        toast.success('Created', 'New sync configuration created and activated');
      }
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      toast.error('Save Failed', e instanceof Error ? e.message : 'Failed to save configuration');
    }
  };

  const handleTrigger = async (id: string, name: string) => {
    setSyncingId(id);
    try {
      const res = await syncApi.trigger(id);
      toast.success(
        'Sync Successful',
        `Successfully synced ${res.recordsSynced} records to ${res.destination || 'destination'}`
      );
      await load();
    } catch (e: unknown) {
      toast.error('Sync Error', `Sync for "${name}" failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleExport = async (c: SyncConfig, format: 'csv' | 'json' = 'csv') => {
    setExportingId(c.id);
    try {
      const res = await syncApi.exportData(c.id, format);
      const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
      const blob = new Blob([content], {
        type: res.mimeType || (format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json'),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || `${c.name.toLowerCase().replace(/\s+/g, '-')}-${c.dataType}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Export Ready', `Downloaded ${res.filename || 'export file'}`);
    } catch (err: unknown) {
      toast.error('Export Failed', err instanceof Error ? err.message : 'Could not export records');
    } finally {
      setExportingId(null);
    }
  };

  const handleOpenPreview = async (c: SyncConfig) => {
    setPreviewConfig(c);
    setPreviewLoading(true);
    try {
      const res = await syncApi.exportData(c.id, 'json');
      if (Array.isArray(res.data)) {
        setPreviewRecords(res.data);
      } else {
        setPreviewRecords([]);
      }
    } catch {
      toast.error('Preview Failed', 'Could not load records preview');
      setPreviewRecords([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete sync config "${name}"?`)) return;
    try {
      await syncApi.delete(id);
      toast.success('Deleted', `Config "${name}" deleted`);
      await load();
    } catch {
      toast.error('Delete Failed', 'Failed to delete configuration');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.info('Copied', 'URL copied to clipboard');
  };

  const copyAppsScript = () => {
    const code = `// Google Apps Script for OpenWA WhatsApp Webhook Sync
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Auto-create header row on empty sheet
    if (sheet.getLastRow() === 0) {
      if (payload.dataType === "conversations") {
        sheet.appendRow(["Customer Name", "Chat ID", "Status", "Assigned Agent", "Last Message", "Unread Count", "Last Message At", "Synced At"]);
      } else {
        sheet.appendRow(["Customer Name", "Phone Number", "Email", "Notes", "Tags", "City", "Synced At"]);
      }
      sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#e2e8f0");
    }
    
    // Append rows
    if (payload.records && payload.records.length > 0) {
      payload.records.forEach(function(r) {
        if (payload.dataType === "conversations") {
          sheet.appendRow([r.customerName, r.chatId, r.status, r.assignedAgent, r.lastMessage, r.unreadCount, r.lastMessageAt, r.syncedAt]);
        } else {
          sheet.appendRow([r.name, r.phone, r.email, r.notes, r.tags, r.city, r.syncedAt]);
        }
      });
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", count: payload.records.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
    navigator.clipboard.writeText(code);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2500);
    toast.success('Script Copied', 'Google Apps Script snippet copied to clipboard!');
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google_sheets':
        return <FileSpreadsheet size={20} color="#10b981" />;
      case 'zoho_crm':
      case 'salesforce':
      case 'hubspot':
        return <Database size={20} color="#3b82f6" />;
      default:
        return <Layers size={20} color="#8b5cf6" />;
    }
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'pull':
        return <ArrowDownLeft size={14} />;
      case 'bidirectional':
        return <ArrowLeftRight size={14} />;
      default:
        return <ArrowUpRight size={14} />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#22c55e',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <CheckCircle2 size={12} />
            Active
          </span>
        );
      case 'error':
        return (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <AlertTriangle size={12} />
            Error
          </span>
        );
      default:
        return (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(156, 163, 175, 0.15)',
              color: 'var(--text-secondary, #94a3b8)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Clock size={12} />
            {status}
          </span>
        );
    }
  };

  // Filtered Configs
  const filteredConfigs = useMemo(() => {
    return configs.filter(c => {
      const matchSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.config?.webhookUrl || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchProvider =
        providerFilter === 'all' ||
        (providerFilter === 'google_sheets' && c.provider === 'google_sheets') ||
        (providerFilter === 'crm' && ['zoho_crm', 'salesforce', 'hubspot'].includes(c.provider)) ||
        (providerFilter === 'webhook' && c.provider === 'webhook');

      return matchSearch && matchProvider;
    });
  }, [configs, searchTerm, providerFilter]);

  // Metrics
  const totalSyncs = configs.length;
  const activeSyncs = configs.filter(c => c.status === 'active').length;
  const totalSyncedRecords = configs.reduce((acc, c) => acc + (c.syncedCount || 0), 0);

  if (loading) return <div style={{ padding: 32 }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1140, margin: '0 auto' }}>
      <PageHeader
        title={t('nav.sync', 'Data Sync & Webhooks')}
        subtitle="Live two-way synchronization with Google Sheets, CRMs & external Webhooks"
        action={{ label: 'New Sync Job', onClick: () => openCreateModal() }}
      />

      {/* Top Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: 18,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
            }}
          >
            <RefreshCw size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Configured Pipelines</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{totalSyncs}</div>
          </div>
        </div>

        <div
          style={{
            padding: 18,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(34, 197, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22c55e',
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Active Pipelines</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{activeSyncs}</div>
          </div>
        </div>

        <div
          style={{
            padding: 18,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(168, 85, 247, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a855f7',
            }}
          >
            <Sparkles size={22} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Records Synced</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{totalSyncedRecords.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Google Sheets 30-Second Quick Guide Banner (Interactive) */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 18,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          onClick={() => setShowGuide(!showGuide)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSpreadsheet size={20} color="#10b981" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Connect Google Sheets in 30 Seconds (Apps Script Webhook)
            </span>
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                fontWeight: 600,
              }}
            >
              Ready Template
            </span>
          </div>
          <button className="btn btn-sm btn-secondary" style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
            {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showGuide ? 'Hide Guide' : 'Show Setup Script'}
          </button>
        </div>

        {showGuide && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Follow these simple steps to push incoming WhatsApp customer leads into Google Sheets automatically:
            </div>
            <ol style={{ fontSize: 13, color: 'var(--text-primary)', paddingLeft: 20, marginBottom: 16, lineHeight: 1.6 }}>
              <li>Open a blank Google Sheet at <code>sheets.new</code>.</li>
              <li>Click <strong>Extensions &rarr; Apps Script</strong> from top menu.</li>
              <li>Paste the script below and click <strong>Deploy &rarr; New Deployment &rarr; Web app</strong> (Access: <em>Anyone</em>).</li>
              <li>Copy the Web App URL and paste it in the <strong>Webhook URL</strong> field when creating a Sync Job!</li>
            </ol>

            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: 'var(--bg-tertiary, #0f172a)',
                  color: '#f8fafc',
                  padding: 14,
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: 220,
                  margin: 0,
                }}
              >
{`// Google Apps Script Webhook
function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Name", "Phone", "Notes", "Tags", "Synced At"]);
  }
  payload.records.forEach(function(r) {
    sheet.appendRow([r.name, r.phone, r.notes, r.tags, r.syncedAt]);
  });
  return ContentService.createTextOutput("OK");
}`}
              </pre>
              <button
                className="btn btn-primary btn-sm"
                onClick={copyAppsScript}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {scriptCopied ? <Check size={14} /> : <Copy size={14} />}
                {scriptCopied ? 'Copied!' : 'Copy Script'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Available Connectors Quick-Start Grid */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={18} color="var(--primary)" />
          Quick Connectors
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 14,
          }}
        >
          {providers.map(p => (
            <div
              key={p.provider}
              style={{
                padding: 16,
                background: 'var(--bg-secondary)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  {getProviderIcon(p.provider)}
                  {p.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
                  {p.description}
                </div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => openCreateModal(p.provider)}
                >
                  <Plus size={14} /> Connect {p.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All Pipelines (${configs.length})` },
            { id: 'google_sheets', label: 'Google Sheets' },
            { id: 'crm', label: 'CRM & ERP' },
            { id: 'webhook', label: 'Custom Webhooks' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`btn btn-sm ${providerFilter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setProviderFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            className="input"
            style={{ width: '100%', paddingLeft: 32, fontSize: 13, height: 36 }}
            placeholder="Search sync jobs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Configured Sync Pipelines List */}
      <div>
        {filteredConfigs.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              border: '1px dashed var(--border)',
            }}
          >
            <FileSpreadsheet size={40} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No matching sync configurations</h4>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 450, margin: '0 auto 16px' }}>
              Create a new sync config to start syncing WhatsApp contacts and conversations with external spreadsheets and CRMs.
            </p>
            <button className="btn btn-primary" onClick={() => openCreateModal()}>
              <Plus size={16} /> Create New Sync Job
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredConfigs.map(c => {
              const isSyncing = syncingId === c.id;
              const isExporting = exportingId === c.id;
              const targetUrl = c.config?.webhookUrl || c.config?.sheetUrl || c.config?.url;

              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '18px 22px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    flexWrap: 'wrap',
                    gap: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ minWidth: 280, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {getProviderIcon(c.provider)}
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</span>
                      {statusBadge(c.status)}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {getDirectionIcon(c.direction)}
                        <strong style={{ textTransform: 'capitalize' }}>{c.direction}</strong>
                      </span>
                      <span>&bull;</span>
                      <span style={{ textTransform: 'capitalize' }}>
                        Data: <strong>{c.dataType}</strong>
                      </span>
                      <span>&bull;</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>
                        {c.syncedCount.toLocaleString()} records synced
                      </span>
                    </div>

                    {targetUrl && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          marginTop: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <ExternalLink size={12} />
                        <code
                          style={{
                            maxWidth: 380,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                          }}
                        >
                          {targetUrl}
                        </code>
                        <button
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            padding: '2px 4px',
                          }}
                          onClick={() => copyToClipboard(targetUrl, c.id)}
                          title="Copy Endpoint URL"
                        >
                          {copiedId === c.id ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        marginTop: 6,
                        display: 'flex',
                        gap: 12,
                      }}
                    >
                      <span>
                        Last Synced: {c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString() : 'Not triggered yet'}
                      </span>
                      {c.errorCount > 0 && (
                        <span style={{ color: '#ef4444' }}>
                          Errors: {c.errorCount}
                        </span>
                      )}
                    </div>

                    {c.lastError && (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#ef4444',
                          marginTop: 6,
                          padding: '4px 10px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          borderRadius: 6,
                          display: 'inline-block',
                        }}
                      >
                        {c.lastError}
                      </div>
                    )}
                  </div>

                  {/* Actions Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* View Records Preview */}
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleOpenPreview(c)}
                      title="Inspect live database records in this pipeline"
                    >
                      <Eye size={14} />
                      View Records
                    </button>

                    {/* Live Trigger */}
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleTrigger(c.id, c.name)}
                      disabled={isSyncing || !c.enabled}
                      title="Query live records from database and dispatch to target"
                    >
                      <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>

                    {/* Download CSV */}
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleExport(c, 'csv')}
                      disabled={isExporting}
                      title="Download full CSV of real WhatsApp records"
                    >
                      <Download size={14} />
                      {isExporting ? 'Exporting...' : 'CSV'}
                    </button>

                    {/* Edit */}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEditModal(c)}
                      title="Edit Webhook / Target Configuration"
                    >
                      <Edit2 size={14} />
                    </button>

                    {/* Delete */}
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(c.id, c.name)}
                      title="Delete Sync Job"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Data Inspector Preview */}
      {previewConfig && (
        <Modal
          title={`Data Preview: ${previewConfig.name} (${previewRecords.length} records)`}
          onClose={() => setPreviewConfig(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={`btn btn-sm ${previewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPreviewMode('table')}
                >
                  Table View
                </button>
                <button
                  className={`btn btn-sm ${previewMode === 'json' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPreviewMode('json')}
                >
                  <Code size={13} style={{ marginRight: 4 }} />
                  Raw JSON
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleExport(previewConfig, 'csv')}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Download size={13} /> Download CSV
                </button>
              </div>
            </div>

            {previewLoading ? (
              <div style={{ padding: 30, textAlign: 'center' }}>Loading live records from database...</div>
            ) : previewRecords.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                No records found for this sync config.
              </div>
            ) : previewMode === 'table' ? (
              <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: 'var(--bg-tertiary, #f8fafc)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      {previewConfig.dataType === 'conversations' ? (
                        <>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Customer</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Status</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Last Message</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Unread</th>
                        </>
                      ) : (
                        <>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Name</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Phone</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Tags</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Notes</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRecords.slice(0, 50).map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        {previewConfig.dataType === 'conversations' ? (
                          <>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.customerName || r.chatId}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 10, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                                {r.status}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.lastMessage || '—'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.unreadCount || 0}</td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.name || 'Customer'}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.phone || '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {r.tags ? (
                                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 8, background: 'var(--border)' }}>
                                  {r.tags}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{r.notes || '—'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre
                style={{
                  background: 'var(--bg-tertiary, #0f172a)',
                  color: '#f8fafc',
                  padding: 14,
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  maxHeight: 380,
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(previewRecords, null, 2)}
              </pre>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setPreviewConfig(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Create / Edit Sync Pipeline */}
      {showModal && (
        <Modal
          title={editingId ? 'Edit Sync Configuration' : 'Create Live Sync Configuration'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Provider / Platform *
              <select
                className="input"
                style={{ marginTop: 4, width: '100%' }}
                value={form.provider}
                onChange={e => {
                  const newProv = e.target.value;
                  const provObj = providers.find(p => p.provider === newProv);
                  setForm(f => ({
                    ...f,
                    provider: newProv,
                    dataType: provObj?.dataTypes[0] || f.dataType,
                  }));
                }}
              >
                {providers.map(p => (
                  <option key={p.provider} value={p.provider}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Configuration Name *
              <input
                className="input"
                style={{ marginTop: 4, width: '100%' }}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. WhatsApp Inbound Leads to Google Sheets"
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Data Type *
                <select
                  className="input"
                  style={{ marginTop: 4, width: '100%' }}
                  value={form.dataType}
                  onChange={e => setForm(f => ({ ...f, dataType: e.target.value }))}
                >
                  <option value="contacts">Contacts & Leads</option>
                  <option value="conversations">Conversations & Chats</option>
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Sync Direction
                <select
                  className="input"
                  style={{ marginTop: 4, width: '100%' }}
                  value={form.direction}
                  onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                >
                  <option value="push">Push (WhatsApp &rarr; External)</option>
                  <option value="pull">Pull (External &rarr; WhatsApp)</option>
                  <option value="bidirectional">Bidirectional (&harr;)</option>
                </select>
              </label>
            </div>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Webhook / Google Apps Script / Endpoint URL
              <input
                className="input"
                style={{ marginTop: 4, width: '100%' }}
                value={form.webhookUrl}
                onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
                placeholder="https://script.google.com/macros/s/... or https://hooks.zapier.com/..."
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                When triggered, OpenWA will HTTP POST real JSON batches directly to this endpoint. Leave blank to maintain a downloadable database snapshot.
              </span>
            </label>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              API Key / Auth Header (Optional)
              <input
                type="password"
                className="input"
                style={{ marginTop: 4, width: '100%' }}
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="Bearer token or API Secret"
              />
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!form.provider || !form.name.trim()}
              >
                {editingId ? 'Update Configuration' : 'Create & Activate'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
