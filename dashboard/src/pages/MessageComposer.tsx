import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, GitBranch, Save, Send, Undo2 } from 'lucide-react';
import { useToast } from '../components/Toast';
import { messageStudioApi } from '../services/api';
import type { StudioContent, StudioKind, StudioMessage, ValidationResult } from '../types/messageStudio';
import { KIND_LABEL, defaultContent, hasSampleText, type KindCard, type Preset } from '../utils/messageStudio';
import { useStudioSession } from '../components/message-studio/useStudioSession';
import { SessionSelect } from '../components/message-studio/SessionSelect';
import { KindPicker } from '../components/message-studio/KindPicker';
import { ContentEditor } from '../components/message-studio/ContentEditor';
import { ButtonBuilder } from '../components/message-studio/ButtonBuilder';
import { ListBuilder } from '../components/message-studio/ListBuilder';
import { ProductSelector } from '../components/message-studio/ProductSelector';
import { ReadinessPanel } from '../components/message-studio/ReadinessPanel';
import { WhatsAppPreview } from '../components/message-studio/WhatsAppPreview';
import { TestSendModal } from '../components/message-studio/TestSendModal';
import './MessageStudio.css';

interface Draft {
  name: string;
  kind: StudioKind;
  content: StudioContent;
  presetKey?: string;
}

type Pane = 'edit' | 'structure' | 'preview';

/** Hook: server readiness for the draft, re-checked 400 ms after the last change. */
function useValidation(draft: Draft | null, sessionId: string) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!draft) return;
    const ctrl = new AbortController();
    setChecking(true);
    const timer = setTimeout(() => {
      messageStudioApi
        .validate({ kind: draft.kind, content: draft.content, sessionId: sessionId || undefined }, ctrl.signal)
        .then(r => setResult(r))
        .catch(() => {
          /* aborted or offline: keep the last result */
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setChecking(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [draft, sessionId]);
  return { result, checking };
}

export function MessageComposer() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const studio = useStudioSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pane, setPane] = useState<Pane>('edit');
  const [testing, setTesting] = useState(false);
  const [savedMsg, setSavedMsg] = useState<StudioMessage | null>(null);

  const message = useQuery({
    queryKey: ['message-studio', 'message', id],
    queryFn: () => messageStudioApi.get(id),
    enabled: !isNew,
  });

  useEffect(() => {
    if (message.data && (!draft || savedMsg?.id !== message.data.id)) {
      setSavedMsg(message.data);
      setDraft({
        name: message.data.name,
        kind: message.data.kind,
        content: message.data.content,
        presetKey: message.data.presetKey ?? undefined,
      });
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.data]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const { result, checking } = useValidation(draft, studio.sessionId);
  const issues = result?.issues ?? [];

  const templates = useQuery({
    queryKey: ['message-studio', 'templates', studio.sessionId],
    queryFn: () => messageStudioApi.templates(studio.sessionId),
    enabled: draft?.kind === 'template' && Boolean(studio.sessionId) && Boolean(studio.capabilities?.cloudApi),
  });
  const template = useMemo(
    () =>
      templates.data?.templates?.find(
        t => t.name === draft?.content.template?.name && t.language === draft?.content.template?.language,
      ),
    [templates.data, draft?.content.template?.name, draft?.content.template?.language],
  );
  const productsForButtons = useQuery({
    queryKey: ['message-studio', 'products', 'buttons'],
    queryFn: () => messageStudioApi.products({ limit: 100 }),
    enabled: Boolean(draft?.content.buttons?.some(b => b.action === 'view_product')),
  });

  const patch = (p: Partial<StudioContent>) => {
    setDraft(d => (d ? { ...d, content: { ...d.content, ...p } } : d));
    setDirty(true);
  };

  const start = (kind: StudioKind, content: StudioContent, name: string, presetKey?: string) => {
    setDraft({ kind, content, name, presetKey });
    setDirty(true);
  };
  const pickCard = (card: KindCard) =>
    start(card.kind, defaultContent(card.kind, card.start), `New ${card.title.toLowerCase()}`);
  const pickPreset = (p: Preset) => {
    start(p.kind, structuredClone(p.content), p.name, p.key);
    toast.info(p.name, p.todo);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['message-studio'] });

  const save = useMutation({
    mutationFn: async (): Promise<StudioMessage> => {
      if (!draft) throw new Error('Nothing to save');
      const sessionId = studio.sessionId || undefined;
      if (isNew || !savedMsg) {
        return messageStudioApi.create({
          name: draft.name.trim() || 'Untitled message',
          kind: draft.kind,
          content: draft.content,
          presetKey: draft.presetKey,
          sessionId,
        });
      }
      return messageStudioApi.update(savedMsg.id, {
        name: draft.name.trim() || 'Untitled message',
        content: draft.content,
        sessionId,
      });
    },
    onSuccess: m => {
      setSavedMsg(m);
      setDirty(false);
      refresh();
      if (isNew) navigate(`/message-studio/${m.id}`, { replace: true });
    },
    onError: (e: Error) => toast.error('Could not save', e.message),
  });

  const saveDraft = async () => {
    const m = await save.mutateAsync();
    toast.success(m.status === 'ready' ? 'Saved — the published message is updated' : 'Draft saved', m.name);
  };
  const saveIfNeeded = async () => (dirty || !savedMsg ? save.mutateAsync() : savedMsg);

  const publish = useMutation({
    mutationFn: async () => {
      const m = await saveIfNeeded();
      return messageStudioApi.publish(m.id, studio.sessionId);
    },
    onSuccess: m => {
      setSavedMsg(m);
      refresh();
      toast.success('Published — it can now be used in automations', m.name);
    },
    onError: (e: Error) => toast.error('Could not publish', e.message),
  });
  const unpublish = useMutation({
    mutationFn: () => messageStudioApi.unpublish(savedMsg!.id),
    onSuccess: m => {
      setSavedMsg(m);
      refresh();
      toast.success('Moved back to drafts', m.name);
    },
    onError: (e: Error) => toast.error('Could not unpublish', e.message),
  });

  const openTest = async () => {
    try {
      await saveIfNeeded();
      setTesting(true);
    } catch {
      /* save already showed the error */
    }
  };

  if (!isNew && message.isLoading) return <div className="message-studio-page ms-state">Loading message…</div>;
  if (!isNew && message.isError)
    return (
      <div className="message-studio-page ms-state ms-state-error" role="alert">
        This message could not be opened. <Link to="/message-studio">Back to Message Studio</Link>
      </div>
    );

  if (!draft) {
    return (
      <div className="message-studio-page">
        <div className="ms-composer-bar">
          <Link to="/message-studio" className="ms-back">
            <ArrowLeft size={16} aria-hidden="true" /> Message Studio
          </Link>
          <h1 className="ms-composer-title">New message</h1>
          <SessionSelect
            sessions={studio.sessions}
            value={studio.sessionId}
            onChange={studio.setSessionId}
            capabilities={studio.capabilities}
          />
        </div>
        <KindPicker capabilities={studio.capabilities} onPickCard={pickCard} onPickPreset={pickPreset} />
      </div>
    );
  }

  const status = savedMsg?.status ?? 'draft';
  const ready = result?.readiness === 'ready' && !checking;
  const sampleText = hasSampleText(draft.content);
  const session = studio.sessions.find(s => s.id === studio.sessionId);
  const usedIn = (message.data?.usedIn ?? []).filter(u => u.status !== 'archived');

  return (
    <div className="message-studio-page ms-composer">
      <div className="ms-composer-bar">
        <Link to="/message-studio" className="ms-back">
          <ArrowLeft size={16} aria-hidden="true" /> Message Studio
        </Link>
        <label className="ms-name">
          <span className="sr-only">Message name</span>
          <input
            className="ms-name-input"
            value={draft.name}
            maxLength={120}
            onChange={e => {
              setDraft({ ...draft, name: e.target.value });
              setDirty(true);
            }}
            placeholder="Name this message"
          />
        </label>
        <span className="ms-chip">{KIND_LABEL[draft.kind]}</span>
        <span className={`ms-status ms-status-${status}`}>
          {status === 'ready' ? 'Published' : status === 'draft' ? 'Draft' : 'Archived'}
        </span>
        {dirty && <span className="ms-muted">Unsaved changes</span>}
        <div className="ms-composer-actions">
          <SessionSelect
            sessions={studio.sessions}
            value={studio.sessionId}
            onChange={studio.setSessionId}
            capabilities={studio.capabilities}
          />
          <button
            className="btn btn-secondary"
            onClick={() => void saveDraft()}
            disabled={save.isPending || (!dirty && !isNew)}
          >
            <Save size={16} /> {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void openTest()}
            disabled={!ready || sampleText || !session || session.status !== 'ready'}
            title={
              !session
                ? 'Connect a WhatsApp number first'
                : session.status !== 'ready'
                  ? 'This number is offline'
                  : !ready
                    ? 'Fix the items listed first'
                    : undefined
            }
          >
            <Send size={16} /> Send test
          </button>
          {status === 'ready' ? (
            <button className="btn btn-secondary" onClick={() => unpublish.mutate()} disabled={unpublish.isPending}>
              <Undo2 size={16} /> Unpublish
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => publish.mutate()}
              disabled={!ready || sampleText || !studio.sessionId || publish.isPending}
              title={!ready ? 'Fix the items listed first' : 'Make it available to automations'}
            >
              <Check size={16} /> Publish
            </button>
          )}
        </div>
      </div>

      <div className="ms-pane-tabs" role="tablist" aria-label="Composer sections">
        {(['edit', 'structure', 'preview'] as Pane[])
          .map(p => (
            <button
              key={p}
              role="tab"
              aria-selected={pane === p}
              className={`ms-tab ${pane === p ? 'is-active' : ''}`}
              onClick={() => setPane(p)}
            >
              {p === 'edit' ? 'Content' : p === 'structure' ? 'Checks & items' : 'Preview'}
            </button>
          ))}
      </div>

      <div className={`ms-workspace ms-show-${pane}`}>
        <section className="ms-panel ms-panel-edit" aria-label="Content">
          <h2 className="ms-panel-title">Content</h2>
          <ContentEditor
            kind={draft.kind}
            content={draft.content}
            onChange={patch}
            issues={issues}
            sessionId={studio.sessionId}
            cloudApi={Boolean(studio.capabilities?.cloudApi)}
          />
        </section>

        <section className="ms-panel ms-panel-structure" aria-label="Buttons and items">
          <ReadinessPanel
            readiness={result?.readiness}
            issues={issues}
            deliveryNote={result?.deliveryNote}
            checking={checking}
            sampleText={sampleText}
          />
          {draft.kind === 'list' && draft.content.list && (
            <ListBuilder list={draft.content.list} onChange={list => patch({ list })} issues={issues} />
          )}
          {draft.kind === 'products' && (
            <ProductSelector
              content={draft.content}
              onChange={patch}
              issues={issues}
              resolved={result?.products ?? []}
              capabilities={studio.capabilities}
            />
          )}
          <ButtonBuilder
            kind={draft.kind}
            buttons={draft.content.buttons ?? []}
            onChange={buttons => patch({ buttons })}
            issues={issues}
            products={productsForButtons.data?.items ?? []}
          />
          {status === 'ready' && (
            <p className="ms-hint">This message is published: saved changes reach automations straight away.</p>
          )}
          {usedIn.length > 0 && (
            <div className="ms-usage">
              <GitBranch size={14} aria-hidden="true" /> Used in{' '}
              {usedIn.map((u, i) => (
                <span key={u.workflowId}>
                  {i > 0 && ', '}
                  <Link to="/workflows">{u.name}</Link>
                </span>
              ))}
            </div>
          )}
          {status !== 'ready' && savedMsg && (
            <p className="ms-hint">Publish this message to choose it in a workflow's “Studio Message” step.</p>
          )}
        </section>

        <section className="ms-panel ms-panel-preview" aria-label="Preview">
          <h2 className="ms-panel-title">Preview</h2>
          <WhatsAppPreview
            kind={draft.kind}
            content={draft.content}
            capabilities={studio.capabilities}
            products={result?.products ?? []}
            template={template}
          />
          {!studio.capabilities?.cloudApi && studio.capabilities && (
            <p className="ms-hint">
              Shown as this WhatsApp Web number will send it. Cloud API numbers show real buttons and lists.
            </p>
          )}
        </section>
      </div>

      {testing && savedMsg && (
        <TestSendModal
          messageId={savedMsg.id}
          sessionId={studio.sessionId}
          sessionName={session?.name ?? ''}
          onClose={() => setTesting(false)}
          onSent={refresh}
        />
      )}
    </div>
  );
}
