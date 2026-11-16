import { useState, useEffect, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Check,
  KeyRound,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { businessApi, type ApiKey } from '../services/api';
import { FEATURE_IDS } from '../utils/features';
import { EXPIRY_UNITS, expiresAtFrom, type ExpiryUnit } from '../utils/expiry';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useDeleteApiKeyMutation,
  useRevokeApiKeyMutation,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { copyToClipboard } from '../utils/clipboard';
import './ApiKeys.css';

const roleNames = ['admin', 'operator', 'viewer'] as const;
const emptyKey = {
  name: '',
  role: 'operator',
  businessId: '',
  expiryAmount: '30',
  expiryUnit: 'days' as ExpiryUnit,
  features: [] as string[],
};

function useWindowSize() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}

const columnHelper = createColumnHelper<ApiKey>();

export function ApiKeys() {
  const { t } = useTranslation();
  const toast = useToast();
  useDocumentTitle(t('apiKeys.title'));
  const { data: apiKeys = [], isLoading: loading, isError: apiKeysError } = useApiKeysQuery();
  const createMutation = useCreateApiKeyMutation();
  const deleteMutation = useDeleteApiKeyMutation();
  const revokeMutation = useRevokeApiKeyMutation();
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey] = useState(emptyKey);
  const { data: businesses = [] } = useQuery({
    queryKey: ['businesses'],
    queryFn: businessApi.list,
    staleTime: 30_000,
  });
  const toggleFeature = (feature: string) =>
    setNewKey(k => ({
      ...k,
      features: k.features.includes(feature) ? k.features.filter(f => f !== feature) : [...k.features, feature],
    }));
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'revoke'; id: string; name: string } | null>(
    null,
  );

  const windowWidth = useWindowSize();
  const isMobile = windowWidth < 768;
  const isSmall = windowWidth < 640;
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    setColumnVisibility({ key: !isSmall, lastUsed: !isMobile });
  }, [isMobile, isSmall]);

  const expiryValid = expiresAtFrom(newKey.expiryAmount, newKey.expiryUnit) !== null;

  const handleCreate = async () => {
    // Computed at click time, so "5 minutes" means five minutes from creation, not from opening the form.
    const expiresAt = expiresAtFrom(newKey.expiryAmount, newKey.expiryUnit);
    if (!newKey.name || expiresAt === null) return;
    try {
      // A customer (business) key carries its approved features; a platform (super admin) key has none.
      const forBusiness = newKey.businessId !== '';
      const created = await createMutation.mutateAsync({
        name: newKey.name,
        role: newKey.role,
        ...(forBusiness && { businessId: newKey.businessId, allowedFeatures: newKey.features }),
        ...(expiresAt && { expiresAt }),
      });
      setCreatedKey(created.apiKey || null);
      setNewKey(emptyKey);
    } catch (err) {
      console.error('Failed to create:', err);
      toast.error(t('apiKeys.createBtn'), err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to revoke:', err);
      toast.error(t('apiKeys.actions.revoke'), err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete:', err);
      toast.error(t('apiKeys.actions.delete'), err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  const confirmAndExecute = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete') handleDelete(confirmAction.id);
    else handleRevoke(confirmAction.id);
    setConfirmAction(null);
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async (text: string, id: string) => {
    if (await copyToClipboard(text)) {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: () => t('apiKeys.columns.name'),
        cell: info => <span className="name-cell">{info.getValue()}</span>,
      }),
      columnHelper.accessor('keyPrefix', {
        id: 'key',
        header: () => t('apiKeys.columns.key'),
        cell: info => {
          const apiKey = info.row.original;
          return (
            <span className="key-cell">
              <code>{visibleKeys.has(apiKey.id) ? apiKey.keyPrefix + '...' : apiKey.keyPrefix + '****'}</code>
              <button
                className="icon-btn-sm"
                onClick={() => toggleKeyVisibility(apiKey.id)}
                aria-label={visibleKeys.has(apiKey.id) ? t('common.hideApiKey') : t('common.showApiKey')}
              >
                {visibleKeys.has(apiKey.id) ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
          );
        },
      }),
      columnHelper.accessor('role', {
        header: () => t('apiKeys.columns.role'),
        cell: info => <span className="permission-badge">{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: 'access',
        header: () => t('apiKeys.columns.access'),
        cell: info => {
          const apiKey = info.row.original;
          const expired = !!apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();
          const business = businesses.find(b => b.id === apiKey.businessId)?.name ?? apiKey.businessId;
          return (
            <span className="access-cell">
              <span>{apiKey.businessId ? business : t('apiKeys.access.platform')}</span>
              <small>
                {apiKey.allowedFeatures == null
                  ? t('apiKeys.access.allFeatures')
                  : t('apiKeys.access.featureCount', { count: apiKey.allowedFeatures.length })}
                {' · '}
                {apiKey.expiresAt
                  ? t(expired ? 'apiKeys.access.expired' : 'apiKeys.access.expires', {
                      // Time too: keys can now live for minutes or hours.
                      date: new Date(apiKey.expiresAt).toLocaleString(),
                    })
                  : t('apiKeys.access.noExpiry')}
              </small>
            </span>
          );
        },
      }),
      columnHelper.accessor('isActive', {
        header: () => t('apiKeys.columns.status'),
        cell: info => (
          <span className={`status-badge ${info.getValue() ? 'active' : 'inactive'}`}>
            {info.getValue() ? t('apiKeys.statuses.active') : t('apiKeys.statuses.revoked')}
          </span>
        ),
      }),
      columnHelper.accessor('lastUsedAt', {
        id: 'lastUsed',
        header: () => t('apiKeys.columns.lastUsed'),
        cell: info => (
          <span className="last-used">
            {info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : t('common.never')}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: () => t('apiKeys.columns.actions'),
        cell: info => {
          const apiKey = info.row.original;
          return (
            <span className="actions-cell">
              {/* No per-row copy: the full key only exists once (post-creation modal); the row
                  only has the prefix, so a copy button here could only copy a useless fragment. */}
              {apiKey.isActive && (
                <button
                  className="icon-btn"
                  onClick={() => setConfirmAction({ type: 'revoke', id: apiKey.id, name: apiKey.name })}
                  title={t('apiKeys.actions.revoke')}
                >
                  <RefreshCw size={16} />
                </button>
              )}
              <button
                className="icon-btn danger"
                onClick={() => setConfirmAction({ type: 'delete', id: apiKey.id, name: apiKey.name })}
                title={t('apiKeys.actions.delete')}
              >
                <Trash2 size={16} />
              </button>
            </span>
          );
        },
      }),
    ],
    [visibleKeys, t, businesses],
  );

  const table = useReactTable({
    data: apiKeys,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div
        className="api-keys-page"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="api-keys-page">
      <PageHeader
        title={t('apiKeys.title')}
        subtitle={t('apiKeys.subtitle')}
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} />
            {t('apiKeys.createBtn')}
          </button>
        }
      />

      {apiKeysError && (
        <div className="error-banner" role="alert">
          <AlertCircle size={20} />
          <span className="error-banner-text">{t('dashboard.loadError')}</span>
        </div>
      )}

      {showModal && (
        <Modal
          open
          onClose={() => {
            setShowModal(false);
            setCreatedKey(null);
          }}
          title={createdKey ? t('apiKeys.createdTitle') : t('apiKeys.modalTitle')}
          closeLabel={t('common.close')}
          footer={
            !createdKey ? (
              <>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>
                  {t('common.cancel')}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newKey.name || !expiryValid}
                >
                  {createMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : t('common.create')}
                </button>
              </>
            ) : undefined
          }
        >
          {createdKey ? (
            <div>
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>{t('apiKeys.createdHint')}</p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <code
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '6px',
                    wordBreak: 'break-all',
                  }}
                >
                  {createdKey}
                </code>
                <button className="btn-primary" onClick={() => void handleCopy(createdKey, 'modal')}>
                  {copied === 'modal' ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <>
              <label>{t('common.name')}</label>
              <input
                type="text"
                placeholder={t('apiKeys.namePlaceholder')}
                value={newKey.name}
                onChange={e => setNewKey({ ...newKey, name: e.target.value })}
              />
              <label>{t('common.role')}</label>
              <select value={newKey.role} onChange={e => setNewKey({ ...newKey, role: e.target.value })}>
                {roleNames
                  // Customer keys are never admin: admin routes are server-wide (the API refuses it too).
                  .filter(r => !(newKey.businessId && r === 'admin'))
                  .map(r => (
                    <option key={r} value={r}>
                      {t(`apiKeys.roles.${r}`)}
                    </option>
                  ))}
              </select>
              <label htmlFor="apiKeyBusiness">{t('apiKeys.access.business')}</label>
              <select
                id="apiKeyBusiness"
                value={newKey.businessId}
                onChange={e =>
                  setNewKey({
                    ...newKey,
                    businessId: e.target.value,
                    role: e.target.value && newKey.role === 'admin' ? 'operator' : newKey.role,
                  })
                }
              >
                <option value="">{t('apiKeys.access.platform')}</option>
                {businesses.map(b => (
                  <option key={b.id} value={b.id} disabled={!b.isActive}>
                    {b.name}
                  </option>
                ))}
              </select>
              <label htmlFor="apiKeyExpiryAmount">{t('apiKeys.access.validity')}</label>
              <div className="expiry-row">
                {newKey.expiryUnit !== 'never' && (
                  <input
                    id="apiKeyExpiryAmount"
                    type="number"
                    min={1}
                    step={1}
                    value={newKey.expiryAmount}
                    onChange={e => setNewKey({ ...newKey, expiryAmount: e.target.value })}
                    aria-invalid={!expiryValid}
                  />
                )}
                <select
                  aria-label={t('apiKeys.access.validityUnit')}
                  value={newKey.expiryUnit}
                  onChange={e => setNewKey({ ...newKey, expiryUnit: e.target.value as ExpiryUnit })}
                >
                  {EXPIRY_UNITS.map(u => (
                    <option key={u} value={u}>
                      {t(`apiKeys.access.units.${u}`)}
                    </option>
                  ))}
                </select>
              </div>
              {!expiryValid && <span className="expiry-error">{t('apiKeys.access.validityInvalid')}</span>}
              {newKey.businessId && (
                <fieldset className="feature-grid">
                  <legend>{t('apiKeys.access.features')}</legend>
                  <p className="feature-hint">{t('apiKeys.access.featuresHint')}</p>
                  {FEATURE_IDS.map(f => (
                    <label key={f} className="feature-option">
                      <input type="checkbox" checked={newKey.features.includes(f)} onChange={() => toggleFeature(f)} />
                      {t(`apiKeys.featureNames.${f}`)}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}
        </Modal>
      )}

      <div className="api-keys-content">
        <div className="keys-table-container">
          {apiKeys.length === 0 ? (
            <div className="empty-table-state">
              <KeyRound size={48} strokeWidth={1} />
              <h3>{t('apiKeys.empty.title')}</h3>
              <p>{t('apiKeys.empty.description')}</p>
            </div>
          ) : (
            <table className="keys-table">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="table-row header">
                    {headerGroup.headers.map(header => (
                      <th key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="table-row">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="permissions-reference">
          <h3>{t('apiKeys.rolesTitle')}</h3>
          <div className="permissions-list">
            {roleNames.map(r => (
              <div key={r} className="perm-item">
                <code>{r}</code>
                <span>{t(`apiKeys.roleDescriptions.${r}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmAction && (
        <Modal
          open
          onClose={() => setConfirmAction(null)}
          title={confirmAction.type === 'delete' ? t('apiKeys.confirm.deleteTitle') : t('apiKeys.confirm.revokeTitle')}
          className="confirm-modal"
          closeLabel={t('common.close')}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setConfirmAction(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn-danger" onClick={confirmAndExecute}>
                {confirmAction.type === 'delete' ? t('apiKeys.confirm.delete') : t('apiKeys.confirm.revoke')}
              </button>
            </>
          }
        >
          <div className="confirm-icon-wrapper">
            <AlertTriangle size={48} className="confirm-warning-icon" />
          </div>
          <p className="confirm-message">
            <Trans
              i18nKey={
                confirmAction.type === 'delete' ? 'apiKeys.confirm.deleteMessage' : 'apiKeys.confirm.revokeMessage'
              }
              values={{ name: confirmAction.name }}
              components={{ strong: <strong /> }}
            />
          </p>
        </Modal>
      )}
    </div>
  );
}
