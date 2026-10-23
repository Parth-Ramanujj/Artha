import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import './RolesManagement.css';

interface RolePermission {
  id: string;
  category: string;
  name: string;
  description: string;
  admin: boolean;
  manager: boolean;
  agent: boolean;
  marketing: boolean;
  auditor: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'agent' | 'marketing' | 'auditor';
  status: 'active' | 'invited';
  assignedNumber?: string;
  lastActive: string;
}

const INITIAL_PERMISSIONS: RolePermission[] = [
  // Messaging & Inbox
  {
    id: 'msg_view_all',
    category: 'Messaging & Shared Inbox',
    name: 'View All Conversations',
    description: 'Can inspect any customer chat across all WhatsApp numbers',
    admin: true,
    manager: true,
    agent: false,
    marketing: false,
    auditor: true,
  },
  {
    id: 'msg_view_assigned',
    category: 'Messaging & Shared Inbox',
    name: 'View Assigned Conversations Only',
    description: 'Restricted strictly to conversations assigned to this agent',
    admin: true,
    manager: true,
    agent: true,
    marketing: false,
    auditor: false,
  },
  {
    id: 'msg_send',
    category: 'Messaging & Shared Inbox',
    name: 'Send Messages & Media',
    description: 'Can compose text, media, documents, and voice notes',
    admin: true,
    manager: true,
    agent: true,
    marketing: false,
    auditor: false,
  },
  {
    id: 'msg_delete',
    category: 'Messaging & Shared Inbox',
    name: 'Revoke / Delete Messages',
    description: 'Can delete sent messages from the chat timeline',
    admin: true,
    manager: true,
    agent: false,
    marketing: false,
    auditor: false,
  },

  // AI & Copilot
  {
    id: 'ai_copilot_use',
    category: 'AI & Copilot',
    name: 'Use Shared Inbox AI Copilot',
    description: 'Access summarization, smart suggested replies, and tone rewriter',
    admin: true,
    manager: true,
    agent: true,
    marketing: true,
    auditor: false,
  },
  {
    id: 'ai_prompts_edit',
    category: 'AI & Copilot',
    name: 'Edit AI System Prompts & Knowledge Base',
    description: 'Modify chatbot training documents and agent instructions',
    admin: true,
    manager: true,
    agent: false,
    marketing: false,
    auditor: false,
  },
  {
    id: 'ai_agents_build',
    category: 'AI & Copilot',
    name: 'Build Autonomous AI Agents',
    description: 'Create new Astra bots and connect external Webhook agents',
    admin: true,
    manager: false,
    agent: false,
    marketing: false,
    auditor: false,
  },
  {
    id: 'ai_credits_spend',
    category: 'AI & Copilot',
    name: 'Consume AI Wallet Credits',
    description: 'Perform AI generations that deduct from the 20k credit pool',
    admin: true,
    manager: true,
    agent: true,
    marketing: true,
    auditor: false,
  },

  // Campaigns & Broadcasts
  {
    id: 'camp_create',
    category: 'Campaigns & Marketing',
    name: 'Create Broadcast Campaigns',
    description: 'Draft bulk promotional messages to contact segments',
    admin: true,
    manager: true,
    agent: false,
    marketing: true,
    auditor: false,
  },
  {
    id: 'camp_approve',
    category: 'Campaigns & Marketing',
    name: 'Approve & Dispatch High-Volume Campaigns',
    description: 'Permission to trigger broadcasts exceeding 10,000 recipients',
    admin: true,
    manager: true,
    agent: false,
    marketing: false,
    auditor: false,
  },

  // Security & Financials
  {
    id: 'sec_roi_view',
    category: 'Security & Governance',
    name: 'View Financial ROI & Pricing Tiers',
    description: 'Inspect broadcast billing costs, revenue attribution, and margins',
    admin: true,
    manager: true,
    agent: false,
    marketing: false,
    auditor: true,
  },
  {
    id: 'sec_api_keys',
    category: 'Security & Governance',
    name: 'Manage API Keys & Webhook Secrets',
    description: 'Generate developer credentials and configure integrations',
    admin: true,
    manager: false,
    agent: false,
    marketing: false,
    auditor: false,
  },
];

const INITIAL_MEMBERS: TeamMember[] = [
  {
    id: 'mem-1',
    name: 'Parth Ramanuj (Owner)',
    email: 'parth@openwa.local',
    role: 'admin',
    status: 'active',
    lastActive: 'Just now',
  },
  {
    id: 'mem-2',
    name: 'Amit Shah (Sales Lead)',
    email: 'amit@openwa.local',
    role: 'manager',
    status: 'active',
    assignedNumber: '+91 98765 43210',
    lastActive: '12 mins ago',
  },
  {
    id: 'mem-3',
    name: 'Pooja Verma (Support Rep)',
    email: 'pooja@openwa.local',
    role: 'agent',
    status: 'active',
    assignedNumber: '+91 91234 56789',
    lastActive: '1 hour ago',
  },
  {
    id: 'mem-4',
    name: 'Rohan Mehta (Growth Marketer)',
    email: 'rohan@openwa.local',
    role: 'marketing',
    status: 'active',
    lastActive: '3 hours ago',
  },
  {
    id: 'mem-5',
    name: 'Kavita Patel (Compliance)',
    email: 'kavita@openwa.local',
    role: 'auditor',
    status: 'active',
    lastActive: 'Yesterday',
  },
];

const STORAGE_KEY_PERMS = 'openwa_rbac_permissions';
const STORAGE_KEY_MEMBERS = 'openwa_team_members';

export function RolesManagement() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'matrix' | 'members'>('matrix');

  const [permissions, setPermissions] = useState<RolePermission[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PERMS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_PERMISSIONS;
  });

  const [members, setMembers] = useState<TeamMember[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MEMBERS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_MEMBERS;
  });

  // Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    role: 'agent' as TeamMember['role'],
    assignedNumber: '',
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PERMS, JSON.stringify(permissions));
  }, [permissions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members));
  }, [members]);

  // Toggle Permission Checkbox
  const handleTogglePermission = (
    permId: string,
    roleKey: 'admin' | 'manager' | 'agent' | 'marketing' | 'auditor'
  ) => {
    setPermissions(prev =>
      prev.map(p => (p.id === permId ? { ...p, [roleKey]: !p[roleKey] } : p))
    );
  };

  // Group permissions by category
  const categories = Array.from(new Set(permissions.map(p => p.category)));

  // Save Permissions
  const handleSaveMatrix = () => {
    localStorage.setItem(STORAGE_KEY_PERMS, JSON.stringify(permissions));
    toast.addToast({ type: 'success', title: 'Role permissions matrix saved successfully' });
  };

  // Invite Member
  const handleInviteSubmit = () => {
    if (!newMember.name || !newMember.email) {
      toast.addToast({ type: 'warning', title: 'Name and email are required' });
      return;
    }

    const created: TeamMember = {
      id: `mem-${Date.now()}`,
      name: newMember.name,
      email: newMember.email,
      role: newMember.role,
      status: 'invited',
      assignedNumber: newMember.assignedNumber || undefined,
      lastActive: 'Invitation Pending',
    };

    setMembers(prev => [...prev, created]);
    setIsInviteModalOpen(false);
    setNewMember({ name: '', email: '', role: 'agent', assignedNumber: '' });
    toast.addToast({ type: 'success', title: `Invitation email sent to ${created.email}` });
  };

  return (
    <div className="roles-page" data-testid="roles-page">
      <PageHeader
        title="Role-Based Access Control (RBAC)"
        subtitle="Manage custom department roles, granular permission matrices, and team member assignments"
      />

      {/* Tabs */}
      <div className="roles-tabs">
        <button
          className={`roles-tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          <ShieldCheck size={16} />
          Permissions Matrix
        </button>
        <button
          className={`roles-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <Users size={16} />
          Team Members ({members.length})
        </button>
      </div>

      {/* Tab 1: Permissions Matrix */}
      {activeTab === 'matrix' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Define exactly what each role can view, edit, or execute across OpenWA.
            </p>
            <button className="btn-primary" onClick={handleSaveMatrix}>
              Save Permissions Matrix
            </button>
          </div>

          <div className="matrix-table-container">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Permission & Action</th>
                  <th style={{ textAlign: 'center' }}>Super Admin</th>
                  <th style={{ textAlign: 'center' }}>Team Manager</th>
                  <th style={{ textAlign: 'center' }}>Support Agent</th>
                  <th style={{ textAlign: 'center' }}>Marketing Rep</th>
                  <th style={{ textAlign: 'center' }}>Auditor</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(category => (
                  <>
                    <tr key={`cat-${category}`} className="permission-category-row">
                      <td colSpan={6}>{category}</td>
                    </tr>
                    {permissions
                      .filter(p => p.category === category)
                      .map(p => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {p.description}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              className="matrix-checkbox"
                              checked={p.admin}
                              onChange={() => handleTogglePermission(p.id, 'admin')}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              className="matrix-checkbox"
                              checked={p.manager}
                              onChange={() => handleTogglePermission(p.id, 'manager')}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              className="matrix-checkbox"
                              checked={p.agent}
                              onChange={() => handleTogglePermission(p.id, 'agent')}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              className="matrix-checkbox"
                              checked={p.marketing}
                              onChange={() => handleTogglePermission(p.id, 'marketing')}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              className="matrix-checkbox"
                              checked={p.auditor}
                              onChange={() => handleTogglePermission(p.id, 'auditor')}
                            />
                          </td>
                        </tr>
                      ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tab 2: Team Members */}
      {activeTab === 'members' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Assign roles and permissions to your team members and support representatives.
            </p>
            <button className="btn-primary" onClick={() => setIsInviteModalOpen(true)}>
              <Plus size={16} />
              Invite Team Member
            </button>
          </div>

          <div className="matrix-table-container">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th>Email</th>
                  <th>Assigned Role</th>
                  <th>WhatsApp Channel</th>
                  <th>Status</th>
                  <th>Last Active</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td>{m.email}</td>
                    <td>
                      <span
                        style={{
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          fontSize: '0.6875rem',
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(99, 102, 241, 0.1)',
                          color: '#6366f1',
                        }}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td>{m.assignedNumber || 'All Channels'}</td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: m.status === 'active' ? '#10b981' : '#f59e0b',
                        }}
                      >
                        {m.status === 'active' ? 'Active' : 'Invited'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {m.lastActive}
                    </td>
                    <td>
                      <button
                        className="deal-delete-btn"
                        onClick={() => {
                          setMembers(prev => prev.filter(x => x.id !== m.id));
                          toast.addToast({ type: 'info', title: `Removed ${m.name}` });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <Modal
          open
          title="Invite New Team Member"
          onClose={() => setIsInviteModalOpen(false)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
              <button className="btn-secondary" onClick={() => setIsInviteModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleInviteSubmit}>
                Send Invitation
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Full Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Diya Patel"
                value={newMember.name}
                onChange={e => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Email Address *
              </label>
              <input
                type="email"
                placeholder="e.g. diya@company.com"
                value={newMember.email}
                onChange={e => setNewMember(prev => ({ ...prev, email: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Role
              </label>
              <select
                value={newMember.role}
                onChange={e => setNewMember(prev => ({ ...prev, role: e.target.value as TeamMember['role'] }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                <option value="admin">Super Admin / Owner</option>
                <option value="manager">Team Manager</option>
                <option value="agent">Customer Support Agent</option>
                <option value="marketing">Marketing Specialist</option>
                <option value="auditor">Compliance Auditor</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Assigned WhatsApp Channel (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. +91 98765 43210"
                value={newMember.assignedNumber}
                onChange={e => setNewMember(prev => ({ ...prev, assignedNumber: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default RolesManagement;
