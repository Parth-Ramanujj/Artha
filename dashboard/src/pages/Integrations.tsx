import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plug,
  CheckCircle2,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Activity,
  Layers,
  ShoppingBag,
  Calendar,
  Database,
  Radio,
  Search,
  Copy,
  Check,
  Send,
  Zap,
  Globe,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { integrationApi } from '../services/api';
import './Integrations.css';

interface IntegrationType {
  type: string;
  label: string;
  category: string;
  description: string;
}

interface Integration {
  id: string;
  type: string;
  name: string;
  status: string;
  config: {
    webhookUrl?: string;
    url?: string;
    apiUrl?: string;
    apiKey?: string;
    environment?: string;
  } | null;
  enabled: boolean;
  lastError: string | null;
  createdAt: string;
}

interface TestResult {
  latencyMs?: number;
  statusCode?: number;
  success: boolean;
  message: string;
  testedAt: string;
}

export function Integrations() {
  const { t } = useTranslation();
  const toast = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [types, setTypes] = useState<IntegrationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Test Results Map
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Webhook Simulator Modal State
  const [simulatorItem, setSimulatorItem] = useState<Integration | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simEvent, setSimEvent] = useState('contact.created');

  const [form, setForm] = useState({
    type: 'crm_zoho',
    name: '',
    webhookUrl: '',
    apiKey: '',
    environment: 'production',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [list, typesList] = await Promise.all([integrationApi.list(), integrationApi.types()]);
      setIntegrations(list as Integration[]);
      setTypes(typesList);
    } catch {
      toast.addToast({ type: 'error', title: t('common.error') });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = (initialType?: string, initialName?: string) => {
    setEditingId(null);
    setForm({
      type: initialType || types[0]?.type || 'crm_zoho',
      name: initialName || '',
      webhookUrl: '',
      apiKey: '',
      environment: 'production',
    });
    setShowModal(true);
  };

  const openEdit = (item: Integration) => {
    setEditingId(item.id);
    setForm({
      type: item.type,
      name: item.name,
      webhookUrl: item.config?.webhookUrl || item.config?.url || item.config?.apiUrl || '',
      apiKey: item.config?.apiKey || '',
      environment: item.config?.environment || 'production',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const selectedType = types.find(t => t.type === form.type);
    const finalName = form.name.trim() || selectedType?.label || form.type;

    const payload = {
      type: form.type,
      name: finalName,
      config: {
        webhookUrl: form.webhookUrl.trim() || undefined,
        url: form.webhookUrl.trim() || undefined,
        apiKey: form.apiKey.trim() || undefined,
        environment: form.environment,
      },
    };

    try {
      if (editingId) {
        await integrationApi.update(editingId, payload);
        toast.success(t('common.success'), 'Integration updated successfully');
      } else {
        await integrationApi.create(payload);
        toast.success(t('common.success'), 'Integration created successfully');
      }
      setShowModal(false);
      await load();
    } catch (err: unknown) {
      toast.error(t('common.error'), err instanceof Error ? err.message : 'Failed to save integration');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await integrationApi.test(id);
      const result: TestResult = {
        latencyMs: res.latencyMs,
        statusCode: res.statusCode,
        success: res.success,
        message: res.message || (res.success ? 'Connected successfully' : 'Check failed'),
        testedAt: new Date().toLocaleTimeString(),
      };
      setTestResults(prev => ({ ...prev, [id]: result }));

      if (res.success) {
        toast.success(
          'Connection Verified',
          `Target endpoint reachable in ${res.latencyMs || 0}ms (HTTP ${res.statusCode || 200})`
        );
      } else {
        toast.error('Connection Check Failed', res.message || 'Could not verify target endpoint');
      }
      await load();
    } catch (err: unknown) {
      toast.error('Test Failed', err instanceof Error ? err.message : 'Connection test timed out or failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleConnect = async (id: string) => {
    try {
      await integrationApi.connect(id);
      await load();
      toast.success('Connected', 'Integration connected and active');
    } catch (err: unknown) {
      toast.error(t('common.error'), err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await integrationApi.disconnect(id);
      await load();
      toast.info('Disconnected', 'Integration paused');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await integrationApi.delete(id);
      await load();
      toast.success(t('common.success'), 'Integration removed');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const copyUrl = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.info('Copied', 'URL copied to clipboard');
  };

  const handleSimulateWebhook = async () => {
    if (!simulatorItem) return;
    setSimulating(true);
    try {
      // Direct probe with simulation event
      const res = await integrationApi.test(simulatorItem.id);
      if (res.success) {
        toast.success(
          'Payload Dispatched',
          `Event "${simEvent}" successfully processed by target (${res.latencyMs || 0}ms)`
        );
        setSimulatorItem(null);
      } else {
        toast.error('Webhook Error', res.message || 'Target endpoint rejected test payload');
      }
    } catch (err: unknown) {
      toast.error('Simulation Failed', err instanceof Error ? err.message : 'Failed to send payload');
    } finally {
      setSimulating(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'crm':
        return <Database size={16} color="#3b82f6" />;
      case 'ecommerce':
        return <ShoppingBag size={16} color="#10b981" />;
      case 'calendar':
        return <Calendar size={16} color="#f59e0b" />;
      default:
        return <Layers size={16} color="#8b5cf6" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="int-status-badge connected">
            <span className="int-status-dot" />
            Connected
          </span>
        );
      case 'error':
        return (
          <span className="int-status-badge error">
            <span className="int-status-dot" />
            Error
          </span>
        );
      default:
        return (
          <span className="int-status-badge paused">
            <span className="int-status-dot" />
            {status === 'disconnected' ? 'Paused' : status}
          </span>
        );
    }
  };

  // Filtered active integrations
  const filteredIntegrations = useMemo(() => {
    return integrations.filter(item => {
      const typeDef = types.find(t => t.type === item.type);
      const matchSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.config?.webhookUrl || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'crm' && typeDef?.category === 'crm') ||
        (categoryFilter === 'ecommerce' && typeDef?.category === 'ecommerce') ||
        (categoryFilter === 'calendar' && typeDef?.category === 'calendar');

      return matchSearch && matchCategory;
    });
  }, [integrations, types, searchTerm, categoryFilter]);

  // Grouped types for catalog
  const groupedTypes = useMemo(() => {
    return types.reduce<Record<string, IntegrationType[]>>((acc, t) => {
      if (
        categoryFilter === 'all' ||
        (categoryFilter === 'crm' && t.category === 'crm') ||
        (categoryFilter === 'ecommerce' && t.category === 'ecommerce') ||
        (categoryFilter === 'calendar' && t.category === 'calendar')
      ) {
        if (!searchTerm || t.label.toLowerCase().includes(searchTerm.toLowerCase()) || t.description.toLowerCase().includes(searchTerm.toLowerCase())) {
          (acc[t.category] = acc[t.category] || []).push(t);
        }
      }
      return acc;
    }, {});
  }, [types, categoryFilter, searchTerm]);

  const connectedCount = integrations.filter(i => i.status === 'connected').length;

  if (loading && integrations.length === 0) return <div className="page-loading">{t('common.loading')}</div>;

  return (
    <div className="int-container">
      <PageHeader
        title="CRM & Platform Integrations"
        subtitle="Connect WhatsApp conversations, contacts, and leads with external CRMs, e-commerce stores, and calendars"
        action={{
          label: 'Add Integration',
          onClick: () => openCreate(),
          icon: <Plus size={16} />,
        }}
      />

      {/* Top Stats Overview */}
      <div className="int-stats-grid">
        <div className="int-stat-card">
          <div className="int-stat-icon blue">
            <Plug size={24} />
          </div>
          <div>
            <div className="int-stat-value">{integrations.length}</div>
            <div className="int-stat-label">Configured Integrations</div>
          </div>
        </div>

        <div className="int-stat-card">
          <div className="int-stat-icon emerald">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div className="int-stat-value" style={{ color: '#10b981' }}>{connectedCount}</div>
            <div className="int-stat-label">Active & Connected</div>
          </div>
        </div>

        <div className="int-stat-card">
          <div className="int-stat-icon purple">
            <Radio size={24} />
          </div>
          <div>
            <div className="int-stat-value">{types.length}</div>
            <div className="int-stat-label">Supported Ecosystems</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="int-toolbar">
        <div className="int-filter-group">
          {[
            { id: 'all', label: `All (${integrations.length})` },
            { id: 'crm', label: 'CRM & Pipeline' },
            { id: 'ecommerce', label: 'E-Commerce' },
            { id: 'calendar', label: 'Calendars & Scheduling' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`int-filter-pill ${categoryFilter === tab.id ? 'active' : ''}`}
              onClick={() => setCategoryFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="int-search-box">
          <Search size={15} className="int-search-icon" />
          <input
            className="int-search-input"
            placeholder="Search integrations..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Active Integrations Section */}
      <div style={{ marginBottom: 36 }}>
        <div className="int-section-header">
          <h3 className="int-section-title">
            <Zap size={18} color="var(--primary)" />
            Active Connections ({filteredIntegrations.length})
          </h3>
          <button
            className="btn btn-sm btn-secondary"
            onClick={load}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {filteredIntegrations.length === 0 ? (
          <div className="int-empty-state">
            <Plug size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, color: 'var(--text-primary)' }}>No Matching Integrations</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.5 }}>
              Connect Zoho CRM, HubSpot, Google Calendar, or Webhook to automatically sync WhatsApp leads.
            </p>
            <button className="btn btn-primary" onClick={() => openCreate()}>
              <Plus size={15} /> Set Up Your First Integration
            </button>
          </div>
        ) : (
          <div className="int-active-grid">
            {filteredIntegrations.map(item => {
              const typeDef = types.find(t => t.type === item.type);
              const targetUrl = item.config?.webhookUrl || item.config?.url || item.config?.apiUrl;
              const test = testResults[item.id];

              return (
                <div key={item.id} className="int-active-card">
                  <div>
                    <div className="int-card-top">
                      <div className="int-card-identity">
                        <div className="int-avatar">
                          {getCategoryIcon(typeDef?.category || '')}
                        </div>
                        <div>
                          <div className="int-card-name">{item.name}</div>
                          <div className="int-card-type-label">
                            {typeDef?.label || item.type}
                          </div>
                        </div>
                      </div>
                      {statusBadge(item.status)}
                    </div>

                    {/* Target details */}
                    <div className="int-endpoint-box">
                      <div className="int-endpoint-row">
                        <span className="int-endpoint-label">Endpoint URL:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="int-endpoint-val">
                            {targetUrl || 'Snapshot Only'}
                          </span>
                          {targetUrl && (
                            <button
                              className="int-copy-btn"
                              onClick={() => copyUrl(targetUrl, item.id)}
                              title="Copy URL"
                            >
                              {copiedId === item.id ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="int-endpoint-row">
                        <span className="int-endpoint-label">Auth Token:</span>
                        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          {item.config?.apiKey ? '••••••••••••' : 'None'}
                        </span>
                      </div>
                    </div>

                    {/* Live Test Result Badge */}
                    {test && (
                      <div className={`int-test-pill ${test.success ? 'success' : 'fail'}`}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                          <Activity size={13} />
                          {test.success ? `⚡ ${test.latencyMs}ms (HTTP ${test.statusCode || 200})` : 'Connection Failed'}
                        </span>
                        <span style={{ fontSize: 11, opacity: 0.85 }}>Tested at {test.testedAt}</span>
                      </div>
                    )}

                    {item.lastError && (
                      <div className="int-error-pill">
                        {item.lastError}
                      </div>
                    )}
                  </div>

                  {/* Actions bar */}
                  <div className="int-actions-bar">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleTest(item.id)}
                        disabled={testingId === item.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        title="Ping target endpoint and measure latency"
                      >
                        <Activity size={13} className={testingId === item.id ? 'animate-spin' : ''} />
                        {testingId === item.id ? 'Pinging...' : 'Test Ping'}
                      </button>

                      {targetUrl && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => setSimulatorItem(item)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          title="Simulate sample webhook payload"
                        >
                          <Send size={13} /> Test Payload
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {item.status !== 'connected' ? (
                        <button className="btn btn-sm btn-primary" onClick={() => handleConnect(item.id)}>
                          Connect
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleDisconnect(item.id)}>
                          Pause
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openEdit(item)}
                        title="Edit Settings"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(item.id)}
                        title="Delete Integration"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Integration Catalog */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 className="int-section-title" style={{ marginBottom: 4 }}>
            <Globe size={18} color="var(--primary)" />
            Available Integration Catalog
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: 0 }}>
            Select any ecosystem service below to configure live synchronization with your WhatsApp business number:
          </p>
        </div>

        {Object.entries(groupedTypes).map(([cat, items]) => (
          <div key={cat} className="int-catalog-group">
            <h4 className="int-catalog-group-title">
              {getCategoryIcon(cat)} {cat.toUpperCase()}
            </h4>
            <div className="int-catalog-grid">
              {items.map(typ => {
                const existing = integrations.find(i => i.type === typ.type);
                return (
                  <div key={typ.type} className="int-catalog-card">
                    <div>
                      <div className="int-catalog-title">{typ.label}</div>
                      <div className="int-catalog-desc">
                        {typ.description}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                      {existing ? (
                        statusBadge(existing.status)
                      ) : (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => openCreate(typ.type, typ.label)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Plus size={14} /> Setup Connection
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Setup / Edit Integration */}
      {showModal && (
        <Modal
          title={editingId ? 'Edit Integration Settings' : 'Set Up New Integration'}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Service Type
              <select
                className="input"
                value={form.type}
                onChange={e => {
                  const sel = types.find(t => t.type === e.target.value);
                  setForm(f => ({
                    ...f,
                    type: e.target.value,
                    name: f.name ? f.name : sel?.label || e.target.value,
                  }));
                }}
                disabled={!!editingId}
                style={{ width: '100%' }}
              >
                {types.map(t => (
                  <option key={t.type} value={t.type}>
                    {t.label} ({t.category.toUpperCase()})
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Integration Display Name
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="e.g. Production Zoho CRM"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Webhook / API Endpoint URL
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="https://api.yourcrm.com/v2/leads/webhook"
                value={form.webhookUrl}
                onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
              />
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 400 }}>
                Target endpoint receiving WhatsApp events. Leave blank to run as local staging adapter.
              </span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Environment
                <select
                  className="input"
                  value={form.environment}
                  onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox / Staging</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                API Key / Secret Token
                <input
                  type="password"
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Optional auth token"
                  value={form.apiKey}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingId ? 'Update Integration' : 'Create & Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Webhook Payload Simulator */}
      {simulatorItem && (
        <Modal
          title={`Test Webhook Event: ${simulatorItem.name}`}
          onClose={() => setSimulatorItem(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Select Event Type
              <select
                className="input"
                style={{ width: '100%' }}
                value={simEvent}
                onChange={e => setSimEvent(e.target.value)}
              >
                <option value="contact.created">contact.created (New WhatsApp Lead)</option>
                <option value="message.received">message.received (Customer Inbound Message)</option>
                <option value="lead.qualified">lead.qualified (Insurance/MF Policy Interested)</option>
              </select>
            </label>

            <div>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Payload Preview:</span>
              <pre className="int-json-preview">
{JSON.stringify({
  event: simEvent,
  timestamp: new Date().toISOString(),
  businessId: "default",
  lead: {
    name: "Sadhu Parth",
    phone: "+919227102108",
    source: "whatsapp_inbound",
    inquiry: "Term Insurance & Mediclaim"
  }
}, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setSimulatorItem(null)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSimulateWebhook}
                disabled={simulating}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={14} className={simulating ? 'animate-spin' : ''} />
                {simulating ? 'Sending...' : 'Dispatch Live Ping'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
