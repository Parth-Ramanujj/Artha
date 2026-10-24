import { useEffect, useState } from 'react';
import { Copy, Send } from 'lucide-react';
import { googleBusinessApi } from '../../services/api';
import { useSessionsQuery } from '../../hooks/queries';
import type { GbpLocation } from '../../types/googleBusiness';

/** "Name, phone" or just "phone" per line → contacts. */
function parseContacts(raw: string): Array<{ name: string; phone: string }> {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/[,\t;]/).map(p => p.trim());
      const phone = parts.find(p => /\d{8,}/.test(p.replace(/\D/g, ''))) ?? '';
      return { name: parts.filter(p => p !== phone).join(' '), phone };
    })
    .filter(c => c.phone);
}

/** Sends customers the Google "write a review" link over WhatsApp. */
export function RequestReviewsTab({ locations }: { locations: GbpLocation[] }) {
  const sessions = (useSessionsQuery().data ?? []).filter(s => s.status === 'ready');
  const [sessionId, setSessionId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [message, setMessage] = useState('');
  const [list, setList] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    googleBusinessApi
      .getConfig()
      .then(res => setMessage(m => m || res.config.reviewRequestTemplate))
      .catch(() => undefined);
  }, []);

  const location = locations.find(l => l.name === locationName) ?? locations[0];
  const contacts = parseContacts(list);

  const send = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await googleBusinessApi.requestReviews({
        sessionId,
        locationName: location?.name,
        message,
        contacts,
      });
      setNotice(
        `Sent ${res.sent} request(s).` +
          (res.failed.length ? ` Failed: ${res.failed.map(f => `${f.phone} (${f.error})`).join(', ')}` : ''),
      );
      if (!res.failed.length) setList('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  if (!locations.length) return <p className="sa-help">Pick your locations in Settings first.</p>;

  return (
    <section className="sa-panel sa-form">
      {location?.reviewUrl ? (
        <p className="sa-help">
          Review link for {location.title}:{' '}
          <a href={location.reviewUrl} target="_blank" rel="noreferrer">
            {location.reviewUrl}
          </a>{' '}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label="Copy review link"
            onClick={() => void navigator.clipboard?.writeText(location.reviewUrl)}
          >
            <Copy size={14} />
          </button>
        </p>
      ) : (
        <p className="sa-warn">
          Google gave no review link for this location yet. Pick it again in Settings to refresh it.
        </p>
      )}
      <div className="sa-grid">
        <label>
          Send from
          <select className="input" value={sessionId} onChange={e => setSessionId(e.target.value)}>
            <option value="">Choose a connected WhatsApp number</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {locations.length > 1 && (
          <label>
            Location
            <select className="input" value={location?.name} onChange={e => setLocationName(e.target.value)}>
              {locations.map(l => (
                <option key={l.name} value={l.name}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        Message ({'{name}'} and {'{link}'} are filled in)
        <textarea className="input" rows={3} value={message} onChange={e => setMessage(e.target.value)} />
      </label>
      <label>
        Customers, one per line: name, phone with country code
        <textarea
          className="input"
          rows={6}
          placeholder={'Ravi Shah, 919876543210\n919812345678'}
          value={list}
          onChange={e => setList(e.target.value)}
        />
      </label>
      <p className="sa-help">
        {contacts.length} customer(s). Only message people who bought from you; messages go out a couple of seconds
        apart.
      </p>
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
          disabled={busy || !sessionId || !contacts.length || !location?.reviewUrl}
          onClick={() => void send()}
        >
          <Send size={14} /> {busy ? 'Sending…' : `Send ${contacts.length || ''} request(s)`}
        </button>
      </div>
    </section>
  );
}
