import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { salesAgentApi } from '../../services/api';
import type { SalesCompany } from '../../types/salesAgent';

export function DiscoverTab({ onChange }: { onChange: () => void }) {
  const [query, setQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [companies, setCompanies] = useState<SalesCompany[] | null>(null);

  const load = () => {
    salesAgentApi
      .companies()
      .then(setCompanies)
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, []);

  const discover = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await salesAgentApi.discover({ query, radiusKm });
      const u = res.understood;
      setNotice(
        `Searched for "${u.business}" within ${u.radiusKm} km of ${u.place}: found ${res.found}, ${res.added} new.` +
          (res.found === 0 ? ' Try a bigger radius or a different word.' : ' Their websites are read on the next cycles.'),
      );
      load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sa-panel">
      <form className="sa-form sa-inline" onSubmit={discover}>
        <label className="sa-grow">
          What and where (India)
          <input
            className="input"
            required
            placeholder="insurance agent ahmedabad"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        <label>
          Radius (km)
          <input
            className="input"
            type="number"
            min={1}
            max={50}
            value={radiusKm}
            onChange={e => setRadiusKm(Number(e.target.value))}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <Search size={14} /> {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      <p className="sa-help">
        Type it the way you would say it: "insurance agent ahmedabad", "dentist in South Bopal", "CA office surat".
        Spelling mistakes are fine. Searches only inside India, from OpenStreetMap (free), so small businesses that
        are not on the map will not show up.
      </p>
      {notice && <p className="sa-notice">{notice}</p>}
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Phone</th>
              <th>Website</th>
              <th>Signals</th>
            </tr>
          </thead>
          <tbody>
            {companies?.map(c => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  <div className="sa-muted">{c.location}</div>
                </td>
                <td>{c.phone ? `+${c.phone}` : ''}</td>
                <td className="sa-ellipsis">{c.website}</td>
                <td>
                  {c.profiledAt || !c.website ? (
                    c.signals.map(s => (
                      <span key={s.code} className="sa-chip" title={s.detail}>
                        {s.code.toLowerCase().replace(/_/g, ' ')}
                      </span>
                    ))
                  ) : (
                    <span className="sa-muted">not read yet</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
