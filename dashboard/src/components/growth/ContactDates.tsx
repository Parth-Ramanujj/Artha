import { useState } from 'react';
import { Search } from 'lucide-react';
import { businessContactApi, type BusinessContact } from '../../services/api';
import { useSaver } from './useSaver';

// Dates are stored as MM-DD; a date input needs a year, so a fixed leap year keeps 29 Feb valid.
const toInput = (md: string | null | undefined) => (md ? `2000-${md}` : '');
const fromInput = (v: string) => (v ? v.slice(5) : null);

/** Find contacts and set their birthday / anniversary. */
export function ContactDates() {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<BusinessContact[]>([]);
  const { run, messages } = useSaver();

  const search = () => run(async () => setContacts(await businessContactApi.list({ search: query, limit: 25 })));

  const update = (c: BusinessContact, patch: Partial<BusinessContact>) =>
    run(async () => {
      const saved = await businessContactApi.update(c.id, patch);
      setContacts(list => list.map(x => (x.id === c.id ? saved : x)));
      return `Saved for ${c.name || c.phone}.`;
    });

  return (
    <fieldset>
      <legend>Customer dates</legend>
      <form
        className="sa-inline"
        onSubmit={e => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          className="input"
          placeholder="Search name or number"
          value={query}
          aria-label="Search contacts"
          onChange={e => setQuery(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit">
          <Search size={14} /> Search
        </button>
      </form>
      {messages}
      {contacts.length > 0 && (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Birthday</th>
                <th>Anniversary</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}>
                  <td>
                    {c.name || '–'}
                    <div className="sa-muted">{c.phone || c.waContactId}</div>
                  </td>
                  <td>
                    <input
                      className="input"
                      type="date"
                      aria-label={`Birthday of ${c.name || c.phone}`}
                      value={toInput(c.birthday)}
                      onChange={e => void update(c, { birthday: fromInput(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="date"
                      aria-label={`Anniversary of ${c.name || c.phone}`}
                      value={toInput(c.anniversary)}
                      onChange={e => void update(c, { anniversary: fromInput(e.target.value) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sa-help">Only the day and month are used; the year is ignored.</p>
    </fieldset>
  );
}
