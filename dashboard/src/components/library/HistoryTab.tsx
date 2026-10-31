import type { LibraryAutomation, LibraryRun } from '../../types/library';

/** The last 100 deliveries, scheduled or manual. */
export function HistoryTab({ runs, automations }: { runs: LibraryRun[]; automations: LibraryAutomation[] }) {
  if (!runs.length) return <p className="sa-help">Nothing posted yet.</p>;
  const nameOf = (id: string | null) =>
    id ? (automations.find(a => a.id === id)?.name ?? 'Deleted automation') : 'Manual';
  return (
    <section className="sa-panel sa-table-wrap">
      <table className="sa-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Post</th>
            <th>From</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Skipped</th>
            <th>Failed</th>
            <th>Problems</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id}>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td className="sa-ellipsis" title={r.itemTitle}>
                {r.itemTitle || '–'}
              </td>
              <td>{nameOf(r.automationId)}</td>
              <td>{r.postedToStatus ? 'Posted' : '–'}</td>
              <td>{r.sent}</td>
              <td>{r.skipped}</td>
              <td>{r.failed}</td>
              <td className="lib-error-cell">{r.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
