import { useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { messageStudioApi, workflowApi } from '../../services/api';
import type { StudioTemplate } from '../../types/messageStudio';
import {
  buildMetaTemplate,
  buttonReplyWorkflow,
  countBodyVariables,
  templateChecklist,
  type MetaTemplateDraft,
} from '../../utils/metaTemplate';
import { templatePrice } from '../../utils/templatePricing';
import { HeaderImagePicker, type PickedImage } from './HeaderImagePicker';
import { MetaTemplateButtons } from './MetaTemplateButtons';
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

const HEADER_TYPES: Array<[MetaTemplateDraft['headerType'], string]> = [
  ['NONE', 'No header'],
  ['TEXT', 'Title text'],
  ['IMAGE', 'Image'],
];

const STOP_FOOTER = 'Reply STOP to unsubscribe';

function Step({ n, title, optional, done, children }: { n: number; title: string; optional?: boolean; done?: boolean; children: ReactNode }) {
  return (
    <section className="mt-card" aria-labelledby={`mt-step-${n}`}>
      <div className="mt-card-head">
        <span className={`mt-step ${done ? 'is-done' : ''}`} aria-hidden="true">
          {done ? '✓' : n}
        </span>
        <h3 id={`mt-step-${n}`} className="mt-card-title">
          {title} {optional && <span className="mt-optional">optional</span>}
        </h3>
      </div>
      {children}
    </section>
  );
}

/** Builds a WhatsApp template step by step, with a live preview, and submits it to Meta for approval. */
export function MetaTemplateForm({ sessionId, onClose, onSubmitted }: { sessionId: string; onClose: () => void; onSubmitted: () => void }) {
  const toast = useToast();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [testPhone, setTestPhone] = useState<string | null>(null);
  const [draft, setDraft] = useState<MetaTemplateDraft>({
    name: '',
    language: 'en',
    category: 'MARKETING',
    headerType: 'NONE',
    headerText: '',
    headerImage: null,
    body: '',
    bodyExamples: [],
    footer: '',
    buttons: [],
  });
  const set = <K extends keyof MetaTemplateDraft>(key: K, value: MetaTemplateDraft[K]) => setDraft(d => ({ ...d, [key]: value }));

  // The last test number used is remembered on the server; start with it.
  const saved = useQuery({ queryKey: ['message-studio', 'auto-tests'], queryFn: messageStudioApi.autoTests });
  const phone = (testPhone ?? saved.data?.testPhone ?? '').trim();
  const phoneOk = !phone || /^\+?\d{10,15}$/.test(phone.replace(/[\s-]/g, ''));

  const full = { ...draft, headerImage: image };
  const varCount = countBodyVariables(draft.body);
  const checklist = [...templateChecklist(full), ...(phoneOk ? [] : [{ label: 'Valid test number', done: false }])];
  const built = buildMetaTemplate(sessionId, full);
  const ready = built.ok && phoneOk;
  const price = templatePrice(draft.category);
  const autoReplies = draft.buttons.filter(b => b.type === 'QUICK_REPLY' && b.text.trim() && b.autoReply.trim());

  const submit = useMutation({
    mutationFn: async () => {
      if (!built.ok) throw new Error(built.error);
      await messageStudioApi.createTemplate({ ...built.value, ...(phone ? { autoTestPhone: phone } : {}) });
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
        'Sent to Meta for review',
        phone
          ? `We'll send it to ${phone} as soon as it's approved — only if that is free.`
          : 'Approval usually takes a few minutes, at most 24 hours.',
      );
      if (failed.length) toast.error('Some auto-replies were not set up', `Set them in Workflows: ${failed.join(', ')}`);
      onSubmitted();
    },
    onError: (e: Error) => toast.error('Meta did not accept the template', e.message),
  });

  const preview: StudioTemplate = {
    name: draft.name,
    language: draft.language,
    status: 'DRAFT',
    category: draft.category,
    bodyText: draft.body || 'Your message will appear here…',
    bodyVariableCount: varCount,
    headerFormat: draft.headerType,
    headerText: draft.headerText,
    footerText: draft.footer,
    buttons: draft.buttons.map(b => ({ type: b.type, text: b.text || 'Button' })),
    isCarousel: false,
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New WhatsApp template"
      className="ms-modal-wide"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Back
          </button>
          <button className="btn btn-primary" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? 'Submitting…' : 'Submit to Meta for approval'}
          </button>
        </>
      }
    >
      <div className="mt-layout">
        <div className="mt-steps">
          <Step n={1} title="Name, language and type" done={/^[a-z0-9_]+$/.test(draft.name)}>
            <div className="ms-form-grid">
              <label className="ms-field">
                <span className="ms-label">Template name</span>
                <input
                  className="ms-input"
                  value={draft.name}
                  placeholder="padosi_agent_invite"
                  maxLength={512}
                  onChange={e => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                />
              </label>
              <label className="ms-field">
                <span className="ms-label">Language</span>
                <select className="ms-input" value={draft.language} onChange={e => set('language', e.target.value)}>
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ms-field">
                <span className="ms-label">Type</span>
                <select className="ms-input" value={draft.category} onChange={e => set('category', e.target.value as MetaTemplateDraft['category'])}>
                  <option value="MARKETING">Marketing — offers, invitations</option>
                  <option value="UTILITY">Utility — orders, reminders</option>
                </select>
              </label>
            </div>
            <p className="mt-help">Only you see the name. Customers never see it.</p>
          </Step>

          <Step n={2} title="Header" optional done={draft.headerType !== 'NONE' && (draft.headerType === 'TEXT' ? Boolean(draft.headerText.trim()) : Boolean(image))}>
            <div className="ms-tabs" role="radiogroup" aria-label="Header type">
              {HEADER_TYPES.map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={draft.headerType === value}
                  className={`ms-tab ${draft.headerType === value ? 'is-active' : ''}`}
                  onClick={() => set('headerType', value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {draft.headerType === 'TEXT' && (
              <input
                className="ms-input"
                aria-label="Header text"
                placeholder="A bold title shown at the top (max 60 letters)"
                maxLength={60}
                value={draft.headerText}
                onChange={e => set('headerText', e.target.value)}
              />
            )}
            {draft.headerType === 'IMAGE' && (
              <HeaderImagePicker
                value={image}
                onChange={setImage}
                label="Image"
                hint="JPG or PNG, up to 5 MB. Meta reviews this sample; each campaign can use its own image."
              />
            )}
          </Step>

          <Step n={3} title="Message" done={Boolean(draft.body.trim()) && built.ok}>
            <textarea
              className="ms-input"
              rows={8}
              maxLength={1024}
              aria-label="Message"
              placeholder={'👋 Namaste {{1}}!\n\nWrite what the customer will read…'}
              value={draft.body}
              onChange={e => set('body', e.target.value)}
            />
            <div className="mt-toolbar">
              <button className="mt-chip" onClick={() => set('body', `${draft.body}{{${varCount + 1}}}`)}>
                <Plus size={13} /> Add a value that changes per person
              </button>
              <span className="mt-counter">
                {draft.body.length}/1024 · *bold* · _italic_
              </span>
            </div>
            {varCount > 0 && (
              <>
                <p className="mt-help">Meta needs an example for each {'{{n}}'} to approve it. Customers get their own values.</p>
                <div className="ms-form-grid">
                  {Array.from({ length: varCount }, (_, i) => (
                    <label key={i} className="ms-field">
                      <span className="ms-label">Example for {`{{${i + 1}}}`}</span>
                      <input
                        className="ms-input"
                        value={draft.bodyExamples[i] ?? ''}
                        placeholder={i === 0 ? 'Rahul' : 'example'}
                        onChange={e => set('bodyExamples', Object.assign([...draft.bodyExamples], { [i]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
          </Step>

          <Step n={4} title="Footer" optional done={Boolean(draft.footer.trim())}>
            <input
              className="ms-input"
              aria-label="Footer"
              placeholder="Small grey line at the bottom (max 60 letters)"
              value={draft.footer}
              maxLength={60}
              onChange={e => set('footer', e.target.value)}
            />
            {draft.category === 'MARKETING' && draft.footer !== STOP_FOOTER && (
              <div>
                <button className="mt-chip" onClick={() => set('footer', STOP_FOOTER)}>
                  <Plus size={13} /> Use “{STOP_FOOTER}”
                </button>
              </div>
            )}
          </Step>

          <MetaTemplateButtons buttons={draft.buttons} onChange={b => set('buttons', b)} />

          <Step n={6} title="Test on my phone after approval" optional done={Boolean(phone) && phoneOk}>
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
              have messaged your WhatsApp number in the last 24 hours. So send “hi” from it first. If the window is closed,
              nothing is sent and you&apos;ll see why in the templates list.
            </p>
          </Step>
        </div>

        <aside className="mt-side" aria-label="Preview and checklist">
          <WhatsAppPreview
            kind="template"
            content={{ template: { name: draft.name, language: draft.language, variables: draft.bodyExamples } }}
            products={[]}
            template={preview}
          />
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
