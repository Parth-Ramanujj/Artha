import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { googleBusinessApi } from '../../services/api';
import type { GbpLocation } from '../../types/googleBusiness';

/** Writes (optionally with AI) and publishes a "What's new" post on the chosen locations. */
export function PostsTab({ locations }: { locations: GbpLocation[] }) {
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (!locations.length) return <p className="sa-help">Pick your locations in Settings first.</p>;
  const targets = chosen.length ? chosen : locations.map(l => l.name);

  return (
    <section className="sa-panel sa-form">
      <fieldset>
        <legend>Write with AI (optional)</legend>
        <div className="sa-inline">
          <input
            className="input sa-grow"
            aria-label="What is the post about"
            placeholder="e.g. Diwali opening hours, new menu item, weekend offer"
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            disabled={busy || !topic.trim()}
            onClick={() => void act(async () => setSummary((await googleBusinessApi.writePost(topic)).summary))}
          >
            <Sparkles size={14} /> Write
          </button>
        </div>
      </fieldset>
      <label>
        Post text
        <textarea
          className="input"
          rows={6}
          maxLength={1500}
          value={summary}
          onChange={e => setSummary(e.target.value)}
        />
      </label>
      <label>
        &quot;Learn more&quot; button link (optional)
        <input className="input" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} />
      </label>
      {locations.length > 1 && (
        <fieldset>
          <legend>Post on</legend>
          {locations.map(l => (
            <label key={l.name} className="sa-check">
              <input
                type="checkbox"
                checked={targets.includes(l.name)}
                onChange={e => setChosen(e.target.checked ? [...targets, l.name] : targets.filter(n => n !== l.name))}
              />
              {l.title}
            </label>
          ))}
        </fieldset>
      )}
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sa-notice" role="status">
          {notice}
        </p>
      )}
      <div className="sa-row-actions">
        <button
          className="btn btn-primary"
          disabled={busy || !summary.trim() || !targets.length}
          onClick={() =>
            void act(async () => {
              const res = await googleBusinessApi.createPost({
                summary,
                url: url.trim() || undefined,
                locationNames: targets,
              });
              setNotice(
                (res.posted.length ? `Posted on ${res.posted.join(', ')}.` : '') +
                  (res.failed.length ? ` Failed: ${res.failed.map(f => `${f.location} (${f.error})`).join(', ')}` : ''),
              );
              if (!res.failed.length) setSummary('');
            })
          }
        >
          <Send size={14} /> Publish post
        </button>
      </div>
    </section>
  );
}
