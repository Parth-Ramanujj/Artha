import { useId, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { fileToBase64 } from '../../utils/messageStudio';

export interface PickedImage {
  base64: string;
  mimetype: 'image/jpeg' | 'image/png';
  filename: string;
  previewUrl: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Picks a JPG/PNG (max 5 MB) for a WhatsApp template header, with a preview. */
export function HeaderImagePicker({
  value,
  onChange,
  label = 'Header image',
  hint = 'JPG or PNG, up to 5 MB. A wide image (about 1.91:1) looks best.',
  labelClassName = 'ms-label',
}: {
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  label?: string;
  hint?: string;
  labelClassName?: string;
}) {
  const id = useId();
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') return setError('Choose a JPG or PNG image.');
    if (file.size > MAX_BYTES) return setError('The image is bigger than 5 MB. Choose a smaller one.');
    try {
      onChange({
        base64: await fileToBase64(file),
        mimetype: file.type,
        filename: file.name,
        previewUrl: URL.createObjectURL(file),
      });
    } catch {
      setError('Could not read that file. Try another image.');
    }
  };

  // Inline layout so the picker looks the same in Message Studio and on the Campaigns page.
  const muted = { fontSize: '0.8rem', color: 'var(--color-muted, #6b7280)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <span className={labelClassName}>{label}</span>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src={value.previewUrl}
            alt="Selected header"
            style={{ width: 120, height: 63, objectFit: 'cover', borderRadius: 6 }}
          />
          <span style={muted}>{value.filename}</span>
          <button className="btn btn-secondary" aria-label="Remove image" onClick={() => onChange(null)}>
            <X size={15} /> Change
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="btn btn-secondary" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
          <ImagePlus size={16} /> Choose image
        </label>
      )}
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png"
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
        <span style={muted}>{hint}</span>
      )}
    </div>
  );
}
