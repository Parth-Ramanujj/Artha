import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileText, Megaphone, PencilLine, Plus, RefreshCw, Search, Send } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { messageStudioApi, sessionApi } from '../services/api';
import type { StudioTemplate, TemplateAutoTest } from '../types/messageStudio';
import { MetaTemplateForm } from '../components/message-studio/MetaTemplateForm';
import { MetaTemplateCard } from '../components/message-studio/MetaTemplateCard';
import { SendTemplateDialog } from '../components/message-studio/SendTemplateDialog';
import { TemplateAutomationsDialog } from '../components/message-studio/TemplateAutomationsDialog';
import { draftFromTemplate } from '../utils/metaTemplate';
import './MessageStudio.css';

type Tab = 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED';
const TABS: Array<[Tab, string]> = [
  ['ALL', 'All'],
  ['APPROVED', 'Approved'],
  ['PENDING', 'In review'],
  ['REJECTED', 'Not approved'],
];
const inTab = (t: StudioTemplate, tab: Tab) =>
  tab === 'ALL' || (tab === 'REJECTED' ? ['REJECTED', 'PAUSED', 'DISABLED'].includes(t.status) : t.status === tab);

const STEPS = [
  { icon: PencilLine, title: '1. Create', text: 'Write the message, add a photo and buttons, then submit it.' },
  { icon: Search, title: '2. Meta reviews', text: 'Usually minutes, at most 24 hours. This page updates by itself.' },
  { icon: Send, title: '3. Send it', text: 'To one number, to many people (campaign), or from an automation.' },
];

/** Meta WhatsApp templates: create them, follow their approval, and send them — all from one place. */
export function WhatsAppTemplates() {
  const navigate = useNavigate();
  const toast = useToast();
  const [sessionId, setSessionId] = useState('');
  const [tab, setTab] = useState<Tab>('ALL');
  const [creating, setCreating] = useState<StudioTemplate | 'new' | null>(null);
  const [editing, setEditing] = useState<StudioTemplate | null>(null);
  const [sending, setSending] = useState<StudioTemplate | null>(null);
  const [automating, setAutomating] = useState<StudioTemplate | null>(null);

  const sessions = useQuery({ queryKey: ['sessions', 'list'], queryFn: () => sessionApi.list() });
  const cloudSessions = (sessions.data ?? []).filter(s => s.engineType === 'cloud-api');
  const activeId = sessionId || cloudSessions[0]?.id || '';

  const templates = useQuery({
    queryKey: ['message-studio', 'meta-templates', activeId],
    queryFn: () => messageStudioApi.templates(activeId, true),
    enabled: Boolean(activeId),
    // While Meta is reviewing something, look again every minute.
    refetchInterval: q => (q.state.data?.templates?.some(t => t.status === 'PENDING') ? 60_000 : false),
  });
  const tests = useQuery({
    queryKey: ['message-studio', 'auto-tests'],
    queryFn: messageStudioApi.autoTests,
    refetchInterval: q => (q.state.data?.autoTests.some(a => a.state === 'waiting') ? 30_000 : false),
  });
  const retry = useMutation({
    mutationFn: (t: TemplateAutoTest) =>
      messageStudioApi.retryAutoTest({ sessionId: t.sessionId, name: t.name, language: t.language }),
    onSuccess: () => void tests.refetch(),
  });

  const list = useMemo(() => templates.data?.templates ?? [], [templates.data]);

  // Tell the user the moment a template they are waiting on gets approved.
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    for (const t of list) {
      const key = `${t.name}|${t.language}`;
      const before = seen.current.get(key);
      if (before === 'PENDING' && t.status === 'APPROVED') {
        toast.success('Template approved 🎉', `${t.name} is ready to send.`);
      }
      seen.current.set(key, t.status);
    }
  }, [list, toast]);

  const counts = Object.fromEntries(TABS.map(([id]) => [id, list.filter(t => inTab(t, id)).length])) as Record<Tab, number>;
  const shown = list.filter(t => inTab(t, tab));
  const keyOf = (t: StudioTemplate) => encodeURIComponent(`${t.name}|${t.language}`);

  return (
    <div className="message-studio-page wt-page">
      <PageHeader
        title="WhatsApp Templates"
        subtitle="Approved messages you can send to anyone — even people who have not messaged you."
        icon={<FileText size={24} />}
        actions={
          activeId ? (
            <button className="btn btn-primary" onClick={() => setCreating('new')}>
              <Plus size={16} /> New template
            </button>
          ) : undefined
        }
      />

      <ol className="wt-steps" aria-label="How it works">
        {STEPS.map(s => (
          <li key={s.title} className="wt-step">
            <s.icon size={18} aria-hidden="true" />
            <div>
              <strong>{s.title}</strong>
              <span className="mt-help">{s.text}</span>
            </div>
          </li>
        ))}
      </ol>

      {sessions.isLoading ? (
        <div className="ms-state">Loading your WhatsApp numbers…</div>
      ) : cloudSessions.length === 0 ? (
        <div className="ms-empty">
          <FileText size={40} aria-hidden="true" />
          <h2>Connect an official WhatsApp number first</h2>
          <p className="mt-help">Templates work only with the “Official (Cloud API)” engine.</p>
          <Link className="btn btn-primary" to="/sessions">
            Go to Sessions
          </Link>
        </div>
      ) : (
        <>
          <div className="ms-toolbar">
            {cloudSessions.length > 1 && (
              <select
                className="ms-input wt-session"
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
            )}
            <div className="ms-tabs" role="tablist" aria-label="Filter templates">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={`ms-tab ${tab === id ? 'is-active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {label} <span className="wt-count">{counts[id]}</span>
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              disabled={templates.isFetching}
              onClick={() => void Promise.all([templates.refetch(), tests.refetch()])}
            >
              <RefreshCw size={15} /> {templates.isFetching ? 'Checking…' : 'Check status'}
            </button>
          </div>

          {templates.isLoading ? (
            <div className="ms-state">Loading templates from Meta…</div>
          ) : templates.data?.templates === null ? (
            <div className="ms-state ms-state-error" role="alert">
              {templates.data.reason}
            </div>
          ) : list.length === 0 ? (
            <div className="ms-empty">
              <CheckCircle2 size={40} aria-hidden="true" />
              <h2>Create your first template</h2>
              <p className="mt-help">It takes 2 minutes. Meta usually approves it within minutes.</p>
              <button className="btn btn-primary" onClick={() => setCreating('new')}>
                <Plus size={16} /> New template
              </button>
            </div>
          ) : shown.length === 0 ? (
            <div className="ms-state">Nothing here.</div>
          ) : (
            <div className="wt-grid">
              {shown.map(t => (
                <MetaTemplateCard
                  key={`${t.name}|${t.language}`}
                  template={t}
                  test={tests.data?.autoTests.find(
                    a => a.sessionId === activeId && a.name === t.name && a.language === t.language,
                  )}
                  actions={{
                    onSend: () => setSending(t),
                    onCampaign: () => navigate(`/campaigns?template=${keyOf(t)}&session=${encodeURIComponent(activeId)}`),
                    onAutomation: () => navigate(`/message-studio/new?template=${keyOf(t)}`),
                    onButtonAutomations: () => setAutomating(t),
                    onFix: () => setCreating(t),
                    onEdit: () => setEditing(t),
                    onRetryTest: a => retry.mutate(a),
                    retrying: retry.isPending,
                  }}
                />
              ))}
            </div>
          )}

          {counts.APPROVED > 0 && (
            <p className="mt-help wt-footnote">
              <Megaphone size={13} /> Tip: “Send to many people” opens Campaigns with the template already chosen — just
              paste the numbers.
            </p>
          )}
        </>
      )}

      {creating && activeId && (
        <MetaTemplateForm
          sessionId={activeId}
          initial={creating === 'new' ? undefined : draftFromTemplate(creating)}
          onClose={() => setCreating(null)}
          onSubmitted={() => {
            setCreating(null);
            setTab('PENDING');
            void Promise.all([templates.refetch(), tests.refetch()]);
          }}
        />
      )}
      {editing?.id && activeId && (
        <MetaTemplateForm
          sessionId={activeId}
          editTemplateId={editing.id}
          initial={draftFromTemplate(editing, { keepName: true })}
          onClose={() => setEditing(null)}
          onSubmitted={() => {
            setEditing(null);
            void templates.refetch();
          }}
        />
      )}
      {automating && <TemplateAutomationsDialog template={automating} onClose={() => setAutomating(null)} />}
      {sending && activeId && (
        <SendTemplateDialog sessionId={activeId} template={sending} onClose={() => setSending(null)} />
      )}
    </div>
  );
}
