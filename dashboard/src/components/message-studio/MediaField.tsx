import { useRef, useState } from 'react';
import { Upload, Link2, X } from 'lucide-react';
import type { ReadinessIssue, StudioMedia } from '../../types/messageStudio';
import { LIMITS, MEDIA_ACCEPT, fileToBase64 } from '../../utils/messageStudio';
import { FieldIssues, TextField } from './fields';

interface MediaFieldProps {
  kind: 'image' | 'video' | 'document' | 'audio' | 'sticker';
  media: StudioMedia | undefined;
  onChange: (media: StudioMedia) => void;
  issues: ReadinessIssue[];
}

const NOUN = { image: 'image', video: 'video', document: 'document', audio: 'audio file', sticker: 'sticker' };

/** A file for a media message: an https link, or an upload of up to 5 MB. */
export function MediaField({ kind, media, onChange, issues }: MediaFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const source = media?.source ?? 'url';

  const upload = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (file.size > LIMITS.mediaBytes) {
      setError(
        `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Upload a file of 5 MB or less, or use a link.`,
      );
      return;
    }
    try {
      onChange({ source: 'upload', base64: await fileToBase64(file), mimetype: file.type, filename: file.name });
    } catch {
      setError('Could not read this file. Try another one.');
    }
  };

  return (
    <div className="ms-field">
      <span className="ms-label">{NOUN[kind][0].toUpperCase() + NOUN[kind].slice(1)} *</span>
      <div className="ms-segmented" role="radiogroup" aria-label="Where the file comes from">
        <button
          type="button"
          role="radio"
          aria-checked={source === 'url'}
          className={source === 'url' ? 'is-active' : ''}
          onClick={() => onChange({ source: 'url', url: '' })}
        >
          <Link2 size={14} aria-hidden="true" /> Link
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={source === 'upload'}
          className={source === 'upload' ? 'is-active' : ''}
          onClick={() => input.current?.click()}
        >
          <Upload size={14} aria-hidden="true" /> Upload
        </button>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={MEDIA_ACCEPT[kind]}
        onChange={e => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {source === 'url' ? (
        <TextField
          label={`${NOUN[kind]} link (https)`}
          type="url"
          inputMode="url"
          placeholder="https://cdn.example.com/file"
          value={media?.url ?? ''}
          onChange={url => onChange({ source: 'url', url })}
          hint="The link must be public so WhatsApp can download it."
        />
      ) : media?.base64 ? (
        <div className="ms-file-pill">
          <span>{media.filename || `Uploaded ${NOUN[kind]}`}</span>
          <button
            type="button"
            className="ms-icon-btn"
            aria-label="Remove the file"
            onClick={() => onChange({ source: 'url', url: '' })}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <span className="ms-hint">Choose a file to upload.</span>
      )}
      {error && (
        <span className="ms-field-error" role="alert">
          {error}
        </span>
      )}
      <FieldIssues issues={issues} />
    </div>
  );
}
