import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { googleBusinessApi } from '../../services/api';
import type { GbpLocation } from '../../types/googleBusiness';

interface LocationPickerProps {
  integrationId: string;
  accountName: string;
  locations: GbpLocation[];
  onChange: (accountName: string, locations: GbpLocation[]) => void;
}

/** Picks the Business Profile account, then the locations whose reviews this app manages. */
export function LocationPicker({ integrationId, accountName, locations, onChange }: LocationPickerProps) {
  const [accounts, setAccounts] = useState<Array<{ name: string; accountName: string }> | null>(null);
  const [available, setAvailable] = useState<GbpLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    googleBusinessApi
      .accounts(integrationId)
      .then(list => {
        setAccounts(list);
        if (!accountName && list.length === 1) onChange(list[0].name, []);
      })
      .catch((err: Error) => setError(err.message));
    // Only when the connection changes (the parent re-mounts this on a new integrationId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId]);

  const loadLocations = () => {
    if (!accountName) return;
    setLoading(true);
    setError(null);
    googleBusinessApi
      .locations(integrationId, accountName)
      .then(list => {
        setAvailable(list);
        // Refresh saved entries (review links, titles) from what Google returns now.
        const chosen = new Set(locations.map(l => l.name));
        onChange(
          accountName,
          list.filter(l => chosen.has(l.name)),
        );
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadLocations, [accountName]);

  const toggle = (loc: GbpLocation, on: boolean) =>
    onChange(accountName, on ? [...locations, loc] : locations.filter(l => l.name !== loc.name));

  return (
    <>
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {accounts && accounts.length === 0 && (
        <p className="sa-warn">This Google account manages no Business Profile. Connect the account that does.</p>
      )}
      {accounts && accounts.length > 0 && (
        <label>
          Business Profile account
          <select className="input" value={accountName} onChange={e => onChange(e.target.value, [])}>
            <option value="">Choose…</option>
            {accounts.map(a => (
              <option key={a.name} value={a.name}>
                {a.accountName}
              </option>
            ))}
          </select>
        </label>
      )}
      {accountName && (
        <div>
          <div className="sa-inline">
            <strong>Locations to manage</strong>
            <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={loadLocations}>
              <RefreshCw size={14} /> Reload
            </button>
          </div>
          {loading && <p className="sa-help">Loading locations…</p>}
          {available?.length === 0 && <p className="sa-help">No locations in this account.</p>}
          {available?.map(l => (
            <label key={l.name} className="sa-check">
              <input
                type="checkbox"
                checked={locations.some(x => x.name === l.name)}
                onChange={e => toggle(l, e.target.checked)}
              />
              {l.title} {l.address && <span className="sa-muted">· {l.address}</span>}
            </label>
          ))}
        </div>
      )}
    </>
  );
}
