import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { messageStudioApi, type Campaign } from '../services/api';
import type { StudioTemplate } from '../types/messageStudio';
import { HeaderImagePicker, type PickedImage } from './message-studio/HeaderImagePicker';

export type CampaignMetaTemplate = NonNullable<NonNullable<Campaign['messageOptions']>['metaTemplate']>;

const muted = { fontSize: '0.8rem', color: 'var(--color-muted, #6b7280)' };
const keyOf = (t: StudioTemplate) => `${t.name}|${t.language}`;

/**
 * Lets a Cloud API campaign send an approved Meta template: pick it, fill its placeholders, choose
 * the word used when a recipient has no name, and add the header image the template needs.
 * Reports the finished template, or null while plain text is used or the template is incomplete.
 */
export function CampaignTemplatePicker({
  sessionId,
  onChange,
}: {
  sessionId: string;
  onChange: (template: CampaignMetaTemplate | null, selected: boolean) => void;
}) {
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [key, setKey] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [fallback, setFallback] = useState('Sir/Madam');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [imageId, setImageId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    setKey('');
    setTemplates([]);
    if (!sessionId) return;
    messageStudioApi
      .templates(sessionId)
      // Only kinds a campaign can fill in: no carousels, no video/document headers.
      .then(r =>
        setTemplates(
          (r.templates ?? []).filter(
            t => t.status === 'APPROVED' && !t.isCarousel && ['NONE', 'TEXT', 'IMAGE'].includes(t.headerFormat),
          ),
        ),
      )
      .catch(() => setTemplates([]));
  }, [sessionId]);

  const selected = templates.find(t => keyOf(t) === key) ?? null;
  const usesName = params.some(p => /\{\{\s*name\s*\}\}/i.test(p));
  const needsImage = selected?.headerFormat === 'IMAGE';

  useEffect(() => {
    if (!selected) return onChange(null, false);
    const complete = params.every(p => p.trim()) && (!needsImage || Boolean(imageId)) && (!usesName || Boolean(fallback.trim()));
    onChange(
      complete
        ? {
            name: selected.name,
            language: selected.language,
            bodyParams: params.map(p => p.trim()),
            ...(usesName ? { nameFallback: fallback.trim() } : {}),
            ...(needsImage ? { headerImageId: imageId } : {}),
          }
        : null,
      true,
    );
    // onChange is the parent's setter pair; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, params, fallback, imageId, needsImage, usesName]);

  const choose = (k: string) => {
    setKey(k);
    setImage(null);
    setImageId('');
    const t = templates.find(x => keyOf(x) === k);
    // The first placeholder is usually the person's name, so start it as {{name}}.
    setParams(Array.from({ length: t?.bodyVariableCount ?? 0 }, (_, i) => (i === 0 ? '{{name}}' : '')));
  };

  const pickImage = async (picked: PickedImage | null) => {
    setImage(picked);
    setImageId('');
    setUploadError('');
    if (!picked) return;
    setUploading(true);
    try {
      const { base64, mimetype, filename } = picked;
      const res = await messageStudioApi.uploadImage({ sessionId, base64, mimetype, filename });
      setImageId(res.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (templates.length === 0) return null;

  const preview = selected?.bodyText.replace(/\{\{(\d+)\}\}/g, (m, n: string) => {
    const v = params[Number(n) - 1]?.trim();
    return v ? v.replace(/\{\{\s*name\s*\}\}/gi, 'Ravi') : m;
  });

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="campaign-meta-template">
        Approved WhatsApp template
      </label>
      <select id="campaign-meta-template" className="form-select" value={key} onChange={e => choose(e.target.value)}>
        <option value="">None — plain text (only reaches people who messaged you in the last 24 hours)</option>
        {templates.map(t => (
          <option key={keyOf(t)} value={keyOf(t)}>
            {t.name} · {t.language} · {t.category.toLowerCase()}
          </option>
        ))}
      </select>
      {!selected && <span style={muted}>To message new people, pick an approved template.</span>}

      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          {needsImage && (
            <div>
              <HeaderImagePicker
                value={image}
                onChange={p => void pickImage(p)}
                label="Header image *"
                labelClassName="form-label"
                hint="This image is sent at the top of the message. JPG or PNG, up to 5 MB."
              />
              {uploading && (
                <span style={muted}>
                  <Loader2 size={13} className="animate-spin" /> Uploading to WhatsApp…
                </span>
              )}
              {imageId && (
                <span style={{ ...muted, color: 'var(--color-success, #16a34a)' }}>
                  <CheckCircle2 size={13} /> Image ready
                </span>
              )}
              {uploadError && <span style={{ ...muted, color: 'var(--color-danger, #dc2626)' }}>{uploadError}</span>}
            </div>
          )}

          {params.map((p, i) => (
            <label key={i} className="form-label" style={{ fontWeight: 400 }}>
              What goes in {`{{${i + 1}}}`} *
              <input
                className="form-input"
                value={p}
                onChange={e => setParams(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
              />
              <span style={muted}>
                Type text, or {'{{name}}'} to use each person&apos;s name from the recipient list.
              </span>
            </label>
          ))}

          {usesName && (
            <label className="form-label" style={{ fontWeight: 400 }}>
              If someone has no name, write *
              <input className="form-input" value={fallback} onChange={e => setFallback(e.target.value)} />
              <span style={muted}>e.g. Sir/Madam, Friend, Agent ji</span>
            </label>
          )}

          <div>
            <span className="form-label">Preview</span>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.85rem',
                padding: '0.75rem',
                borderRadius: 8,
                background: 'var(--color-surface-muted, rgba(37,211,102,0.08))',
              }}
            >
              {image && <img src={image.previewUrl} alt="" style={{ width: '100%', borderRadius: 6, marginBottom: 8 }} />}
              {selected.headerFormat === 'TEXT' && selected.headerText && (
                <strong style={{ display: 'block', marginBottom: 4 }}>{selected.headerText}</strong>
              )}
              {preview}
              {selected.buttons.length > 0 && (
                <div style={{ ...muted, marginTop: 8 }}>Buttons: {selected.buttons.map(b => b.text).join(' · ')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
