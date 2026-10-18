import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Search, Target, UserPlus, PhoneCall, Send, MessageCircle, Flame } from 'lucide-react';
import { leadApi, type Lead, type LeadInterest, type LeadStatus, type LeadTemperature } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: '#3b82f6' },
  { value: 'qualified', label: 'Qualified', color: '#8b5cf6' },
  { value: 'assigned', label: 'Assigned', color: '#06b6d4' },
  { value: 'contacted', label: 'Contacted', color: '#f59e0b' },
  { value: 'in_progress', label: 'In Progress', color: '#ec4899' },
  { value: 'closed', label: 'Closed', color: '#22c55e' },
  { value: 'unassigned', label: 'Unassigned', color: '#94a3b8' },
];

const statusColor = (status: LeadStatus) => STATUS_OPTIONS.find(s => s.value === status)?.color ?? '#94a3b8';

const TEMPERATURE_OPTIONS: { value: LeadTemperature; label: string; color: string }[] = [
  { value: 'hot', label: '🔥 Hot', color: '#ef4444' },
  { value: 'warm', label: '🌤 Warm', color: '#f59e0b' },
  { value: 'cold', label: '❄ Cold', color: '#64748b' },
];

const INTEREST_OPTIONS: { value: LeadInterest; label: string }[] = [
  { value: 'insurance', label: 'Insurance' },
  { value: 'mutual_fund', label: 'Mutual Fund' },
  { value: 'claim_support', label: 'Claim Support' },
  { value: 'general', label: 'General' },
];

const temperatureColor = (t: LeadTemperature | null) =>
  TEMPERATURE_OPTIONS.find(o => o.value === t)?.color ?? 'var(--text-muted)';

const CLASSIFIED_BY_LABEL: Record<string, string> = { ai: 'AI', rules: 'Keywords', manual: 'Manual' };

const compactSelect = (color: string) => ({
  width: 'auto',
  padding: '4px 8px',
  fontWeight: 600,
  color,
  borderColor: color,
});

const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const leadSource = (lead: Lead) =>
  lead.metadata?.source === 'whatsapp_inbound' ? 'WhatsApp message' : lead.selectedService.replace(/_/g, ' ');

function StatTile({ label, value, icon, color }: { label: string; value: number; icon: ReactNode; color: string }) {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg-secondary)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `${color}26`,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function FollowupCell({ lead }: { lead: Lead }) {
  if (lead.followupRepliedAt) {
    return <span style={{ color: '#22c55e', fontWeight: 600 }}>Replied {formatDate(lead.followupRepliedAt)}</span>;
  }
  if (lead.followupSentAt) {
    return <span>Sent {formatDate(lead.followupSentAt)}</span>;
  }
  return <span style={{ color: 'var(--text-muted)' }}>Not sent yet</span>;
}

const cellStyle = { padding: '12px 14px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const };
const headStyle = {
  ...cellStyle,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
  background: 'var(--bg-secondary)',
};

export function Leads() {
  const { t } = useTranslation();
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [temperatureFilter, setTemperatureFilter] = useState<LeadTemperature | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    leadApi
      .list()
      .then(setLeads)
      .catch(() => {
        setLeads([]);
        toast.error('Failed to load leads');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeStatus = async (lead: Lead, status: LeadStatus) => {
    setSavingId(lead.id);
    try {
      const updated = await leadApi.updateStatus(lead.id, status);
      setLeads(prev => prev.map(l => (l.id === lead.id ? { ...l, ...updated } : l)));
      toast.success(`${lead.leadNumber} marked ${STATUS_OPTIONS.find(s => s.value === status)?.label ?? status}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update lead');
    } finally {
      setSavingId(null);
    }
  };

  const changeClassification = async (
    lead: Lead,
    change: { temperature?: LeadTemperature; interest?: LeadInterest },
  ) => {
    setSavingId(lead.id);
    try {
      const updated = await leadApi.updateClassification(lead.id, change);
      setLeads(prev => prev.map(l => (l.id === lead.id ? { ...l, ...updated } : l)));
      toast.success(`${lead.leadNumber} updated`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update lead');
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (temperatureFilter !== 'all' && l.temperature !== temperatureFilter) return false;
      if (!q) return true;
      return (
        l.leadNumber.toLowerCase().includes(q) ||
        l.customerPhone.includes(q) ||
        (l.customerName ?? '').toLowerCase().includes(q)
      );
    });
  }, [leads, search, statusFilter, temperatureFilter]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayCount = leads.filter(l => new Date(l.createdAt) >= startOfToday).length;
  const hotCount = leads.filter(l => l.temperature === 'hot').length;
  const contactedCount = leads.filter(l => l.status === 'contacted' || l.status === 'in_progress').length;
  const followupCount = leads.filter(l => l.followupSentAt).length;

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 32px)', maxWidth: 1240, margin: '0 auto' }}>
      <PageHeader
        title={t('leads.title', 'Leads')}
        subtitle={t('leads.subtitle', 'Everyone who messages you on WhatsApp is saved here as a lead')}
        icon={<Target size={24} />}
        action={{
          label: 'Refresh',
          onClick: load,
          icon: <RefreshCw size={16} />,
        }}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          margin: '16px 0 24px',
        }}
      >
        <StatTile label="New today" value={todayCount} icon={<UserPlus size={22} />} color="#3b82f6" />
        <StatTile label="Hot leads" value={hotCount} icon={<Flame size={22} />} color="#ef4444" />
        <StatTile label="Contacted" value={contactedCount} icon={<PhoneCall size={22} />} color="#f59e0b" />
        <StatTile label="Follow-up sent" value={followupCount} icon={<Send size={22} />} color="#22c55e" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            className="input"
            placeholder="Search name, phone or lead number"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }}
          />
        </div>
        <select
          className="input"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as LeadStatus | 'all')}
          style={{ width: 'auto' }}
          aria-label="Filter by status"
        >
          <option value="all">All statuses ({leads.length})</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>
              {s.label} ({leads.filter(l => l.status === s.value).length})
            </option>
          ))}
        </select>
        <select
          className="input"
          value={temperatureFilter}
          onChange={e => setTemperatureFilter(e.target.value as LeadTemperature | 'all')}
          style={{ width: 'auto' }}
          aria-label="Filter by temperature"
        >
          <option value="all">Hot, warm and cold</option>
          {TEMPERATURE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label} ({leads.filter(l => l.temperature === o.value).length})
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border)',
            borderRadius: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <Target size={32} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {leads.length === 0 ? 'No leads yet' : 'No leads match this filter'}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {leads.length === 0
              ? 'A lead is created automatically when someone sends you a personal WhatsApp message.'
              : 'Try a different search or status.'}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 1040 }}>
            <thead>
              <tr>
                <th style={headStyle}>Lead</th>
                <th style={headStyle}>Customer</th>
                <th style={headStyle}>Temperature</th>
                <th style={headStyle}>Interest &amp; first message</th>
                <th style={headStyle}>Received</th>
                <th style={headStyle}>Morning follow-up</th>
                <th style={headStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id}>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {lead.leadNumber}
                  </td>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 600 }}>{lead.customerName || 'Unknown'}</div>
                    {lead.customerPhone ? (
                      <a
                        href={`https://wa.me/${lead.customerPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12.5,
                          color: '#22c55e',
                        }}
                      >
                        <MessageCircle size={13} /> +{lead.customerPhone}
                      </a>
                    ) : (
                      <span
                        style={{ fontSize: 12.5, color: 'var(--text-muted)' }}
                        title="WhatsApp hid this contact's number (privacy ID). Reply from Chats to reach them."
                      >
                        Number hidden by WhatsApp
                      </span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    <select
                      className="input"
                      value={lead.temperature ?? ''}
                      disabled={savingId === lead.id}
                      onChange={e =>
                        void changeClassification(lead, { temperature: e.target.value as LeadTemperature })
                      }
                      aria-label={`Temperature of ${lead.leadNumber}`}
                      title={lead.classificationReason ?? undefined}
                      style={compactSelect(temperatureColor(lead.temperature))}
                    >
                      {!lead.temperature && (
                        <option value="" disabled>
                          Not classified
                        </option>
                      )}
                      {TEMPERATURE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {lead.classifiedBy && (
                      <div
                        style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}
                        title={lead.classificationReason ?? undefined}
                      >
                        by {CLASSIFIED_BY_LABEL[lead.classifiedBy] ?? lead.classifiedBy}
                        {lead.classificationReason ? ` · ${lead.classificationReason}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ ...cellStyle, maxWidth: 280 }}>
                    <select
                      className="input"
                      value={lead.interest ?? ''}
                      disabled={savingId === lead.id}
                      onChange={e => void changeClassification(lead, { interest: e.target.value as LeadInterest })}
                      aria-label={`Interest of ${lead.leadNumber}`}
                      style={{ width: 'auto', padding: '4px 8px' }}
                    >
                      {!lead.interest && (
                        <option value="" disabled>
                          {leadSource(lead)}
                        </option>
                      )}
                      {INTEREST_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {lead.firstMessage && (
                      <div
                        title={lead.firstMessage}
                        style={{
                          fontSize: 12.5,
                          color: 'var(--text-secondary)',
                          marginTop: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        &ldquo;{lead.firstMessage}&rdquo;
                      </div>
                    )}
                  </td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{formatDate(lead.createdAt)}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                    <FollowupCell lead={lead} />
                  </td>
                  <td style={cellStyle}>
                    <select
                      className="input"
                      value={lead.status}
                      disabled={savingId === lead.id}
                      onChange={e => void changeStatus(lead, e.target.value as LeadStatus)}
                      aria-label={`Status of ${lead.leadNumber}`}
                      style={compactSelect(statusColor(lead.status))}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
