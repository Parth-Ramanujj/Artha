import { useId, useState } from 'react';
import { FileText, ImagePlus, Video, X } from 'lucide-react';
import { fileToBase64 } from '../../utils/messageStudio';
import type { StudioMediaMime } from '../../types/messageStudio';

export type HeaderMediaKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export interface PickedImage {
  base64: string;
  mimetype: StudioMediaMime;
  filename: string;
  previewUrl: string;
}

const MB = 1024 * 1024;
const KINDS: Record<HeaderMediaKind, { accept: StudioMediaMime[]; maxBytes: number; noun: string; hint: string }> = {
  IMAGE: {
    accept: ['image/jpeg', 'image/png'],
    maxBytes: 5 * MB,
    noun: 'image',
    hint: 'JPG or PNG, up to 5 MB. A wide image (about 1.91:1) looks best.',
  },
  VIDEO: { accept: ['video/mp4'], maxBytes: 16 * MB, noun: 'video', hint: 'MP4, up to 16 MB.' },
  DOCUMENT: { accept: ['application/pdf'], maxBytes: 16 * MB, noun: 'PDF', hint: 'PDF, up to 16 MB.' },
};

/** Picks the header image, video or PDF of a WhatsApp template, with a preview. */
export function HeaderImagePicker({
  value,
  onChange,
  kind = 'IMAGE',
  label = 'Header image',
  hint,
  labelClassName = 'ms-label',
}: {
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  kind?: HeaderMediaKind;
  label?: string;
  hint?: string;
  labelClassName?: string;
}) {
  const id = useId();
  const [error, setError] = useState('');
  const spec = KINDS[kind];

  const pick = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!(spec.accept as string[]).includes(file.type)) return setError(`Choose a ${spec.hint.split(',')[0]} file.`);
    if (file.size > spec.maxBytes) {
      return setError(`The ${spec.noun} is bigger than ${spec.maxBytes / MB} MB. Choose a smaller one.`);
    }
    try {
      onChange({
        base64: await fileToBase64(file),
        mimetype: file.type as StudioMediaMime,
        filename: file.name,
        previewUrl: URL.createObjectURL(file),
      });
    } catch {
      setError('Could not read that file. Try another one.');
    }
  };

  // Inline layout so the picker looks the same in Message Studio and on the Campaigns page.
  const muted = { fontSize: '0.8rem', color: 'var(--color-muted, #6b7280)' };
  const Icon = kind === 'VIDEO' ? Video : kind === 'DOCUMENT' ? FileText : ImagePlus;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <span className={labelClassName}>{label}</span>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {kind === 'IMAGE' ? (
            <img
              src={value.previewUrl}
              alt="Selected header"
              style={{ width: 120, height: 63, objectFit: 'cover', borderRadius: 6 }}
            />
          ) : kind === 'VIDEO' ? (
            <video src={value.previewUrl} style={{ width: 120, height: 68, borderRadius: 6 }} muted />
          ) : (
            <FileText size={32} aria-hidden="true" />
          )}
          <span style={muted}>{value.filename}</span>
          <button className="btn btn-secondary" aria-label={`Remove ${spec.noun}`} onClick={() => onChange(null)}>
            <X size={15} /> Change
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="btn btn-secondary" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
          <Icon size={16} /> Choose {spec.noun}
        </label>
      )}
      <input
        id={id}
        type="file"
        accept={spec.accept.join(',')}
        style={{ display: 'none' }}
        onChange={e => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error ? (
        <span role="alert" style={{ ...muted, color: 'var(--color-danger, #dc2626)' }}>
          {error}
        </span>
      ) : (
        <span style={muted}>{hint ?? spec.hint}</span>
      )}
    </div>
  );
}
