import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, Plus, Trash2 } from 'lucide-react';
import { growthApi } from '../../services/api';
import type { GrowthLink } from '../../types/growth';
import { useSaver } from './useSaver';

const origin = window.location.origin;
const shortUrl = (l: GrowthLink) => `${origin}/api/g/${l.ref}`;
const snippet = (l: GrowthLink) => `<script src="${origin}/api/g/${l.ref}/widget.js" async></script>`;

/** Trackable click-to-chat links: one per poster, shop counter or website, each with a QR and a widget snippet. */
export function LinksTab() {
  const [links, setLinks] = useState<GrowthLink[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', prefillText: '' });
  const { busy, run, messages } = useSaver();

  const refresh = useCallback(() => {
    void run(async () => setLinks(await growthApi.links()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(refresh, [refresh]);

  const create = () =>
    run(async () => {
      await growthApi.saveLink(form);
      setForm({ name: '', phone: '', prefillText: '' });
      setLinks(await growthApi.links());
      return 'Link created.';
    });

  const copy = (text: string) =>
    run(async () => {
      await navigator.clipboard.writeText(text);
      return 'Copied.';
    });

  const downloadQr = (l: GrowthLink) =>
    run(async () => {
      const url = URL.createObjectURL(await growthApi.linkQr(l.id, origin));
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${l.name.replace(/\W+/g, '-').toLowerCase() || l.ref}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const remove = (l: GrowthLink) => {
    if (!window.confirm(`Delete "${l.name}"? Its QR code and widget will stop working.`)) return;
    void run(async () => {
      await growthApi.deleteLink(l.id);
      setLinks(await growthApi.links());
    });
  };

  return (
    <section className="sa-panel">
      <p className="sa-help">
        Make one link per place: a shop poster, a pamphlet, your website. Each gets a QR code and a website chat button,
        and every chat it starts is tagged with its name so you can see which place brings customers. Open this
        dashboard on your public address before downloading QR codes, since they point at {origin}.
      </p>
      {messages}

      <form
        className="sa-form sa-inline"
        onSubmit={e => {
          e.preventDefault();
          void create();
        }}
      >
        <label>
          Name
          <input
            className="input"
            required
            maxLength={100}
            placeholder="Shop counter"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          WhatsApp number (with country code)
          <input
            className="input"
            required
            maxLength={20}
            placeholder="919876543210"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label>
          First message the customer sends
          <input
            className="input"
            maxLength={400}
            placeholder="Hi, I saw your poster"
            value={form.prefillText}
            onChange={e => setForm({ ...form, prefillText: e.target.value })}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <Plus size={14} /> Create link
        </button>
      </form>

      {!links.length ? (
        <p className="sa-help">No links yet.</p>
      ) : (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Scans / clicks</th>
                <th>Chats started</th>
                <th>Share</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {links.map(l => (
                <tr key={l.id}>
                  <td>
                    {l.name}
                    <div className="sa-muted">+{l.phone}</div>
                  </td>
                  <td>{l.scans}</td>
                  <td>{l.chats}</td>
                  <td className="sa-row-actions">
                    <button className="btn btn-secondary" onClick={() => void downloadQr(l)}>
                      <Download size={14} /> QR code
                    </button>
                    <button className="btn btn-secondary" onClick={() => void copy(snippet(l))}>
                      <Copy size={14} /> Website widget
                    </button>
                    <button className="btn btn-secondary" onClick={() => void copy(shortUrl(l))}>
                      <Copy size={14} /> Link
                    </button>
                  </td>
                  <td>
                    <button className="btn btn-icon" aria-label={`Delete ${l.name}`} onClick={() => remove(l)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
