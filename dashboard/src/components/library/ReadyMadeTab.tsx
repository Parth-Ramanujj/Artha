import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Plus } from 'lucide-react';
import type { PostDraft } from './PostEditorModal';
import { MESSAGE_TEMPLATES, POSTER_TEMPLATES, type Lang } from './readyMade';
import { renderPoster, type AgentBrand } from './poster';

const BRAND_KEY = 'library.agentBrand';

function readBrand(): AgentBrand {
  try {
    const raw = localStorage.getItem(BRAND_KEY);
    if (raw) return { name: '', phone: '', ...(JSON.parse(raw) as Partial<AgentBrand>) };
  } catch {
    // storage blocked: start empty
  }
  return { name: '', phone: '' };
}

/** Ready-made posters (Padosi Agent branded) and messages; each opens in the editor before saving. */
export function ReadyMadeTab({ onUse }: { onUse: (draft: PostDraft) => void }) {
  const [view, setView] = useState<'posters' | 'messages'>('posters');
  const [brand, setBrand] = useState<AgentBrand>(readBrand);
  const [lang, setLang] = useState<'' | Lang>('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Re-draw previews when the agent's name/number changes (debounced so typing stays smooth).
  useEffect(() => {
    try {
      localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
    } catch {
      // storage blocked: the brand still works for this visit
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all(POSTER_TEMPLATES.map(async t => [t.id, await renderPoster(t, brand)] as const))
        .then(pairs => !cancelled && setImages(Object.fromEntries(pairs)))
        .catch((err: Error) => !cancelled && setError(err.message));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [brand]);

  const messages = useMemo(() => MESSAGE_TEMPLATES.filter(m => !lang || m.lang === lang), [lang]);
  const fill = (text: string) =>
    text
      .replace(/\[(Your name|आपका नाम|તમારું નામ)\]/g, brand.name.trim() || '$&')
      .replace(/\[(Your number|आपका नंबर|તમારો નંબર)\]/g, brand.phone.trim() || '$&');

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(c => (c === id ? null : c)), 1500);
    } catch {
      setError('Copy is blocked in this browser. Use "Add to library" instead.');
    }
  };

  return (
    <section className="sa-panel">
      <fieldset className="sa-form lib-brand">
        <legend>Your details on posters and messages</legend>
        <div className="sa-grid">
          <label>
            Your name
            <input
              className="input"
              placeholder="e.g. Ravi Shah"
              maxLength={40}
              value={brand.name}
              onChange={e => setBrand(b => ({ ...b, name: e.target.value }))}
            />
          </label>
          <label>
            Your WhatsApp / phone number
            <input
              className="input"
              placeholder="e.g. +91 98765 43210"
              maxLength={20}
              value={brand.phone}
              onChange={e => setBrand(b => ({ ...b, phone: e.target.value }))}
            />
          </label>
        </div>
        <p className="sa-help">Saved in this browser only. Leave empty to show padosiagent.com instead.</p>
      </fieldset>

      <div className="sa-toolbar">
        <div className="sa-row-actions" role="group" aria-label="Show">
          <button
            className={view === 'posters' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-pressed={view === 'posters'}
            onClick={() => setView('posters')}
          >
            Posters ({POSTER_TEMPLATES.length})
          </button>
          <button
            className={view === 'messages' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-pressed={view === 'messages'}
            onClick={() => setView('messages')}
          >
            Messages ({MESSAGE_TEMPLATES.length})
          </button>
        </div>
        {view === 'messages' && (
          <select
            className="input lib-filter"
            aria-label="Language"
            value={lang}
            onChange={e => setLang(e.target.value as '' | Lang)}
          >
            <option value="">All languages</option>
            <option>English</option>
            <option>Hindi</option>
            <option>Gujarati</option>
          </select>
        )}
      </div>
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}

      {view === 'posters' ? (
        <ul className="lib-grid">
          {POSTER_TEMPLATES.map(t => {
            const src = images[t.id];
            return (
              <li key={t.id} className="sa-card lib-card">
                {src ? (
                  <img className="lib-thumb lib-square" src={src} alt={t.headline} />
                ) : (
                  <div className="lib-thumb lib-square" aria-label="Drawing poster" />
                )}
                <div className="lib-card-body">
                  <strong className="sa-ellipsis">{t.title}</strong>
                  <div>
                    <span className="sa-chip">{t.category}</span>
                  </div>
                </div>
                <div className="sa-row-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!src}
                    onClick={() =>
                      src &&
                      onUse({
                        title: t.title,
                        category: t.category,
                        tags: ['padosi-agent', 'ready-made'],
                        text: t.caption,
                        media: { dataUrl: src, mimetype: 'image/jpeg' },
                      })
                    }
                  >
                    <Plus size={14} /> Add to library
                  </button>
                  {src && (
                    <a
                      className="btn btn-secondary btn-sm"
                      href={src}
                      download={`${t.id}.jpg`}
                      aria-label={`Download ${t.title}`}
                    >
                      <Download size={14} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="sa-list">
          {messages.map(m => {
            const text = fill(m.text);
            return (
              <li key={m.id} className="sa-card">
                <div className="sa-card-head">
                  <strong>{m.title}</strong>
                  <span className="sa-chip">{m.lang}</span>
                  <span className="sa-chip">{m.category}</span>
                </div>
                <p className="sa-body">{text}</p>
                <div className="sa-row-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      onUse({ title: m.title, category: m.category, tags: [m.lang.toLowerCase(), 'ready-made'], text })
                    }
                  >
                    <Plus size={14} /> Add to library
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => void copy(m.id, text)}>
                    <Copy size={14} /> {copied === m.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
