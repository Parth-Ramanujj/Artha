import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  DollarSign,
  Plus,
  Search,
  Users,
  Download,
  Phone,
  Trash2,
  BarChart2,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { dealsApi } from '../services/api';
import './SalesPipeline.css';

export interface Deal {
  id: string;
  title: string;
  contactName: string;
  phone: string;
  company?: string;
  amount: number;
  stage: 'lead' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  expectedClose: string;
  notes?: string;
  createdAt: string;
}

const STAGES = [
  { id: 'lead', label: 'New Leads', icon: '📥', color: '#6366f1' },
  { id: 'contacted', label: 'Contacted', icon: '📞', color: '#3b82f6' },
  { id: 'qualified', label: 'Qualified', icon: '🎯', color: '#06b6d4' },
  { id: 'proposal', label: 'Proposal Sent', icon: '📄', color: '#8b5cf6' },
  { id: 'negotiation', label: 'Negotiation', icon: '🤝', color: '#f59e0b' },
  { id: 'won', label: 'Closed Won', icon: '🏆', color: '#10b981' },
  { id: 'lost', label: 'Closed Lost', icon: '❌', color: '#ef4444' },
] as const;

const INITIAL_DEALS: Deal[] = [
  {
    id: 'deal-1',
    title: 'Enterprise WhatsApp Solution - 50k msgs',
    contactName: 'Rajesh Patel',
    phone: '919876543210',
    company: 'Patel Logistics Ltd.',
    amount: 145000,
    stage: 'negotiation',
    priority: 'high',
    assignee: 'Amit Shah',
    expectedClose: '2026-10-25',
    notes: 'Interested in volume discounts and Salesforce CRM integration.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'deal-2',
    title: 'Shopify Store Cart Recovery Setup',
    contactName: 'Ananya Sharma',
    phone: '919822334455',
    company: 'Fabrics of India',
    amount: 68000,
    stage: 'proposal',
    priority: 'high',
    assignee: 'Pooja Verma',
    expectedClose: '2026-10-20',
    notes: 'Requested automated cart recovery sequence with 10% coupon.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'deal-3',
    title: 'B2B Wholesale Catalog Inquiry',
    contactName: 'Vikram Joshi',
    phone: '919711223344',
    company: 'Joshi Agro Seeds',
    amount: 220000,
    stage: 'qualified',
    priority: 'medium',
    assignee: 'Amit Shah',
    expectedClose: '2026-11-02',
    notes: 'Needs multi-agent routing for 3 branch offices.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'deal-4',
    title: 'Autonomous AI Support Bot Trial',
    contactName: 'Devang Mehta',
    phone: '919988776655',
    company: 'Mehta Healthcare',
    amount: 95000,
    stage: 'won',
    priority: 'high',
    assignee: 'Sneha Roy',
    expectedClose: '2026-10-14',
    notes: 'Signed 1-year contract with Voice AI Engine add-on.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'deal-5',
    title: 'Inbound Website Chat Lead',
    contactName: 'Deepak Vora',
    phone: '919898001122',
    company: 'Vora Diamonds',
    amount: 45000,
    stage: 'lead',
    priority: 'low',
    assignee: 'Pooja Verma',
    expectedClose: '2026-10-30',
    notes: 'Captured via web WhatsApp widget.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'deal-6',
    title: 'Broadcast Marketing Pack 20k msgs',
    contactName: 'Kunal Singhal',
    phone: '919811224466',
    company: 'Singhal Sweets',
    amount: 32000,
    stage: 'contacted',
    priority: 'medium',
    assignee: 'Amit Shah',
    expectedClose: '2026-10-28',
    notes: 'Festival Diwali promo broadcast.',
    createdAt: new Date().toISOString(),
  },
];

const STORAGE_KEY = 'openwa_sales_pipeline_deals';

export function SalesPipeline() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [deals, setDeals] = useState<Deal[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_DEALS;
  });

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newDeal, setNewDeal] = useState<Partial<Deal>>({
    title: '',
    contactName: '',
    phone: '',
    company: '',
    amount: 50000,
    stage: 'lead',
    priority: 'medium',
    assignee: 'Amit Shah',
    expectedClose: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    notes: '',
  });

  // Load from backend dealsApi on mount, falling back to localStorage
  useEffect(() => {
    let isMounted = true;
    dealsApi.list().then(serverDeals => {
      if (isMounted && serverDeals && serverDeals.length > 0) {
        setDeals(serverDeals.map(d => ({
          id: d.id,
          title: d.title,
          contactName: d.contactName,
          phone: d.contactPhone,
          company: '',
          amount: d.amount,
          stage: d.stage as Deal['stage'],
          priority: d.priority as Deal['priority'],
          assignee: d.assignedTo,
          expectedClose: new Date().toISOString().split('T')[0],
          notes: d.notes || '',
          createdAt: d.createdAt,
        })));
      }
    }).catch(() => {
      // offline / fallback
    });
    return () => { isMounted = false; };
  }, []);

  // Save to localStorage as backup
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }, [deals]);

  // Handle URL params when coming from Chats (AI Copilot)
  useEffect(() => {
    const contactParam = searchParams.get('newDealContact');
    const phoneParam = searchParams.get('phone');
    if (contactParam || phoneParam) {
      setNewDeal(prev => ({
        ...prev,
        title: `Deal with ${contactParam || 'Client'}`,
        contactName: contactParam || '',
        phone: phoneParam || '',
      }));
      setIsModalOpen(true);
    }
  }, [searchParams]);

  // Calculations
  const formatAmount = (amt: number) => {
    if (currency === 'INR') {
      return `₹${amt.toLocaleString('en-IN')}`;
    }
    return `$${Math.round(amt / 85).toLocaleString('en-US')}`;
  };

  const totalPipelineValue = useMemo(() => {
    return deals.filter(d => d.stage !== 'lost').reduce((acc, curr) => acc + curr.amount, 0);
  }, [deals]);

  const wonValue = useMemo(() => {
    return deals.filter(d => d.stage === 'won').reduce((acc, curr) => acc + curr.amount, 0);
  }, [deals]);

  const activeDealsCount = useMemo(() => {
    return deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;
  }, [deals]);

  const winRate = useMemo(() => {
    const closed = deals.filter(d => d.stage === 'won' || d.stage === 'lost').length;
    if (closed === 0) return 65;
    const wonCount = deals.filter(d => d.stage === 'won').length;
    return Math.round((wonCount / closed) * 100);
  }, [deals]);

  // Filtered Deals
  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      const matchSearch =
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.phone.includes(searchQuery) ||
        (d.company && d.company.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchAssignee = assigneeFilter === 'all' || d.assignee === assigneeFilter;
      const matchPriority = priorityFilter === 'all' || d.priority === priorityFilter;

      return matchSearch && matchAssignee && matchPriority;
    });
  }, [deals, searchQuery, assigneeFilter, priorityFilter]);

  // Move deal to new stage
  const handleMoveStage = (dealId: string, newStage: Deal['stage']) => {
    setDeals(prev =>
      prev.map(deal => (deal.id === dealId ? { ...deal, stage: newStage } : deal))
    );
    dealsApi.update(dealId, { stage: newStage }).catch(() => {
      // synced locally
    });
    toast.addToast({
      type: 'success',
      title: `Deal moved to ${STAGES.find(s => s.id === newStage)?.label}`,
    });
  };

  // Delete Deal
  const handleDeleteDeal = (dealId: string) => {
    setDeals(prev => prev.filter(d => d.id !== dealId));
    dealsApi.delete(dealId).catch(() => {
      // deleted locally
    });
    toast.addToast({ type: 'info', title: 'Deal removed from pipeline' });
  };

  // Add Deal Submit
  const handleSaveDeal = async () => {
    if (!newDeal.title || !newDeal.contactName) {
      toast.addToast({ type: 'warning', title: 'Please provide Deal Title and Contact Name' });
      return;
    }

    const payload = {
      title: newDeal.title!,
      contactName: newDeal.contactName!,
      contactPhone: newDeal.phone || '',
      amount: Number(newDeal.amount) || 0,
      stage: (newDeal.stage || 'lead') as any,
      priority: (newDeal.priority || 'medium') as any,
      assignedTo: newDeal.assignee || 'Amit Shah',
      notes: newDeal.notes || '',
    };

    let serverId = `deal-${Date.now()}`;
    try {
      const created = await dealsApi.create(payload);
      if (created?.id) serverId = created.id;
    } catch {
      // Saved in local storage fallback
    }

    const createdDeal: Deal = {
      id: serverId,
      title: newDeal.title!,
      contactName: newDeal.contactName!,
      phone: newDeal.phone || '',
      company: newDeal.company || '',
      amount: Number(newDeal.amount) || 0,
      stage: newDeal.stage || 'lead',
      priority: newDeal.priority || 'medium',
      assignee: newDeal.assignee || 'Amit Shah',
      expectedClose: newDeal.expectedClose || new Date().toISOString().split('T')[0],
      notes: newDeal.notes || '',
      createdAt: new Date().toISOString(),
    };

    setDeals(prev => [createdDeal, ...prev]);
    setIsModalOpen(false);
    toast.addToast({ type: 'success', title: 'New deal created and synchronized' });
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['ID,Title,Contact,Phone,Company,Amount,Stage,Priority,Assignee,ExpectedClose'];
    const rows = deals.map(
      d =>
        `"${d.id}","${d.title}","${d.contactName}","${d.phone}","${d.company || ''}",${d.amount},"${d.stage}","${d.priority}","${d.assignee}","${d.expectedClose}"`
    );
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_pipeline_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.addToast({ type: 'success', title: 'Pipeline exported as CSV' });
  };

  return (
    <div className="sales-pipeline-page" data-testid="sales-pipeline-page">
      <PageHeader
        title="Sales Pipeline Management"
        subtitle="Manage leads, visual deal stages, revenue forecasts, and WhatsApp CRM closing"
      />

      {/* KPI Cards */}
      <div className="pipeline-kpis">
        <div className="pipeline-kpi-card">
          <div className="kpi-icon-box purple">
            <TrendingUp />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Total Pipeline Value</span>
            <span className="kpi-value">{formatAmount(totalPipelineValue)}</span>
            <span className="kpi-subtitle">Active Weighted Revenue</span>
          </div>
        </div>

        <div className="pipeline-kpi-card">
          <div className="kpi-icon-box green">
            <DollarSign />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Closed Won Revenue</span>
            <span className="kpi-value">{formatAmount(wonValue)}</span>
            <span className="kpi-subtitle">{winRate}% Overall Win Rate</span>
          </div>
        </div>

        <div className="pipeline-kpi-card">
          <div className="kpi-icon-box blue">
            <Users />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Active Deals</span>
            <span className="kpi-value">{activeDealsCount} Deals</span>
            <span className="kpi-subtitle">Across 5 Live Stages</span>
          </div>
        </div>

        <div className="pipeline-kpi-card">
          <div className="kpi-icon-box orange">
            <BarChart2 />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Avg Deal Size</span>
            <span className="kpi-value">
              {formatAmount(deals.length > 0 ? Math.round(totalPipelineValue / deals.length) : 0)}
            </span>
            <span className="kpi-subtitle">High Value B2B Accounts</span>
          </div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="pipeline-controls">
        <div className="pipeline-filters-left">
          <div className="search-input-box">
            <Search size={16} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search deals, contacts, or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="pipeline-select"
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All Sales Agents</option>
            <option value="Amit Shah">Amit Shah</option>
            <option value="Pooja Verma">Pooja Verma</option>
            <option value="Sneha Roy">Sneha Roy</option>
          </select>

          <select
            className="pipeline-select"
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          <button
            type="button"
            className="pipeline-select"
            style={{ cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setCurrency(currency === 'INR' ? 'USD' : 'INR')}
          >
            Currency: {currency}
          </button>
        </div>

        <div className="pipeline-actions-right">
          <button className="btn-secondary" onClick={handleExportCsv} title="Export CSV">
            <Download size={15} />
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            Create Deal
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="kanban-board-container">
        <div className="kanban-board">
          {STAGES.map(stage => {
            const stageDeals = filteredDeals.filter(d => d.stage === stage.id);
            const stageTotal = stageDeals.reduce((sum, d) => sum + d.amount, 0);

            return (
              <div key={stage.id} className="kanban-column" data-stage={stage.id}>
                <div className="kanban-column-header">
                  <div className="column-header-title">
                    <span>{stage.icon}</span>
                    <span>{stage.label}</span>
                    <span className="column-count-badge">{stageDeals.length}</span>
                  </div>
                  <span className="column-total-value">{formatAmount(stageTotal)}</span>
                </div>

                <div className="kanban-cards-list">
                  {stageDeals.map(deal => (
                    <div key={deal.id} className="deal-card">
                      <div className="deal-card-top">
                        <h4 className="deal-title">{deal.title}</h4>
                        <span className={`deal-priority-badge ${deal.priority}`}>
                          {deal.priority}
                        </span>
                      </div>

                      <div className="deal-contact-row">
                        <div className="deal-contact-info">
                          <Users size={13} />
                          <span>{deal.contactName}</span>
                          {deal.company && <small>({deal.company})</small>}
                        </div>
                        {deal.phone && (
                          <button
                            type="button"
                            className="deal-whatsapp-btn"
                            onClick={() => navigate(`/chats?phone=${deal.phone}`)}
                            title="Open WhatsApp Chat"
                          >
                            <Phone size={11} />
                            WhatsApp
                          </button>
                        )}
                      </div>

                      <div className="deal-value-row">
                        <span className="deal-amount">{formatAmount(deal.amount)}</span>
                        <div className="deal-assignee">
                          <span className="assignee-avatar">{deal.assignee.charAt(0)}</span>
                          <span>{deal.assignee}</span>
                        </div>
                      </div>

                      <div className="deal-card-footer">
                        <select
                          className="deal-move-select"
                          value={deal.stage}
                          onChange={e => handleMoveStage(deal.id, e.target.value as Deal['stage'])}
                        >
                          {STAGES.map(s => (
                            <option key={s.id} value={s.id}>
                              Move: {s.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="deal-delete-btn"
                          onClick={() => handleDeleteDeal(deal.id)}
                          title="Delete Deal"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {stageDeals.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      No deals in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Deal Modal */}
      {isModalOpen && (
        <Modal
          open
          title="Create New Sales Deal"
          onClose={() => setIsModalOpen(false)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveDeal}>
                Create Deal
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Deal Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Enterprise WhatsApp Annual Subscription"
                value={newDeal.title || ''}
                onChange={e => setNewDeal(prev => ({ ...prev, title: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Contact Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Patel"
                  value={newDeal.contactName || ''}
                  onChange={e => setNewDeal(prev => ({ ...prev, contactName: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  WhatsApp Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. 919876543210"
                  value={newDeal.phone || ''}
                  onChange={e => setNewDeal(prev => ({ ...prev, phone: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={newDeal.company || ''}
                  onChange={e => setNewDeal(prev => ({ ...prev, company: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Deal Amount ({currency}) *
                </label>
                <input
                  type="number"
                  placeholder="50000"
                  value={newDeal.amount || 0}
                  onChange={e => setNewDeal(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Pipeline Stage
                </label>
                <select
                  value={newDeal.stage || 'lead'}
                  onChange={e => setNewDeal(prev => ({ ...prev, stage: e.target.value as Deal['stage'] }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                >
                  {STAGES.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Priority
                </label>
                <select
                  value={newDeal.priority || 'medium'}
                  onChange={e => setNewDeal(prev => ({ ...prev, priority: e.target.value as Deal['priority'] }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                Notes / Requirements
              </label>
              <textarea
                rows={3}
                placeholder="Key requirements discussed with customer on WhatsApp..."
                value={newDeal.notes || ''}
                onChange={e => setNewDeal(prev => ({ ...prev, notes: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default SalesPipeline;
