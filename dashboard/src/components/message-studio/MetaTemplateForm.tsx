import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bell, CheckCircle2, Circle, Code, Plus, Smile, Strikethrough, Bold, Italic } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { messageStudioApi, workflowApi } from '../../services/api';
import type { MetaHeaderFormat, StudioTemplate } from '../../types/messageStudio';
import {
  buildMetaTemplate,
  buttonReplyWorkflow,
  nextVariable,
  templateChecklist,
  templateVariables,
  type MetaTemplateDraft,
} from '../../utils/metaTemplate';
import { templatePrice } from '../../utils/templatePricing';
import { HeaderImagePicker, type PickedImage } from './HeaderImagePicker';
import { MetaTemplateButtons } from './MetaTemplateButtons';
import { TemplateAiAdvice } from './TemplateAiAdvice';
import { WhatsAppPreview } from './WhatsAppPreview';

const LANGUAGES = [
  ['en', 'English'],
  ['en_US', 'English (US)'],
  ['hi', 'Hindi'],
  ['gu', 'Gujarati'],
  ['mr', 'Marathi'],
  ['bn', 'Bengali'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['kn', 'Kannada'],
  ['ml', 'Malayalam'],
  ['pa', 'Punjabi'],
] as const;

const MEDIA_OPTIONS: Array<[MetaHeaderFormat, string]> = [
  ['NONE', 'None'],
  ['IMAGE', 'Image'],
  ['VIDEO', 'Video'],
  ['DOCUMENT', 'Document'],
  ['LOCATION', 'Location'],
];

const VALIDITY = [
  [30, '30 seconds'],
  [60, '1 minute'],
  [300, '5 minutes'],
  [600, '10 minutes'],
  [1800, '30 minutes'],
  [3600, '1 hour'],
  [10800, '3 hours'],
  [21600, '6 hours'],
  [43200, '12 hours'],
] as const;

const EMOJIS = ['👋', '🙏', '😊', '🎉', '✅', '📢', '🔥', '💰', '🛡️', '📈', '🤝', '📞', '⭐', '🇮🇳', '👉', '❤️'];
const STOP_FOOTER = 'Reply STOP to unsubscribe';

function Card({ title, optional, children }: { title: string; optional?: boolean; children: ReactNode }) {
  return (
    <section className="mt-card">
      <h3 className="mt-card-title">
        {title} {optional && <span className="mt-optional">· Optional</span>}
      </h3>
      {children}
    </section>
  );
}

/** Builds a WhatsApp template like Meta's own builder, with a live preview, and submits it for approval. */
export function MetaTemplateForm({
  sessionId,
  initial,
  editTemplateId,
  onClose,
  onSubmitted,
}: {
  sessionId: string;
  /** Start from an existing template (e.g. "Fix and submit again"). */
  initial?: Partial<MetaTemplateDraft>;
  /** Edit this existing Meta template in place (name, language and category are locked). */
  editTemplateId?: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [media, setMedia] = useState<PickedImage | null>(null);
  const [testPhone, setTestPhone] = useState<string | null>(null);
  const [draft, setDraft] = useState<MetaTemplateDraft>({
    name: '',
    language: 'en',
    category: 'MARKETING',
    variableType: 'NUMBER',
    headerType: 'NONE',
    headerText: '',
    headerExample: '',
    headerMedia: null,
    body: '',
    bodyExamples: [],
    footer: '',
    buttons: [],
    ttlSeconds: null,
    ...initial,
  });
  const set = <K extends keyof MetaTemplateDraft>(key: K, value: MetaTemplateDraft[K]) => setDraft(d => ({ ...d, [key]: value }));

  // The last test number used is remembered on the server; start with it.
  const saved = useQuery({ queryKey: ['message-studio', 'auto-tests'], queryFn: messageStudioApi.autoTests });
  const phone = (testPhone ?? saved.data?.testPhone ?? '').trim();
  const phoneOk = !phone || /^\+?\d{10,15}$/.test(phone.replace(/[\s-]/g, ''));

  const full = { ...draft, headerMedia: media };
  const vars = templateVariables(draft.body, draft.variableType);
  const headerVars = draft.headerType === 'TEXT' ? templateVariables(draft.headerText, draft.variableType) : [];
  const checklist = [...templateChecklist(full), ...(phoneOk ? [] : [{ label: 'Valid test number', done: false }])];
  const built = buildMetaTemplate(sessionId, full);
  const ready = built.ok && phoneOk;
  const price = templatePrice(draft.category);
  const autoReplies = draft.buttons.filter(b => b.type === 'QUICK_REPLY' && b.text.trim() && b.autoReply.trim());

  /** Wraps the selected body text (or inserts at the cursor), like Meta's formatting toolbar. */
  const wrap = (before: string, after = before) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const next = draft.body.slice(0, start) + before + draft.body.slice(start, end) + after + draft.body.slice(end);
    set('body', next.slice(0, 1024));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!built.ok) throw new Error(built.error);
      if (editTemplateId) await messageStudioApi.editTemplate(editTemplateId, built.value);
      else await messageStudioApi.createTemplate({ ...built.value, ...(phone ? { autoTestPhone: phone } : {}) });
      // Auto-replies are best-effort: the template is already with Meta even if one of these fails.
      const failed: string[] = [];
      for (const b of autoReplies) {
        try {
          const wf = await workflowApi.create(buttonReplyWorkflow(draft.name, b.text.trim(), b.autoReply.trim()));
          await workflowApi.publish(wf.id);
        } catch {
          failed.push(b.text);
        }
      }
      return failed;
    },
    onSuccess: failed => {
      toast.success(
        editTemplateId ? 'Changes sent to Meta for review' : 'Sent to Meta for review',
        phone
          ? `We'll send it to ${phone} as soon as it's approved — only if that is free.`
          : 'Approval usually takes a few minutes, at most 24 hours.',
      );
      if (failed.length) toast.error('Some auto-replies were not set up', `Set them in Workflows: ${failed.join(', ')}`);
      onSubmitted();
    },
    onError: (e: Error) => toast.error('Meta did not accept the template', e.message),
  });

  const fill = (text: string, examples: string[], names: string[]) =>
    text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, key: string) => examples[names.indexOf(key)]?.trim() || m);
  const preview: StudioTemplate = {
    name: draft.name,
    language: draft.language,
    status: 'DRAFT',
    category: draft.category,
    bodyText: fill(draft.body, draft.bodyExamples, vars) || 'Your message will appear here…',
    bodyVariableCount: 0,
    headerFormat: draft.headerType,
    headerText: fill(draft.headerText, [draft.headerExample], headerVars),
    footerText: draft.footer,
    buttons: draft.buttons.map(b => ({ type: b.type, text: b.type === 'COPY_CODE' ? 'Copy offer code' : b.text || 'Button' })),
    isCarousel: false,
  };
  const languageLabel = LANGUAGES.find(([c]) => c === draft.language)?.[1] ?? draft.language;

  return (
    <Modal
      open
      onClose={onClose}
      title={editTemplateId ? `Edit template — ${draft.name}` : "New WhatsApp template"}
      className="ms-modal-wide"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Previous
          </button>
          <button className="btn btn-primary" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? 'Submitting…' : editTemplateId ? 'Submit changes for review' : 'Submit for review'}
          </button>
        </>
      }
    >
      <div className="mt-layout">
        <div className="mt-steps">
          {editTemplateId && (
            <p className="mt-edit-note">
              ✏️ Editing keeps the name and language. Meta reviews the change again — until it is approved, the last
              approved version keeps sending. Meta allows only a few edits (about one a day). Media headers need their
              sample chosen again.
            </p>
          )}
          <div className="mt-summary">
            <span className="mt-summary-icon" aria-hidden="true">
              <Bell size={18} />
            </span>
            <div>
              <strong>
                {draft.name || 'your_template_name'} • {languageLabel}
              </strong>
              <span className="mt-help">{draft.category === 'UTILITY' ? 'Utility' : 'Marketing'} • Default</span>
            </div>
          </div>

          <Card title="Template name and language">
            <div className="mt-row">
              <label className="ms-field mt-grow">
                <span className="ms-label">Name your template</span>
                <input
                  className="ms-input"
                  value={draft.name}
                  placeholder="Enter a template name"
                  maxLength={512}
                  disabled={Boolean(editTemplateId)}
                  onChange={e => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                />
                <span className="mt-counter">{draft.name.length}/512 · lowercase letters, numbers and _</span>
              </label>
              <label className="ms-field">
                <span className="ms-label">Select language</span>
                <select
                  className="ms-input"
                  value={draft.language}
                  disabled={Boolean(editTemplateId)}
                  onChange={e => set("language", e.target.value)}
                >
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ms-field">
                <span className="ms-label">Category</span>
                <select
                  className="ms-input"
                  value={draft.category}
                  disabled={Boolean(editTemplateId)}
                  onChange={e => setDraft(d => ({ ...d, category: e.target.value as MetaTemplateDraft['category'] }))}
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                </select>
              </label>
            </div>
            <details className="mt-guide">
              <summary>Marketing or Utility? How Meta decides</summary>
              <div className="mt-guide-grid">
                <div>
                  <strong>Utility ≈ ₹0.12</strong>
                  <p className="mt-help">
                    About something the customer already did or asked for: an order, booking, payment, registration,
                    appointment or request. No offers, no “join us”, no selling.
                  </p>
                  <p className="mt-guide-example">
                    “Hi {'{{1}}'}, your agent registration #{'{{2}}'} is approved. Log in to view your leads.”
                  </p>
                </div>
                <div>
                  <strong>Marketing ≈ ₹0.78</strong>
                  <p className="mt-help">
                    Anything that promotes, invites, offers a discount, announces something new or asks people to join
                    or buy — even to existing customers.
                  </p>
                  <p className="mt-guide-example">
                    “Hi {'{{1}}'}! Are you an insurance agent? Join पडोसीAgent and get customers near you.”
                  </p>
                </div>
              </div>
              <p className="mt-help">
                A “Utility” template with any promotion inside is changed to Marketing by Meta. Not sure? Use “Check with
                AI” below.
              </p>
            </details>
          </Card>

          <Card title="Content">
            <p className="mt-help">
              Add a header, body and footer for your template. Meta reviews the variables and content before approving it.
            </p>
            <div className="mt-row">
              <label className="ms-field">
                <span className="ms-label" title="Numbers: {{1}}, {{2}}. Names: {{first_name}} — easier to read.">
                  Type of variable ⓘ
                </span>
                <select
                  className="ms-input"
                  value={draft.variableType}
                  onChange={e => set('variableType', e.target.value as MetaTemplateDraft['variableType'])}
                >
                  <option value="NUMBER">Number — {'{{1}}'}</option>
                  <option value="NAME">Name — {'{{first_name}}'}</option>
                </select>
              </label>
              <label className="ms-field">
                <span className="ms-label">
                  Media sample <span className="mt-optional">· Optional</span>
                </span>
                <select
                  className="ms-input"
                  value={draft.headerType === 'TEXT' ? 'NONE' : draft.headerType}
                  onChange={e => {
                    const v = e.target.value as MetaHeaderFormat;
                    setMedia(null);
                    // "None" media keeps a text header the user already typed.
                    set('headerType', v === 'NONE' && draft.headerText.trim() ? 'TEXT' : v);
                  }}
                >
                  {MEDIA_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {(draft.headerType === 'IMAGE' || draft.headerType === 'VIDEO' || draft.headerType === 'DOCUMENT') && (
              <HeaderImagePicker
                kind={draft.headerType}
                value={media}
                onChange={setMedia}
                label="Sample for Meta's review"
              />
            )}
            {draft.headerType === 'LOCATION' && (
              <p className="mt-help">📍 A map pin is shown at the top. You choose the exact place when you send each campaign.</p>
            )}

            {(draft.headerType === 'NONE' || draft.headerType === 'TEXT') && (
              <label className="ms-field">
                <span className="ms-label">
                  Header <span className="mt-optional">· Optional</span>
                </span>
                <input
                  className="ms-input"
                  maxLength={60}
                  placeholder={`Add a short line of text to the header of your message in ${languageLabel}`}
                  value={draft.headerText}
                  onChange={e => setDraft(d => ({ ...d, headerText: e.target.value, headerType: e.target.value ? 'TEXT' : 'NONE' }))}
                />
                <div className="mt-toolbar">
                  <span className="mt-counter">{draft.headerText.length}/60</span>
                  <button
                    className="mt-tool"
                    disabled={headerVars.length > 0}
                    onClick={() =>
                      setDraft(d => ({
                        ...d,
                        headerType: 'TEXT',
                        headerText: `${d.headerText}${d.variableType === 'NAME' ? '{{first_name}}' : '{{1}}'}`,
                      }))
                    }
                  >
                    <Plus size={13} /> Add variable
                  </button>
                </div>
                {headerVars.length === 1 && (
                  <input
                    className="ms-input"
                    aria-label="Header variable sample"
                    placeholder={`Sample for {{${headerVars[0]}}}, e.g. Rahul`}
                    value={draft.headerExample}
                    onChange={e => set('headerExample', e.target.value)}
                  />
                )}
              </label>
            )}

            <label className="ms-field">
              <span className="ms-label">Body</span>
              <textarea
                ref={bodyRef}
                className="ms-input"
                rows={7}
                maxLength={1024}
                placeholder="Hello"
                value={draft.body}
                onChange={e => set('body', e.target.value)}
              />
            </label>
            <div className="mt-toolbar">
              <span className="mt-counter">{draft.body.length}/1024</span>
              <div className="mt-tools" role="toolbar" aria-label="Formatting">
                <div className="mt-menu-wrap">
                  <button className="mt-tool" aria-label="Emoji" onClick={() => setEmojiOpen(o => !o)}>
                    <Smile size={15} />
                  </button>
                  {emojiOpen && (
                    <div className="mt-menu mt-emoji" role="menu">
                      {EMOJIS.map(e => (
                        <button
                          key={e}
                          role="menuitem"
                          className="mt-tool"
                          onClick={() => {
                            wrap(e, '');
                            setEmojiOpen(false);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="mt-tool" aria-label="Bold" title="Bold" onClick={() => wrap('*')}>
                  <Bold size={15} />
                </button>
                <button className="mt-tool" aria-label="Italic" title="Italic" onClick={() => wrap('_')}>
                  <Italic size={15} />
                </button>
                <button className="mt-tool" aria-label="Strikethrough" title="Strikethrough" onClick={() => wrap('~')}>
                  <Strikethrough size={15} />
                </button>
                <button className="mt-tool" aria-label="Monospace" title="Monospace" onClick={() => wrap('```')}>
                  <Code size={15} />
                </button>
                <button className="mt-tool" onClick={() => wrap(nextVariable(draft.body, draft.variableType), '')}>
                  <Plus size={13} /> Add variable
                </button>
              </div>
            </div>

            {vars.length > 0 && (
              <div className="mt-samples">
                <span className="ms-label">Variable samples</span>
                <p className="mt-help">Meta needs an example for each variable to review it. Customers get their own values.</p>
                {vars.map((v, i) => (
                  <label key={v} className="mt-sample">
                    <code>{`{{${v}}}`}</code>
                    <input
                      className="ms-input"
                      value={draft.bodyExamples[i] ?? ''}
                      placeholder={i === 0 ? 'Rahul' : 'Sample value'}
                      onChange={e => set('bodyExamples', Object.assign([...draft.bodyExamples], { [i]: e.target.value }))}
                    />
                  </label>
                ))}
                {draft.variableType === 'NAME' && (
                  <p className="mt-help">Rename a variable by editing it in the body, e.g. {'{{variable_1}}'} → {'{{first_name}}'}.</p>
                )}
              </div>
            )}

            <label className="ms-field">
              <span className="ms-label">
                Footer <span className="mt-optional">· Optional</span>
              </span>
              <input
                className="ms-input"
                maxLength={60}
                placeholder={`Add a short line of text to the bottom of your message in ${languageLabel}`}
                value={draft.footer}
                onChange={e => set('footer', e.target.value)}
              />
              <div className="mt-toolbar">
                <span className="mt-counter">{draft.footer.length}/60</span>
                {draft.category === 'MARKETING' && draft.footer !== STOP_FOOTER && (
                  <button className="mt-tool" onClick={() => set('footer', STOP_FOOTER)}>
                    <Plus size={13} /> Use “{STOP_FOOTER}”
                  </button>
                )}
              </div>
            </label>
          </Card>

          <TemplateAiAdvice draft={draft} onApply={patch => setDraft(d => ({ ...d, ...patch }))} />

          <MetaTemplateButtons buttons={draft.buttons} category={draft.category} onChange={b => set('buttons', b)} />

          <Card title="Message validity period">
            {draft.category === 'UTILITY' ? (
              <>
                <p className="mt-help">
                  If the customer&apos;s phone is off or offline, WhatsApp keeps trying to deliver. Choose how long it
                  should keep trying. If it can&apos;t deliver in time, the message is dropped — the customer never sees
                  it and <strong>you are not charged</strong>. Useful for time-sensitive messages like OTPs or “your
                  appointment is in 30 minutes”.
                </p>
                <div className="mt-toolbar">
                  <label className="mt-switch">
                    <input
                      type="checkbox"
                      checked={draft.ttlSeconds !== null}
                      onChange={e => set('ttlSeconds', e.target.checked ? 600 : null)}
                    />
                    Set custom validity period for your message
                  </label>
                  {draft.ttlSeconds !== null && (
                    <select
                      className="ms-input"
                      aria-label="Validity period"
                      value={draft.ttlSeconds}
                      onChange={e => set('ttlSeconds', Number(e.target.value))}
                    >
                      {VALIDITY.map(([s, l]) => (
                        <option key={s} value={s}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {draft.ttlSeconds === null && (
                  <p className="mt-help">Off: WhatsApp&apos;s standard validity period applies.</p>
                )}
              </>
            ) : (
              <p className="mt-help">
                Only for Utility templates. Marketing messages use WhatsApp&apos;s standard validity period.
              </p>
            )}
          </Card>

          {!editTemplateId && (
          <Card title="Test on my phone after approval" optional>
            <input
              className="ms-input"
              aria-label="Test phone number"
              inputMode="tel"
              placeholder="6352701839"
              value={phone}
              onChange={e => setTestPhone(e.target.value)}
            />
            {!phoneOk && <span className="ms-field-error">Enter a mobile number, e.g. 6352701839.</span>}
            <p className="mt-help">
              When Meta approves it we send it here automatically — <strong>only if it&apos;s free</strong>: this number must
              have messaged your WhatsApp number in the last 24 hours. Send “hi” from it first.
            </p>
          </Card>
          )}
        </div>

        <aside className="mt-side" aria-label="Preview and checklist">
          <span className="ms-label">Template preview</span>
          <WhatsAppPreview
            kind="template"
            content={{ template: { name: draft.name, language: draft.language, variables: [] } }}
            products={[]}
            template={preview}
          />
          {media && <p className="mt-help">Header: {media.filename}</p>}
          {draft.headerType === 'LOCATION' && <p className="mt-help">Header: 📍 location</p>}
          <ul className="mt-checklist" aria-label="Before you submit">
            {checklist.map(item => (
              <li key={item.label} className={item.done ? 'is-done' : ''}>
                {item.done ? <CheckCircle2 size={15} color="var(--primary)" /> : <Circle size={15} />} {item.label}
              </li>
            ))}
          </ul>
          <div className="mt-price">
            <strong>Cost when you send it: {price.perMessage}</strong>
            <span>{price.free}</span>
            <span>Approx. Meta rate for +91 numbers.</span>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
