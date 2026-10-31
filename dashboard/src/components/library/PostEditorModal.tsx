import { useState } from 'react';
import { Sparkles, Trash2, Upload } from 'lucide-react';
import { Modal } from '../Modal';
import { libraryApi } from '../../services/api';
import type { LibraryItem, LibraryItemInput } from '../../types/library';
import { MediaThumb } from './MediaThumb';

const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/3gpp';
const MAX_BYTES = 16 * 1024 * 1024; // WhatsApp's own limit for status/message video

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/** Pre-filled, unsaved content (from the Ready-made gallery); media is a data: URL. */
export interface PostDraft {
  title: string;
  category: string;
  tags: string[];
  text: string;
  media?: { dataUrl: string; mimetype: string };
}

interface Props {
  item: LibraryItem | null;
  draft?: PostDraft;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** Create or edit a post: text, or an image/video with caption, with an AI writer. */
export function PostEditorModal({ item, draft, categories, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(item?.title ?? draft?.title ?? '');
  const [category, setCategory] = useState(item?.category ?? draft?.category ?? '');
  const [tags, setTags] = useState((item?.tags ?? draft?.tags ?? []).join(', '));
  const [text, setText] = useState(item?.text ?? draft?.text ?? '');
  const [media, setMedia] = useState<{ base64: string; mimetype: string; preview: string } | null>(
    draft?.media ? { base64: draft.media.dataUrl, mimetype: draft.media.mimetype, preview: draft.media.dataUrl } : null,
  );
  const [removeMedia, setRemoveMedia] = useState(false);
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('English');
  const [format, setFormat] = useState<'status' | 'message'>('message');
  const [busy, setBusy] = useState<'save' | 'ai' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) return setError('Use a JPG, PNG, WebP image or an MP4 video');
    if (file.size > MAX_BYTES) return setError('The file is over 16 MB, WhatsApp will not send it');
    setError(null);
    const base64 = await readAsBase64(file);
    setMedia({ base64, mimetype: file.type, preview: base64 });
    setRemoveMedia(false);
  };

  const write = async () => {
    setBusy('ai');
    setError(null);
    try {
      const res = await libraryApi.write({ topic: topic || title, language, format });
      setText(res.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI could not write this');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    const input: LibraryItemInput = {
      title,
      category,
      tags: tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
      text,
      ...(media ? { media: { base64: media.base64, mimetype: media.mimetype } } : {}),
      ...(removeMedia ? { removeMedia: true } : {}),
    };
    try {
      await libraryApi.saveItem(input, item?.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setBusy(null);
    }
  };

  const hasOldMedia = !!item && item.type !== 'text' && !removeMedia && !media;
  const newIsVideo = media?.mimetype.startsWith('video/');

  return (
    <Modal
      title={item ? 'Edit post' : 'New post'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!!busy || !title.trim() || (!text.trim() && !media && !hasOldMedia)}
            onClick={() => void save()}
          >
            {busy === 'save' ? 'Saving…' : 'Save post'}
          </button>
        </>
      }
    >
      <div className="sa-form">
        <div className="sa-grid">
          <label>
            Title
            <input className="input" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
          </label>
          <label>
            Category
            <input
              className="input"
              list="lib-categories"
              placeholder="e.g. Festivals, Offers, Tips"
              value={category}
              maxLength={80}
              onChange={e => setCategory(e.target.value)}
            />
            <datalist id="lib-categories">
              {categories.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <label>
          Tags (comma separated)
          <input className="input" value={tags} onChange={e => setTags(e.target.value)} />
        </label>

        <fieldset>
          <legend>Photo or video (optional)</legend>
          {media &&
            (newIsVideo ? (
              <video className="lib-preview" src={media.preview} controls muted playsInline />
            ) : (
              <img className="lib-preview" src={media.preview} alt="New upload preview" />
            ))}
          {hasOldMedia && item && <MediaThumb item={item} controls />}
          <div className="sa-row-actions">
            <label className="btn btn-secondary lib-file">
              <Upload size={14} /> {media || hasOldMedia ? 'Replace' : 'Upload'}
              <input type="file" accept={ACCEPT} onChange={e => void pickFile(e.target.files?.[0])} />
            </label>
            {(media || hasOldMedia) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setMedia(null);
                  setRemoveMedia(!!item && item.type !== 'text');
                }}
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Write with AI</legend>
          <label>
            What is it about?
            <input
              className="input"
              placeholder="e.g. Diwali wishes and a reminder to renew policies on time"
              value={topic}
              maxLength={1000}
              onChange={e => setTopic(e.target.value)}
            />
          </label>
          <div className="sa-grid">
            <label>
              Language
              <select className="input" value={language} onChange={e => setLanguage(e.target.value)}>
                <option>English</option>
                <option>Hindi</option>
                <option>Gujarati</option>
              </select>
            </label>
            <label>
              For
              <select
                className="input"
                value={format}
                onChange={e => setFormat(e.target.value as 'status' | 'message')}
              >
                <option value="message">Message</option>
                <option value="status">Status caption</option>
              </select>
            </label>
          </div>
          <div className="sa-row-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!!busy || !(topic.trim() || title.trim())}
              onClick={() => void write()}
            >
              <Sparkles size={14} /> {busy === 'ai' ? 'Writing…' : 'Write it'}
            </button>
          </div>
        </fieldset>

        <label>
          {media || hasOldMedia ? 'Caption' : 'Message text'}
          <textarea className="input" rows={7} maxLength={4000} value={text} onChange={e => setText(e.target.value)} />
        </label>
        <p className="sa-help">
          Check AI text before posting: it must not promise prices, returns or benefits you do not offer.
        </p>
        {error && (
          <p className="sa-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
