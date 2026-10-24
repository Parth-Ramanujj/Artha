import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Send, Trash2 } from 'lucide-react';
import { whatsappFormApi } from '../services/api';
import { useSessionsQuery } from '../hooks/queries';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import { FormPreview } from '../components/whatsapp-forms/FormPreview';
import { ComponentInspector } from '../components/whatsapp-forms/ComponentInspector';
import { SendFormModal } from '../components/whatsapp-forms/SendFormModal';
import {
  FLOW_CATEGORY_OPTIONS,
  type ComponentKind,
  type FlowCategory,
  type FormComponent,
  type FormDefinition,
  type WhatsAppFormStatus,
} from '../types/whatsappForm';
import { createComponent, createScreen, draftIssues, moveItem } from '../utils/whatsappForm';
import './WhatsAppForms.css';

const PALETTE: { kind: ComponentKind; label: string }[] = [
  { kind: 'heading', label: 'Heading / Text' },
  { kind: 'short_text', label: 'Short Text Input' },
  { kind: 'paragraph', label: 'Paragraph (TextArea)' },
  { kind: 'dropdown', label: 'Dropdown Menu' },
  { kind: 'radio', label: 'Radio Buttons' },
  { kind: 'checkbox', label: 'Checkboxes' },
  { kind: 'date', label: 'Date Picker' },
  { kind: 'opt_in', label: 'Opt-In / Consent' },
  { kind: 'image', label: 'Image' },
];

const EMPTY_DEFINITION: FormDefinition = { screens: [createScreen(1)] };

export function WhatsAppFormBuilder() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !routeId || routeId === 'new';
  const sessionsQuery = useSessionsQuery();
  const cloudSessions = (sessionsQuery.data ?? []).filter(s => s.engineType === 'cloud-api');

  const [formId, setFormId] = useState<string | null>(isNew ? null : routeId!);
  const formIdRef = useRef<string | null>(formId);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FlowCategory>('OTHER');
  const [definition, setDefinition] = useState<FormDefinition>(EMPTY_DEFINITION);
  const [status, setStatus] = useState<WhatsAppFormStatus>('draft');
  const [screenId, setScreenId] = useState<string | null>(EMPTY_DEFINITION.screens[0].id);
  const [componentId, setComponentId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useDocumentTitle(formId ? 'Edit WhatsApp form' : 'New WhatsApp form');

  useEffect(() => {
    if (isNew || routeId === formIdRef.current) return;
    let cancelled = false;
    whatsappFormApi
      .get(routeId!)
      .then(form => {
        if (cancelled) return;
        formIdRef.current = form.id;
        setFormId(form.id);
        setName(form.name);
        setCategory(form.category);
        setDefinition(form.definition.screens.length ? form.definition : EMPTY_DEFINITION);
        setStatus(form.status);
        setScreenId(form.definition.screens[0]?.id ?? null);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [isNew, routeId]);

  useEffect(() => {
    if (!sessionId && cloudSessions.length) setSessionId(cloudSessions[0].id);
  }, [cloudSessions, sessionId]);

  const screens = definition.screens;
  const screenIndex = Math.max(0, screens.findIndex(s => s.id === screenId));
  const screen = screens[screenIndex];
  const component = screen?.components.find(c => c.id === componentId);

  const changeDefinition = (next: FormDefinition) => {
    setDefinition(next);
    setStatus('draft');
    setIssues([]);
  };
  const updateScreens = (fn: (list: FormDefinition['screens']) => FormDefinition['screens']) =>
    changeDefinition({ screens: fn(screens) });
  const updateScreen = (patch: Partial<FormDefinition['screens'][number]>) =>
    updateScreens(list => list.map((s, i) => (i === screenIndex ? { ...s, ...patch } : s)));
  const updateComponents = (fn: (list: FormComponent[]) => FormComponent[]) =>
    updateScreen({ components: fn(screen?.components ?? []) });

  const addScreen = () => {
    const next = createScreen(screens.length + 1);
    changeDefinition({ screens: [...screens, next] });
    setScreenId(next.id);
    setComponentId(null);
  };
  const removeScreen = () => {
    if (screens.length === 1) return;
    const next = screens.filter((_, i) => i !== screenIndex);
    changeDefinition({ screens: next });
    setScreenId(next[Math.max(0, screenIndex - 1)].id);
    setComponentId(null);
  };
  const moveScreen = (dir: -1 | 1) => {
    changeDefinition({ screens: moveItem(screens, screenIndex, screenIndex + dir) });
  };

  const addComponent = (kind: ComponentKind) => {
    const created = createComponent(kind, definition);
    updateComponents(list => [...list, created]);
    setComponentId(created.id);
  };
  const patchComponent = (patch: Partial<FormComponent>) =>
    updateComponents(list => list.map(c => (c.id === componentId ? { ...c, ...patch } : c)));
  const removeComponent = () => {
    updateComponents(list => list.filter(c => c.id !== componentId));
    setComponentId(null);
  };
  const moveComponent = (dir: -1 | 1) => {
    const index = (screen?.components ?? []).findIndex(c => c.id === componentId);
    updateComponents(list => moveItem(list, index, index + dir));
  };
  const componentIndex = (screen?.components ?? []).findIndex(c => c.id === componentId);

  const save = async () => {
    const body = { name: name.trim(), category, definition };
    const saved = formIdRef.current
      ? await whatsappFormApi.update(formIdRef.current, body)
      : await whatsappFormApi.create(body);
    if (!formIdRef.current) {
      formIdRef.current = saved.id;
      setFormId(saved.id);
      navigate(`/whatsapp-forms/${saved.id}`, { replace: true });
    }
    setStatus(saved.status);
    return saved;
  };

  const saveDraft = async () => {
    if (!name.trim()) {
      setIssues(['Give the form a name before saving.']);
      return;
    }
    setBusy('save');
    setIssues([]);
    try {
      await save();
      setNotice('Draft saved');
    } catch (err) {
      setIssues([err instanceof Error ? err.message : 'Could not save the form']);
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const problems = draftIssues(definition, name);
    if (problems.length) {
      setIssues(problems);
      return;
    }
    if (!sessionId) {
      setIssues(['Choose the Cloud API WhatsApp number that will publish this form.']);
      return;
    }
    setBusy('publish');
    setIssues([]);
    setNotice(null);
    try {
      const saved = await save();
      const result = await whatsappFormApi.publish(saved.id, sessionId);
      if (result.published) {
        setStatus('published');
        setNotice('Published. Customers can now receive this form.');
      } else {
        setStatus('draft');
        setIssues(result.errors.length ? result.errors : ['Meta rejected the form.']);
      }
    } catch (err) {
      setIssues([err instanceof Error ? err.message : 'Could not publish the form']);
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return (
      <div className="wf-page">
        <p className="wf-error" role="alert">{loadError}</p>
        <Link to="/whatsapp-forms">Back to WhatsApp Forms</Link>
      </div>
    );
  }

  return (
    <div className="wf-page">
      <Link to="/whatsapp-forms" className="wf-back">
        <ArrowLeft size={14} /> WhatsApp Forms
      </Link>
      <PageHeader
        title={formId ? 'Edit form' : 'Create form'}
        subtitle="1. Name your form → 2. Add screens & components → 3. Save as draft, or Publish to go live"
        actions={
          <div className="wf-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/whatsapp-forms')}>
              Cancel
            </button>
            <button type="button" className="btn btn-secondary" onClick={saveDraft} disabled={busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className="btn btn-primary" onClick={publish} disabled={busy !== null}>
              {busy === 'publish' ? 'Publishing…' : 'Publish →'}
            </button>
          </div>
        }
      />

      <section className="wf-panel wf-flowbar" aria-label="Form settings">
        <label className="wf-field wf-grow">
          <span>Flow name</span>
          <input value={name} maxLength={200} placeholder="Name your form…" onChange={e => { setName(e.target.value); setStatus('draft'); }} />
        </label>
        <label className="wf-field">
          <span>Category</span>
          <select value={category} onChange={e => { setCategory(e.target.value as FlowCategory); setStatus('draft'); }}>
            {FLOW_CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          <span>Publish from</span>
          <select value={sessionId} onChange={e => setSessionId(e.target.value)} disabled={!cloudSessions.length}>
            {cloudSessions.length === 0 && <option value="">No Cloud API number</option>}
            {cloudSessions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div className="wf-flowbar-hint">
          <span className={`wf-status wf-status-${status}`}>{status === 'published' ? 'Live' : 'Draft'}</span>
          <span><strong>Save</strong> keeps it a draft. <strong>Publish</strong> makes it live.</span>
        </div>
      </section>

      {(issues.length > 0 || notice) && (
        <div className={issues.length ? 'wf-alert wf-alert-error' : 'wf-alert wf-alert-ok'} role={issues.length ? 'alert' : 'status'}>
          {issues.length ? (
            <ul>{issues.map(i => <li key={i}>{i}</li>)}</ul>
          ) : (
            notice
          )}
        </div>
      )}

      <div className="wf-columns">
        <section className="wf-panel" aria-label="Screens">
          <header className="wf-panel-head">
            <h3>Screens</h3>
            <button type="button" className="btn btn-secondary" onClick={addScreen} aria-label="Add screen">
              <Plus size={14} />
            </button>
          </header>
          <ul className="wf-screen-list">
            {screens.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`wf-screen-item${s.id === screen?.id ? ' is-active' : ''}`}
                  aria-current={s.id === screen?.id}
                  onClick={() => { setScreenId(s.id); setComponentId(null); }}
                >
                  <strong>{s.title || `Screen ${i + 1}`}</strong>
                  <small>{s.components.length} {s.components.length === 1 ? 'component' : 'components'}</small>
                </button>
              </li>
            ))}
          </ul>
          {screen && (
            <div className="wf-screen-editor">
              <label className="wf-field">
                <span>Screen title</span>
                <input maxLength={30} value={screen.title} onChange={e => updateScreen({ title: e.target.value })} />
              </label>
              <div className="wf-inspector-actions">
                <button type="button" className="btn btn-secondary" onClick={() => moveScreen(-1)} disabled={screenIndex === 0} aria-label="Move screen up">
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => moveScreen(1)} disabled={screenIndex >= screens.length - 1} aria-label="Move screen down">
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="btn btn-danger" onClick={removeScreen} disabled={screens.length === 1}>
                  <Trash2 size={14} /> Delete screen
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="wf-canvas" aria-label="Preview">
          <FormPreview
            screen={screen}
            isLast={screenIndex === screens.length - 1}
            selectedId={componentId}
            onSelect={setComponentId}
          />
          <p className="wf-help wf-center">Click a component in the preview to edit it.</p>
        </section>

        <aside className="wf-side">
          {component && (
            <ComponentInspector
              component={component}
              canMoveUp={componentIndex > 0}
              canMoveDown={componentIndex < (screen?.components.length ?? 0) - 1}
              onChange={patchComponent}
              onMove={moveComponent}
              onRemove={removeComponent}
            />
          )}

          <section className="wf-panel" aria-label="Add components">
            <header className="wf-panel-head"><h3>Add Components</h3></header>
            <div className="wf-palette">
              {PALETTE.map(p => (
                <button key={p.kind} type="button" className="wf-palette-item" onClick={() => addComponent(p.kind)}>
                  <Plus size={14} /> {p.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {formId && status === 'published' && (
        <div className="wf-send-bar">
          <span>This form is live.</span>
          <button type="button" className="btn btn-primary" onClick={() => setSendOpen(true)}>
            <Send size={14} /> Send to a customer
          </button>
        </div>
      )}

      {sendOpen && formId && (
        <SendFormModal formId={formId} formName={name || 'Form'} sessions={cloudSessions} onClose={() => setSendOpen(false)} />
      )}
    </div>
  );
}
