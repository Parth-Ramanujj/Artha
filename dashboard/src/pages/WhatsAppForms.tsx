import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Inbox, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { whatsappFormApi } from '../services/api';
import type { WhatsAppForm } from '../types/whatsappForm';
import { FLOW_CATEGORY_OPTIONS } from '../types/whatsappForm';
import { useSessionsQuery } from '../hooks/queries';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { SendFormModal } from '../components/whatsapp-forms/SendFormModal';
import { ResponsesModal } from '../components/whatsapp-forms/ResponsesModal';
import './WhatsAppForms.css';

const categoryLabel = (value: string) => FLOW_CATEGORY_OPTIONS.find(o => o.value === value)?.label ?? value;

export function WhatsAppForms() {
  useDocumentTitle('WhatsApp Forms');
  const navigate = useNavigate();
  const sessionsQuery = useSessionsQuery();
  const cloudSessions = (sessionsQuery.data ?? []).filter(s => s.engineType === 'cloud-api');

  const [forms, setForms] = useState<WhatsAppForm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<WhatsAppForm | null>(null);
  const [responsesTarget, setResponsesTarget] = useState<WhatsAppForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppForm | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    whatsappFormApi
      .list()
      .then(setForms)
      .catch((err: Error) => setError(err.message));
  };

  useEffect(load, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await whatsappFormApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the form');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="wf-page">
      <PageHeader
        title="WhatsApp Forms"
        subtitle="Design WhatsApp Forms visually without writing JSON"
        action={{ label: 'New form', icon: <Plus size={16} />, onClick: () => navigate('/whatsapp-forms/new') }}
      />

      {error && <p className="wf-error" role="alert">{error}</p>}

      {forms === null && !error && <p className="wf-help">Loading forms…</p>}

      {forms?.length === 0 && (
        <div className="wf-empty">
          <FileText size={36} />
          <h3>No forms yet</h3>
          <p>Build a form with screens and fields. Publish it to WhatsApp and send it to customers.</p>
          <Link to="/whatsapp-forms/new" className="btn btn-primary">
            <Plus size={14} /> Create your first form
          </Link>
        </div>
      )}

      {forms && forms.length > 0 && (
        <ul className="wf-form-grid">
          {forms.map(form => {
            const fields = form.definition.screens.reduce(
              (n, s) => n + s.components.filter(c => c.name).length,
              0,
            );
            return (
              <li key={form.id} className="wf-panel wf-form-card">
                <div className="wf-form-card-head">
                  <h3>{form.name}</h3>
                  <span className={`wf-status wf-status-${form.status}`}>{form.status === 'published' ? 'Live' : 'Draft'}</span>
                </div>
                <p className="wf-help">
                  {categoryLabel(form.category)} · {form.definition.screens.length} screen{form.definition.screens.length === 1 ? '' : 's'} · {fields} field{fields === 1 ? '' : 's'}
                </p>
                <p className="wf-help">Updated {new Date(form.updatedAt).toLocaleString()}</p>
                <div className="wf-form-card-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => navigate(`/whatsapp-forms/${form.id}`)}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setSendTarget(form)}
                    disabled={form.status !== 'published' || cloudSessions.length === 0}
                    title={form.status !== 'published' ? 'Publish the form first' : undefined}
                  >
                    <Send size={14} /> Send
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setResponsesTarget(form)}>
                    <Inbox size={14} /> Responses
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => setDeleteTarget(form)} aria-label={`Delete ${form.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sendTarget && (
        <SendFormModal formId={sendTarget.id} formName={sendTarget.name} sessions={cloudSessions} onClose={() => setSendTarget(null)} />
      )}

      {responsesTarget && (
        <ResponsesModal formId={responsesTarget.id} formName={responsesTarget.name} onClose={() => setResponsesTarget(null)} />
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title="Delete form?"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>
            "{deleteTarget.name}" will be removed from OpenWA. A form already published to WhatsApp stays live there until it is
            deleted in Meta Business Manager.
          </p>
        </Modal>
      )}
    </div>
  );
}
