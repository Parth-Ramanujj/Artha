import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { messageStudioApi, workflowApi } from '../../services/api';
import type { StudioTemplate } from '../../types/messageStudio';
import { buildMetaTemplate, buttonReplyWorkflow, countBodyVariables, type MetaTemplateDraft } from '../../utils/metaTemplate';
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
  ['TEXT', 'Text'],
  ['IMAGE', 'Image'],
];

const STOP_FOOTER = 'Reply STOP to unsubscribe';

/** Builds a WhatsApp template with a live preview and submits it to Meta for approval. */
export function MetaTemplateForm({ sessionId, onClose, onSubmitted }: { sessionId: string; onClose: () => void; onSubmitted: () => void }) {
  const toast = useToast();
  const [image, setImage] = useState<PickedImage | null>(null);
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

  const varCount = countBodyVariables(draft.body);
  const built = buildMetaTemplate(sessionId, { ...draft, headerImage: image });
  const autoReplies = draft.buttons.filter(b => b.type === 'QUICK_REPLY' && b.text.trim() && b.autoReply.trim());

  const submit = useMutation({
    mutationFn: async () => {
      if (!built.ok) throw new Error(built.error);
      await messageStudioApi.createTemplate(built.value);
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
      toast.success('Sent to Meta for review', 'Approval usually takes a few minutes, at most 24 hours.');
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
          <button className="btn btn-primary" disabled={!built.ok || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? 'Submitting…' : 'Submit to Meta for approval'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="ms-form-grid">
            <label className="ms-field">
              <span className="ms-label">Template name *</span>
              <input
                className="ms-input"
                value={draft.name}
                placeholder="padosi_agent_invite"
                maxLength={512}
                onChange={e => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              />
              <span className="ms-muted">Only you see this. Spaces become _.</span>
            </label>
            <label className="ms-field">
              <span className="ms-label">Language *</span>
              <select className="ms-input" value={draft.language} onChange={e => set('language', e.target.value)}>
                {LANGUAGES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ms-field">
              <span className="ms-label">Type *</span>
              <select className="ms-input" value={draft.category} onChange={e => set('category', e.target.value as MetaTemplateDraft['category'])}>
                <option value="MARKETING">Marketing — offers, invitations</option>
                <option value="UTILITY">Utility — orders, reminders</option>
              </select>
            </label>
          </div>

          <div className="ms-field" role="radiogroup" aria-label="Header">
            <span className="ms-label">Header</span>
            <div className="ms-tabs">
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
          </div>
          {draft.headerType === 'TEXT' && (
            <input
              className="ms-input"
              aria-label="Header text"
              placeholder="Bold title at the top (max 60)"
              maxLength={60}
              value={draft.headerText}
              onChange={e => set('headerText', e.target.value)}
            />
          )}
          {draft.headerType === 'IMAGE' && (
            <HeaderImagePicker
              value={image}
              onChange={setImage}
              label="Sample image for Meta's review"
              hint="JPG or PNG, up to 5 MB. You can send a different image with each campaign."
            />
          )}

          <label className="ms-field">
            <span className="ms-label">Message *</span>
            <textarea className="ms-input" rows={8} maxLength={1024} value={draft.body} onChange={e => set('body', e.target.value)} />
            <span className="ms-row" style={{ justifyContent: 'space-between' }}>
              <button className="btn-link" onClick={() => set('body', `${draft.body}{{${varCount + 1}}}`)}>
                + Insert placeholder {`{{${varCount + 1}}}`} (e.g. customer name)
              </button>
              <span className="ms-muted">{draft.body.length}/1024 · *bold* _italic_</span>
            </span>
          </label>

          {varCount > 0 && (
            <div className="ms-form-grid">
              {Array.from({ length: varCount }, (_, i) => (
                <label key={i} className="ms-field">
                  <span className="ms-label">Example for {`{{${i + 1}}}`} *</span>
                  <input
                    className="ms-input"
                    value={draft.bodyExamples[i] ?? ''}
                    placeholder={i === 0 ? 'Rahul' : 'example value'}
                    onChange={e => set('bodyExamples', Object.assign([...draft.bodyExamples], { [i]: e.target.value }))}
                  />
                </label>
              ))}
              <span className="ms-muted">Meta needs an example to review the template. Customers get real values.</span>
            </div>
          )}

          <label className="ms-field">
            <span className="ms-label">Footer (optional)</span>
            <input className="ms-input" value={draft.footer} maxLength={60} onChange={e => set('footer', e.target.value)} />
            {draft.category === 'MARKETING' && draft.footer !== STOP_FOOTER && (
              <button className="btn-link" style={{ alignSelf: 'flex-start' }} onClick={() => set('footer', STOP_FOOTER)}>
                + Add “{STOP_FOOTER}” (keeps your number&apos;s quality high)
              </button>
            )}
          </label>

          <MetaTemplateButtons buttons={draft.buttons} onChange={b => set('buttons', b)} />

          {!built.ok && (draft.name || draft.body) && (
            <p className="ms-field-error" role="status">
              {built.error}
            </p>
          )}
        </div>

        <div>
          <span className="ms-label">Preview</span>
          <WhatsAppPreview
            kind="template"
            content={{ template: { name: draft.name, language: draft.language, variables: draft.bodyExamples } }}
            products={[]}
            template={preview}
          />
          {image && draft.headerType === 'IMAGE' && <p className="ms-muted">Image: {image.filename}</p>}
        </div>
      </div>
    </Modal>
  );
}
