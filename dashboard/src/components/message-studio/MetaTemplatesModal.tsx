import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, FileText } from 'lucide-react';
import { Modal } from '../Modal';
import { messageStudioApi, sessionApi } from '../../services/api';
import { MetaTemplateForm } from './MetaTemplateForm';

const STATUS_CLASS: Record<string, string> = { APPROVED: 'ms-chip ms-chip-success' };

/** Lists a Cloud API number's WhatsApp templates with Meta's approval status, and creates new ones. */
export function MetaTemplatesModal({ onClose }: { onClose: () => void }) {
  const [sessionId, setSessionId] = useState('');
  const [creating, setCreating] = useState(false);

  const sessions = useQuery({ queryKey: ['sessions', 'list'], queryFn: () => sessionApi.list() });
  const cloudSessions = (sessions.data ?? []).filter(s => s.engineType === 'cloud-api');
  const activeId = sessionId || cloudSessions[0]?.id || '';

  const templates = useQuery({
    queryKey: ['message-studio', 'meta-templates', activeId],
    queryFn: () => messageStudioApi.templates(activeId),
    enabled: Boolean(activeId),
  });
  const reload = () => messageStudioApi.templates(activeId, true).then(() => templates.refetch());

  if (creating && activeId) {
    return (
      <MetaTemplateForm
        sessionId={activeId}
        onClose={() => setCreating(false)}
        onSubmitted={() => {
          setCreating(false);
          void reload();
        }}
      />
    );
  }

  const list = templates.data?.templates ?? [];

  return (
    <Modal open onClose={onClose} title="WhatsApp Templates (Meta)" className="ms-modal-wide">
      <p className="ms-muted">
        Messages to people who have not written to you in the last 24 hours must use a template Meta has approved.
      </p>

      {sessions.isLoading ? (
        <div className="ms-state">Loading numbers…</div>
      ) : cloudSessions.length === 0 ? (
        <div className="ms-state">No Cloud API number yet. Add one in Sessions with the “Official (Cloud API)” engine.</div>
      ) : (
        <>
          <div className="ms-toolbar">
            <select
              className="ms-input"
              aria-label="WhatsApp number"
              value={activeId}
              onChange={e => setSessionId(e.target.value)}
            >
              {cloudSessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={() => void reload()} disabled={templates.isFetching}>
              <RefreshCw size={16} /> Refresh status
            </button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New template
            </button>
          </div>

          {templates.isLoading ? (
            <div className="ms-state">Loading templates from Meta…</div>
          ) : templates.data?.templates === null ? (
            <div className="ms-state ms-state-error" role="alert">
              {templates.data.reason}
            </div>
          ) : list.length === 0 ? (
            <div className="ms-empty ms-empty-compact">
              <FileText size={32} aria-hidden="true" />
              <p>No templates yet. Create one and Meta will review it.</p>
            </div>
          ) : (
            <ul className="ms-product-rows">
              {list.map(t => (
                <li key={`${t.name}-${t.language}`} className="ms-product-row">
                  <div className="ms-product-info">
                    <strong>
                      {t.name} <span className="ms-muted">· {t.language}</span>
                    </strong>
                    <span className="ms-muted">
                      {t.category} · {t.bodyText.slice(0, 90)}
                      {t.bodyText.length > 90 ? '…' : ''}
                    </span>
                    {t.rejectedReason && <span className="ms-field-error">Rejected: {t.rejectedReason}</span>}
                  </div>
                  <span className={STATUS_CLASS[t.status] ?? 'ms-chip'}>{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
