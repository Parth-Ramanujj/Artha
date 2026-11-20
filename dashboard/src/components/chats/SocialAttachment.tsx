import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { SocialPlatform } from '../../types/socialAutomation';

const MAX_BYTES = 16 * 1024 * 1024;

/** Reads a picked file as base64 (without the data: prefix). */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

interface AttachButtonProps {
  platform: SocialPlatform;
  disabled: boolean;
  onFile: (file: { base64: string; mimetype: string; filename: string }) => void;
  onError: (message: string) => void;
}

/** Paperclip button: photos, videos and audio on Instagram; Messenger also takes documents. */
export function AttachButton({ platform, disabled, onFile, onError }: AttachButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const accept =
    platform === 'instagram' ? 'image/*,video/*,audio/*' : 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

  const picked = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      onError('The file is larger than 16 MB. Send a smaller file or share a link.');
      return;
    }
    try {
      onFile({ base64: await toBase64(file), mimetype: file.type || 'application/octet-stream', filename: file.name });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not read the file');
    }
  };

  return (
    <>
      <input ref={input} type="file" hidden accept={accept} onChange={e => void picked(e.target.files?.[0])} />
      <button
        type="button"
        className="btn btn-secondary"
        aria-label="Attach a file"
        title={platform === 'instagram' ? 'Send a photo, video or audio' : 'Send a photo, video, audio or document'}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Paperclip size={16} />
      </button>
    </>
  );
}

/** An attachment in a chat bubble: shown as a picture when it is one, otherwise a link. */
export function AttachmentPreview({ url }: { url: string }) {
  const [notImage, setNotImage] = useState(false);
  return notImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      📎 Open attachment
    </a>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className="social-bubble-media">
      <img src={url} alt="Attachment" loading="lazy" onError={() => setNotImage(true)} />
    </a>
  );
}
