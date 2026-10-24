import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { salesAgentApi } from '../../services/api';
import type { NewProspect, SalesProspect } from '../../types/salesAgent';

const STATUSES = ['', 'new', 'queued', 'contacted', 'replied', 'lost', 'opted_out', 'write_failed'];

/** One prospect per line: name, business, phone, email (comma separated; phone or email required). */
function parseLines(text: string): NewProspect[] {
  return text
    .split('\n')
    .map(l => l.split(',').map(s => s.trim()))
    .filter(cols => cols.some(Boolean))
    .map(([name, companyName, phone, email]) => ({ name, companyName, phone, email }));
}

export function ProspectsTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<SalesProspect[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState('');

  const load = useCallback(() => {
    salesAgentApi
      .prospects(status || undefined)
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, [status]);
  useEffect(load, [load]);

  const add = async () => {
    setError(null);
    try {
      const res = await salesAgentApi.addProspects(parseLines(text));
      setNotice(`Added ${res.added}, skipped ${res.skipped} (duplicates or no phone/email).`);
      setText('');
      load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add prospects');
    }
  };

  const remove = async (id: string) => {
    try {
      await salesAgentApi.removeProspect(id);
      load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  return (
    <section className="sa-panel">
      <div className="sa-form">
        <label>
          Add prospects, one per line: name, business, phone with country code, email
          <textarea
            className="input"
            rows={3}
            placeholder="Asha Shah, Smile Dental, +91 98765 43210, asha@smiledental.in"
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </label>
        <div>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={add}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
      {notice && <p className="sa-notice">{notice}</p>}
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      <div className="sa-toolbar">
        <select className="input" aria-label="Filter prospects" value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s ? s.replace('_', ' ') : 'All statuses'}
            </option>
          ))}
        </select>
      </div>
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead>
            <tr>
              <th>Name / business</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Status</th>
              <th>Source</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows?.map(p => (
              <tr key={p.id}>
                <td>
                  {p.name || '—'}
                  <div className="sa-muted">{p.companyName}</div>
                </td>
                <td>{p.phone ? `+${p.phone}` : ''}</td>
                <td>{p.email}</td>
                <td>
                  <span className="sa-chip">{p.status.replace('_', ' ')}</span>
                  {p.channel && <span className={`sa-chip ${p.channel}`}>{p.channel}</span>}
                </td>
                <td className="sa-muted">{p.source}</td>
                <td>
                  <button className="btn btn-icon btn-ghost btn-danger" aria-label="Delete prospect" onClick={() => remove(p.id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && <p className="sa-help">No prospects yet. Add some above or use Find businesses.</p>}
      </div>
    </section>
  );
}
