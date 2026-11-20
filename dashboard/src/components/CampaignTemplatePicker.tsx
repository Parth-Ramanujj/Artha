import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { messageStudioApi, type Campaign } from '../services/api';
import type { StudioTemplate } from '../types/messageStudio';
import { HeaderImagePicker, type PickedImage } from './message-studio/HeaderImagePicker';
import { templatePrice } from '../utils/templatePricing';

export type CampaignMetaTemplate = NonNullable<NonNullable<Campaign['messageOptions']>['metaTemplate']>;

const muted = { fontSize: '0.8rem', color: 'var(--color-muted, #6b7280)' };
const keyOf = (t: StudioTemplate) => `${t.name}|${t.language}`;
const MEDIA_HEADERS = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;
type MediaHeader = (typeof MEDIA_HEADERS)[number];
const isMediaHeader = (f: string): f is MediaHeader => (MEDIA_HEADERS as readonly string[]).includes(f);
const usesName = (v: string) => /\{\{\s*name\s*\}\}/i.test(v);

/**
 * Lets a Cloud API campaign send an approved Meta template: pick it, fill its variables, choose the word
 * used when a recipient has no name, and add the header media/location and offer code it needs.
 * Reports the finished template, or null while plain text is used or the template is incomplete.
 */
export function CampaignTemplatePicker({
  sessionId,
  recipientsCount = 0,
  initialKey,
  lockTemplate = false,
  onChange,
}: {
  sessionId: string;
  /** Numbers typed so far, for the cost estimate. */
  recipientsCount?: number;
  /** "name|language" of the template to start with. */
  initialKey?: string;
  /** Hide the template dropdown (the caller already chose one). */
  lockTemplate?: boolean;
  onChange: (template: CampaignMetaTemplate | null, selected: boolean) => void;
}) {
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [key, setKey] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [headerParam, setHeaderParam] = useState('');
  const [fallback, setFallback] = useState('Sir/Madam');
  const [media, setMedia] = useState<PickedImage | null>(null);
  const [mediaId, setMediaId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [location, setLocation] = useState({ latitude: '', longitude: '', name: '', address: '' });
  const [coupon, setCoupon] = useState('');

  useEffect(() => {
    setKey('');
    setTemplates([]);
    if (!sessionId) return;
    messageStudioApi
      .templates(sessionId)
      .then(r => setTemplates((r.templates ?? []).filter(t => t.status === 'APPROVED' && !t.isCarousel)))
      .catch(() => setTemplates([]));
  }, [sessionId]);

  const selected = templates.find(t => keyOf(t) === key) ?? null;
  const names = selected?.bodyVariables ?? params.map((_, i) => String(i + 1));
  const headerFormat = selected?.headerFormat ?? 'NONE';
  const couponIndex = selected?.buttons.findIndex(b => b.type === 'COPY_CODE') ?? -1;
  const needsName = params.some(usesName) || usesName(headerParam);
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const locationOk = location.latitude !== '' && location.longitude !== '' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  useEffect(() => {
    if (!selected) return onChange(null, false);
    const complete =
      params.every(p => p.trim()) &&
      (!selected.headerVariable || Boolean(headerParam.trim())) &&
      (!isMediaHeader(headerFormat) || Boolean(mediaId)) &&
      (headerFormat !== 'LOCATION' || locationOk) &&
      (couponIndex < 0 || /^[A-Za-z0-9_-]{1,15}$/.test(coupon)) &&
      (!needsName || Boolean(fallback.trim()));
    onChange(
      complete
        ? {
            name: selected.name,
            category: selected.category.toLowerCase(),
            language: selected.language,
            bodyParams: params.map(p => p.trim()),
            ...(selected.parameterFormat === 'NAMED' ? { paramNames: names } : {}),
            ...(selected.headerVariable
              ? {
                  headerParam: headerParam.trim(),
                  ...(selected.parameterFormat === 'NAMED' ? { headerParamName: selected.headerVariable } : {}),
                }
              : {}),
            ...(needsName ? { nameFallback: fallback.trim() } : {}),
            ...(isMediaHeader(headerFormat)
              ? {
                  headerMedia: {
                    type: headerFormat.toLowerCase() as 'image' | 'video' | 'document',
                    id: mediaId,
                    ...(headerFormat === 'DOCUMENT' && media ? { filename: media.filename } : {}),
                  },
                }
              : {}),
            ...(headerFormat === 'LOCATION'
              ? {
                  headerLocation: {
                    latitude: lat,
                    longitude: lng,
                    ...(location.name.trim() ? { name: location.name.trim() } : {}),
                    ...(location.address.trim() ? { address: location.address.trim() } : {}),
                  },
                }
              : {}),
            ...(couponIndex >= 0 ? { couponCode: coupon, couponIndex } : {}),
          }
        : null,
      true,
    );
    // onChange is the parent's setter pair; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, params, headerParam, fallback, mediaId, location, coupon]);

  const choose = (k: string) => {
    setKey(k);
    setMedia(null);
    setMediaId('');
    setCoupon('');
    setHeaderParam('');
    const t = templates.find(x => keyOf(x) === k);
    // The first variable is usually the person's name, so start it as {{name}}.
    setParams(Array.from({ length: t?.bodyVariableCount ?? 0 }, (_, i) => (i === 0 ? '{{name}}' : '')));
  };

  // Opened from the templates page ("Send to many"/"Send test"): start with that template chosen.
  useEffect(() => {
    if (initialKey && !key && templates.some(t => keyOf(t) === initialKey)) choose(initialKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, initialKey]);

  const pickMedia = async (picked: PickedImage | null) => {
    setMedia(picked);
    setMediaId('');
    setUploadError('');
    if (!picked) return;
    setUploading(true);
    try {
      const { base64, mimetype, filename } = picked;
      const res = await messageStudioApi.uploadImage({ sessionId, base64, mimetype, filename });
      setMediaId(res.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (templates.length === 0) return null;

  const fillPreview = (text: string, values: string[], keys: string[]) =>
    text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k: string) => {
      const v = values[keys.indexOf(k)]?.trim();
      return v ? v.replace(/\{\{\s*name\s*\}\}/gi, 'Ravi') : m;
    });
  const price = selected ? templatePrice(selected.category, recipientsCount) : null;

  return (
    <div className="form-group">
      {!lockTemplate && (
        <>
          <label className="form-label" htmlFor="campaign-meta-template">
            Approved WhatsApp template
          </label>
          <select id="campaign-meta-template" className="form-select" value={key} onChange={e => choose(e.target.value)}>
            <option value="">None — plain text (only reaches people who messaged you in the last 24 hours)</option>
            {templates.map(t => (
              <option key={keyOf(t)} value={keyOf(t)}>
                {t.name} · {t.language} · {t.category.toLowerCase()} · {templatePrice(t.category).perMessage}
              </option>
            ))}
          </select>
          {!selected && <span style={muted}>To message new people, pick an approved template.</span>}
        </>
      )}

      {selected && price && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          <div style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', fontSize: '0.85rem' }}>
            <strong>Cost: {price.perMessage}</strong>
            {price.total && <> · {price.total}</>}
            <div style={muted}>{price.free} Approx. Meta rate for +91 numbers.</div>
          </div>

          {isMediaHeader(headerFormat) && (
            <div>
              <HeaderImagePicker
                kind={headerFormat}
                value={media}
                onChange={p => void pickMedia(p)}
                label={`Header ${headerFormat === 'DOCUMENT' ? 'PDF' : headerFormat.toLowerCase()} *`}
                labelClassName="form-label"
              />
              {uploading && (
                <span style={muted}>
                  <Loader2 size={13} className="animate-spin" /> Uploading to WhatsApp…
                </span>
              )}
              {mediaId && (
                <span style={{ ...muted, color: 'var(--color-success, #16a34a)' }}>
                  <CheckCircle2 size={13} /> Ready
                </span>
              )}
              {uploadError && <span style={{ ...muted, color: 'var(--color-danger, #dc2626)' }}>{uploadError}</span>}
            </div>
          )}

          {headerFormat === 'LOCATION' && (
            <fieldset style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '0.75rem' }}>
              <legend className="form-label">Header location *</legend>
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                {(['latitude', 'longitude', 'name', 'address'] as const).map(f => (
                  <input
                    key={f}
                    className="form-input"
                    aria-label={f}
                    inputMode={f === 'latitude' || f === 'longitude' ? 'decimal' : undefined}
                    placeholder={{ latitude: 'Latitude, e.g. 23.0225', longitude: 'Longitude, e.g. 72.5714', name: 'Place name', address: 'Address' }[f]}
                    value={location[f]}
                    onChange={e => setLocation(l => ({ ...l, [f]: e.target.value }))}
                  />
                ))}
              </div>
              <span style={muted}>Tip: in Google Maps, right-click the place to copy its latitude and longitude.</span>
            </fieldset>
          )}

          {selected.headerVariable && (
            <label className="form-label" style={{ fontWeight: 400 }}>
              Header {`{{${selected.headerVariable}}}`} *
              <input className="form-input" value={headerParam} onChange={e => setHeaderParam(e.target.value)} />
            </label>
          )}

          {params.map((p, i) => (
            <label key={i} className="form-label" style={{ fontWeight: 400 }}>
              What goes in {`{{${names[i] ?? i + 1}}}`} *
              <input
                className="form-input"
                value={p}
                onChange={e => setParams(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
              />
              <span style={muted}>Type text, or {'{{name}}'} to use each person&apos;s name from the recipient list.</span>
            </label>
          ))}

          {needsName && (
            <label className="form-label" style={{ fontWeight: 400 }}>
              If someone has no name, write *
              <input className="form-input" value={fallback} onChange={e => setFallback(e.target.value)} />
              <span style={muted}>e.g. Sir/Madam, Friend, Agent ji</span>
            </label>
          )}

          {couponIndex >= 0 && (
            <label className="form-label" style={{ fontWeight: 400 }}>
              Offer code to copy *
              <input
                className="form-input"
                maxLength={15}
                placeholder="SAVE20"
                value={coupon}
                onChange={e => setCoupon(e.target.value.trim())}
              />
            </label>
          )}

          <div>
            <span className="form-label">Preview</span>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', padding: '0.75rem', borderRadius: 8, background: 'var(--color-surface-muted, rgba(37,211,102,0.08))' }}>
              {media && headerFormat === 'IMAGE' && (
                <img src={media.previewUrl} alt="" style={{ width: '100%', borderRadius: 6, marginBottom: 8 }} />
              )}
              {media && headerFormat !== 'IMAGE' && <div style={muted}>📎 {media.filename}</div>}
              {headerFormat === 'LOCATION' && <div style={muted}>📍 {location.name || 'Location'}</div>}
              {headerFormat === 'TEXT' && selected.headerText && (
                <strong style={{ display: 'block', marginBottom: 4 }}>
                  {fillPreview(selected.headerText, [headerParam], [selected.headerVariable ?? ''])}
                </strong>
              )}
              {fillPreview(selected.bodyText, params, names)}
              {selected.buttons.length > 0 && (
                <div style={{ ...muted, marginTop: 8 }}>
                  Buttons: {selected.buttons.map(b => b.text || 'Copy offer code').join(' · ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
