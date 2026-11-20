import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { waToolsApi } from '../../services/api';

const when = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Chats that started from a Click-to-WhatsApp ad, grouped by ad. */
export function AdsTab({ sessionId }: { sessionId: string }) {
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ['wa-tools', 'ads', sessionId, days],
    queryFn: () => waToolsApi.ads(sessionId, days),
  });
  const d = q.data;

  return (
    <section className="wt-stack" aria-label="Ad leads">
      <div className="wt-toolbar">
        <p className="wt-muted">
          People who tapped your Facebook / Instagram ad and messaged you. Their chats are tagged <code>from-ad</code>,
          and replying to them is <strong>free for up to 7 days</strong> (if you answer within 24 hours).
        </p>
        <select className="wt-input" value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Period">
          {[7, 30, 90].map(n => (
            <option key={n} value={n}>
              Last {n} days
            </option>
          ))}
        </select>
      </div>

      {q.isLoading ? (
        <p className="wt-muted">Loading…</p>
      ) : q.isError ? (
        <p className="wt-error">{(q.error as Error).message}</p>
      ) : !d?.total ? (
        <div className="wt-card">
          <strong>No ad leads yet.</strong>
          <span className="wt-muted">
            Create an ad in Meta Ads Manager with the goal “Messages” and destination WhatsApp, using this number. Each
            person who messages from the ad appears here.
          </span>
        </div>
      ) : (
        <>
          <div className="wt-stats">
            <div className="wt-stat">
              <strong>{d.total}</strong>
              <span>Chats from ads</span>
            </div>
            <div className="wt-stat">
              <strong>{d.people}</strong>
              <span>People</span>
            </div>
            <div className="wt-stat">
              <strong>{d.ads.length}</strong>
              <span>Ads</span>
            </div>
          </div>
          <div className="wt-table-wrap">
            <table className="wt-table">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Chats</th>
                  <th>People</th>
                  <th>Last lead</th>
                </tr>
              </thead>
              <tbody>
                {d.ads.map(a => (
                  <tr key={a.key}>
                    <td>
                      {a.headline}
                      {a.sourceType === 'post' && <span className="wt-badge">post (not free)</span>}
                      {a.sourceUrl && (
                        <a href={a.sourceUrl} target="_blank" rel="noreferrer" aria-label="Open the ad">
                          {' '}
                          <ExternalLink size={13} />
                        </a>
                      )}
                      {a.sourceId && <div className="wt-muted">Ad id {a.sourceId}</div>}
                    </td>
                    <td>{a.chats}</td>
                    <td>{a.people}</td>
                    <td>{when(a.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="wt-h">Latest leads</h3>
          <ul className="wt-list">
            {d.recent.map(r => (
              <li key={r.id}>
                <Link to={`/chats?sessionId=${sessionId}&chatId=${r.phone}@c.us`}>
                  {r.customerName || `+${r.phone}`}
                </Link>
                <span className="wt-muted">
                  {r.headline ?? 'Ad'} · {when(r.createdAt)}
                </span>
                {r.firstMessage && <span>“{r.firstMessage}”</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
