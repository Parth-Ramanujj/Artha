import { useCallback, useEffect, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { googleBusinessApi } from '../../services/api';
import type { GbpLocation, GbpReview } from '../../types/googleBusiness';
import { ReviewCard } from './ReviewCard';

const FILTERS = [
  { value: 'pending_review', label: 'Waiting for approval' },
  { value: 'new', label: 'Not answered' },
  { value: 'failed', label: 'Failed to publish' },
  { value: 'replied', label: 'Answered' },
  { value: 'skipped', label: 'Skipped' },
  { value: '', label: 'All' },
];

export function ReviewsTab({ locations, onChange }: { locations: GbpLocation[]; onChange: () => void }) {
  const [status, setStatus] = useState('pending_review');
  const [stars, setStars] = useState(0);
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<GbpReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    googleBusinessApi
      .reviews({ status: status || undefined, stars: stars || undefined, location: location || undefined, search })
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, [status, stars, location, search]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <section className="sa-panel">
      <div className="sa-toolbar">
        <select
          className="input"
          aria-label="Filter by status"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          {FILTERS.map(f => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by rating"
          value={stars}
          onChange={e => setStars(Number(e.target.value))}
        >
          <option value={0}>All ratings</option>
          {[5, 4, 3, 2, 1].map(s => (
            <option key={s} value={s}>
              {s} star{s > 1 ? 's' : ''}
            </option>
          ))}
        </select>
        {locations.length > 1 && (
          <select
            className="input"
            aria-label="Filter by location"
            value={location}
            onChange={e => setLocation(e.target.value)}
          >
            <option value="">All locations</option>
            {locations.map(l => (
              <option key={l.name} value={l.name}>
                {l.title}
              </option>
            ))}
          </select>
        )}
        <input
          className="input sa-grow"
          type="search"
          aria-label="Search reviews"
          placeholder="Search text or name"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {status === 'pending_review' && !!rows?.length && (
          <button
            className="btn btn-primary"
            onClick={() => {
              if (window.confirm(`Publish all ${rows.length} waiting replies on Google?`)) {
                void run(() => googleBusinessApi.publishAll());
              }
            }}
          >
            <CheckCheck size={14} /> Publish all
          </button>
        )}
      </div>
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {rows?.length === 0 && <p className="sa-help">No reviews here.</p>}
      <ul className="sa-list">
        {rows?.map(r => (
          <ReviewCard key={r.id} review={r} run={run} />
        ))}
      </ul>
    </section>
  );
}
