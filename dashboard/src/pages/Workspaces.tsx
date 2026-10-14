import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  Plus,
  Users,
  Shield,
  Trash2,
  Edit,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { businessApi, apiKeyApi, type Business, type BusinessMembership, type ApiKey } from '../services/api';
import './Workspaces.css';

export function Workspaces() {
  useDocumentTitle('Workspaces | Artha');
  const toast = useToast();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formPlan, setFormPlan] = useState<'starter' | 'growth' | 'enterprise'>('growth');
  const [formMaxSessions, setFormMaxSessions] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  // Members state
  const [members, setMembers] = useState<BusinessMembership[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'owner' | 'admin' | 'agent' | 'viewer'>('agent');
  const [addingMember, setAddingMember] = useState(false);

  const fetchBusinesses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await businessApi.list();
      setBusinesses(data);
    } catch (err) {
      toast.error('Failed to load workspaces', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchBusinesses();
  }, [fetchBusinesses]);

  const filteredBusinesses = useMemo(() => {
    if (!search.trim()) return businesses;
    const term = search.toLowerCase();
    return businesses.filter(b => b.name.toLowerCase().includes(term) || b.slug.toLowerCase().includes(term));
  }, [businesses, search]);

  const handleOpenCreate = () => {
    setFormName('');
    setFormSlug('');
    setFormPlan('growth');
    setFormMaxSessions(5);
    setCreateModalOpen(true);
  };

  const handleOpenEdit = (b: Business) => {
    setSelectedBusiness(b);
    setFormName(b.name);
    setFormSlug(b.slug);
    setFormPlan(b.plan as 'starter' | 'growth' | 'enterprise');
    setFormMaxSessions(b.settings?.maxSessions ? Number(b.settings.maxSessions) : 5);
    setEditModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawName = formName.trim();
    if (!rawName) return;

    try {
      setSubmitting(true);
      const cleanSlug = formSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      await businessApi.create({
        name: rawName,
        slug: cleanSlug || undefined,
        plan: formPlan,
        settings: { maxSessions: formMaxSessions },
      });
      toast.success('Workspace created', `Workspace "${rawName}" created successfully.`);
      setCreateModalOpen(false);
      await fetchBusinesses();
    } catch (err) {
      toast.error('Failed to create workspace', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    const rawName = formName.trim();
    if (!rawName) return;

    try {
      setSubmitting(true);
      const cleanSlug = formSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      await businessApi.update(selectedBusiness.id, {
        name: rawName,
        slug: cleanSlug || undefined,
        plan: formPlan,
        settings: { ...selectedBusiness.settings, maxSessions: formMaxSessions },
      });
      toast.success('Workspace updated', 'Changes have been saved.');
      setEditModalOpen(false);
      await fetchBusinesses();
    } catch (err) {
      toast.error('Failed to update workspace', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (b: Business) => {
    if (!window.confirm(`Are you sure you want to delete workspace "${b.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await businessApi.delete(b.id);
      toast.success('Workspace deleted', `Workspace "${b.name}" has been removed.`);
      await fetchBusinesses();
    } catch (err) {
      toast.error('Failed to delete workspace', err instanceof Error ? err.message : undefined);
    }
  };

  const handleOpenMembers = async (b: Business) => {
    setSelectedBusiness(b);
    setMembersModalOpen(true);
    setLoadingMembers(true);
    try {
      const [membersData, keysData] = await Promise.all([
        businessApi.getMemberships(b.id),
        apiKeyApi.list().catch(() => []),
      ]);
      setMembers(membersData);
      setApiKeys(keysData);
      if (keysData.length > 0) {
        setSelectedApiKeyId(keysData[0].id);
      }
    } catch (err) {
      toast.error('Failed to load memberships', err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness || !selectedApiKeyId) return;

    try {
      setAddingMember(true);
      await businessApi.addMembership(selectedBusiness.id, {
        apiKeyId: selectedApiKeyId,
        role: selectedRole,
      });
      toast.success('Member added', 'API Key added to workspace.');
      const updated = await businessApi.getMemberships(selectedBusiness.id);
      setMembers(updated);
    } catch (err) {
      toast.error('Failed to add member', err instanceof Error ? err.message : undefined);
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!selectedBusiness) return;
    try {
      await businessApi.removeMembership(selectedBusiness.id, membershipId);
      toast.success('Member removed', 'Membership has been revoked.');
      setMembers(prev => prev.filter(m => m.id !== membershipId));
    } catch (err) {
      toast.error('Failed to remove member', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="workspaces-page">
      <PageHeader
        title="Workspaces & Organizations"
        subtitle="Manage multi-tenant business workspaces, subscription plans, and team memberships."
        actions={
          <button className="primary-button" onClick={handleOpenCreate}>
            <Plus size={18} />
            <span>New Workspace</span>
          </button>
        }
      />

      <div className="workspaces-stats-bar">
        <div className="workspace-stat-item">
          <span className="stat-label">Total Workspaces</span>
          <span className="stat-value">{businesses.length}</span>
        </div>
        <div className="workspace-stat-item">
          <span className="stat-label">Active Workspaces</span>
          <span className="stat-value text-success">
            {businesses.filter(b => b.isActive).length}
          </span>
        </div>
        <div className="workspace-stat-item">
          <span className="stat-label">Enterprise Tier</span>
          <span className="stat-value text-primary">
            {businesses.filter(b => b.plan === 'enterprise').length}
          </span>
        </div>
      </div>

      <div className="workspaces-toolbar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search workspaces by name or slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="workspaces-loading">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading workspaces...</p>
        </div>
      ) : filteredBusinesses.length === 0 ? (
        <div className="workspaces-empty">
          <Building2 size={48} className="empty-icon" />
          <h3>No workspaces found</h3>
          <p>Create a workspace to organize WhatsApp sessions, campaigns, and team members under a dedicated tenant.</p>
          <button className="primary-button" onClick={handleOpenCreate}>
            <Plus size={18} />
            <span>Create First Workspace</span>
          </button>
        </div>
      ) : (
        <div className="workspaces-grid">
          {filteredBusinesses.map(b => (
            <div key={b.id} className="workspace-card">
              <div className="workspace-card-header">
                <div className="workspace-card-title">
                  <div className="workspace-avatar">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h3>{b.name}</h3>
                    <span className="workspace-slug">/{b.slug}</span>
                  </div>
                </div>
                <span className={`plan-badge plan-${b.plan || 'starter'}`}>
                  {b.plan || 'starter'}
                </span>
              </div>

              <div className="workspace-card-body">
                <div className="workspace-detail-row">
                  <span className="detail-label">Status</span>
                  <span className="status-indicator">
                    {b.isActive ? (
                      <>
                        <CheckCircle2 size={15} className="text-success" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={15} className="text-muted" />
                        <span>Inactive</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="workspace-detail-row">
                  <span className="detail-label">Max Sessions</span>
                  <span className="detail-value">{b.settings?.maxSessions ? String(b.settings.maxSessions) : '5'}</span>
                </div>
                <div className="workspace-detail-row">
                  <span className="detail-label">Created</span>
                  <span className="detail-value">{new Date(b.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="workspace-card-actions">
                <button
                  className="btn-action btn-members"
                  onClick={() => void handleOpenMembers(b)}
                  title="Manage Members"
                >
                  <Users size={16} />
                  <span>Members</span>
                </button>
                <button
                  className="btn-action"
                  onClick={() => handleOpenEdit(b)}
                  title="Edit Workspace"
                >
                  <Edit size={16} />
                  <span>Edit</span>
                </button>
                <button
                  className="btn-action btn-danger"
                  onClick={() => void handleDelete(b)}
                  title="Delete Workspace"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createModalOpen}
        title="Create New Workspace"
        onClose={() => setCreateModalOpen(false)}
      >
        <form onSubmit={handleCreate} className="workspace-form">
          <div className="form-group">
            <label>Workspace Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Acme Corporation"
              value={formName}
              onChange={e => {
                setFormName(e.target.value);
                if (!formSlug) {
                  setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
                }
              }}
            />
          </div>
          <div className="form-group">
            <label>Slug (URL identifier)</label>
            <input
              type="text"
              placeholder="e.g. acme-corp"
              value={formSlug}
              onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Plan Tier</label>
              <select
                value={formPlan}
                onChange={e => setFormPlan(e.target.value as 'starter' | 'growth' | 'enterprise')}
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="form-group">
              <label>Max WhatsApp Sessions</label>
              <input
                type="number"
                min="1"
                max="100"
                value={formMaxSessions}
                onChange={e => setFormMaxSessions(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCreateModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || !formName.trim()}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              <span>Create Workspace</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen && Boolean(selectedBusiness)}
        title={`Edit Workspace: ${selectedBusiness?.name || ''}`}
        onClose={() => setEditModalOpen(false)}
      >
        <form onSubmit={handleUpdate} className="workspace-form">
          <div className="form-group">
            <label>Workspace Name *</label>
            <input
              type="text"
              required
              value={formName}
              onChange={e => setFormName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Slug</label>
            <input
              type="text"
              value={formSlug}
              onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Plan Tier</label>
              <select
                value={formPlan}
                onChange={e => setFormPlan(e.target.value as 'starter' | 'growth' | 'enterprise')}
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="form-group">
              <label>Max WhatsApp Sessions</label>
              <input
                type="number"
                min="1"
                max="100"
                value={formMaxSessions}
                onChange={e => setFormMaxSessions(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || !formName.trim()}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Members Modal */}
      <Modal
        open={membersModalOpen && Boolean(selectedBusiness)}
        title={`Members & Roles: ${selectedBusiness?.name || ''}`}
        onClose={() => setMembersModalOpen(false)}
      >
        <div className="members-modal-content">
          <form onSubmit={handleAddMember} className="add-member-bar">
            <div className="form-group member-select-group">
              <label>API Key / Identity</label>
              <select
                value={selectedApiKeyId}
                onChange={e => setSelectedApiKeyId(e.target.value)}
                required
              >
                {apiKeys.length === 0 && <option value="">No API keys available</option>}
                {apiKeys.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.role}) - {k.id.substring(0, 8)}...
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group member-role-group">
              <label>Workspace Role</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value as 'owner' | 'admin' | 'agent' | 'viewer')}
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="agent">Agent</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button
              type="submit"
              className="primary-button add-member-btn"
              disabled={addingMember || !selectedApiKeyId}
            >
              {addingMember ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              <span>Add</span>
            </button>
          </form>

          <div className="members-list-container">
            <h4>Current Members ({members.length})</h4>
            {loadingMembers ? (
              <div className="members-loading">
                <Loader2 size={24} className="animate-spin" />
                <span>Loading members...</span>
              </div>
            ) : members.length === 0 ? (
              <div className="members-empty">
                <Users size={32} className="text-muted" />
                <p>No members added to this workspace yet.</p>
              </div>
            ) : (
              <div className="members-table-wrap">
                <table className="members-table">
                  <thead>
                    <tr>
                      <th>Identity ID</th>
                      <th>Role</th>
                      <th>Assigned</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(m => {
                      const matchedKey = apiKeys.find(k => k.id === m.apiKeyId);
                      return (
                        <tr key={m.id}>
                          <td>
                            <div className="member-identity">
                              <span className="member-name">{matchedKey ? matchedKey.name : m.apiKeyId.substring(0, 12) + '...'}</span>
                              <span className="member-id-sub">{m.apiKeyId}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`role-badge role-${m.businessRole}`}>
                              <Shield size={12} />
                              {m.businessRole}
                            </span>
                          </td>
                          <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="btn-icon-danger"
                              onClick={() => void handleRemoveMember(m.id)}
                              title="Remove member"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
export default Workspaces;
