import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from 'lucide-react';
import { useToast } from '../Toast';
import { waToolsApi } from '../../services/api';

const when = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const mins = (s: number) => (s ? `${Math.floor(s / 60)}m ${s % 60}s` : '—');
const DEFAULT_ASK = 'Can we call you on WhatsApp to help you better?';

/** WhatsApp Calling: switch it on, ask customers for call permission, and see the call log. */
export function CallsTab({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['wa-tools', 'calls', sessionId], queryFn: () => waToolsApi.calls(sessionId) });
  const [phone, setPhone] = useState('');
  const [text, setText] = useState(DEFAULT_ASK);
  const fail = (e: Error) => toast.error('Not done', e.message);

  const settings = useMutation({
    mutationFn: (v: { enabled: boolean; showCallButton: boolean }) =>
      waToolsApi.setCalling(sessionId, v.enabled, v.showCallButton),
    onSuccess: r => {
      void q.refetch();
      if (r.ok) toast.success('Saved', 'Meta updated the calling settings.');
      else toast.error('Not saved', 'Meta did not confirm the change.');
    },
    onError: fail,
  });
  const ask = useMutation({
    mutationFn: () => waToolsApi.askPermission(sessionId, phone, text),
    onSuccess: () => {
      toast.success('Sent', 'The customer sees “Allow calls”. Their answer appears in Chats.');
      setPhone('');
    },
    onError: fail,
  });
  const d = q.data;

  return (
    <section className="wt-stack" aria-label="WhatsApp calls">
      <div className="wt-card">
        <strong>Cost</strong>
        <span className="wt-muted">
          Calls from customers are <strong>free</strong>. Calls you make are charged per minute by Meta (billed in
          6-second pulses), and the permission request counts as one message.
        </span>
      </div>

      <div className="wt-card">
        <strong>Calling on this number</strong>
        {q.isLoading ? (
          <span className="wt-muted">Checking with Meta…</span>
        ) : d?.settingsError ? (
          <span className="wt-error">Could not read the settings from Meta: {d.settingsError}</span>
        ) : (
          <>
            <label className="wt-check">
              <input
                type="checkbox"
                checked={!!d?.enabled}
                disabled={settings.isPending}
                onChange={e => settings.mutate({ enabled: e.target.checked, showCallButton: !!d?.callButtonVisible })}
              />
              WhatsApp Calling is {d?.enabled ? 'ON' : 'OFF'}
            </label>
            <label className="wt-check">
              <input
                type="checkbox"
                checked={!!d?.callButtonVisible}
                disabled={settings.isPending || !d?.enabled}
                onChange={e => settings.mutate({ enabled: true, showCallButton: e.target.checked })}
              />
              Show the call button in the customer’s chat
            </label>
            <span className="wt-muted">
              Calls are answered in WhatsApp’s connected calling setup (SIP / a calling partner in Meta). Calls nobody
              answers show here as missed, you get a notification, and Customer Care can send an automatic “sorry we
              missed you” message.
            </span>
          </>
        )}
      </div>

      <form
        className="wt-card"
        onSubmit={e => {
          e.preventDefault();
          ask.mutate();
        }}
      >
        <strong>Ask a customer for permission to call</strong>
        <span className="wt-muted">Needed before you call someone. Works inside the 24-hour window.</span>
        <div className="wt-row">
          <input
            className="wt-input"
            placeholder="Phone with country code, e.g. 919876543210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            aria-label="Customer phone"
            required
          />
          <input
            className="wt-input wt-grow"
            value={text}
            onChange={e => setText(e.target.value)}
            aria-label="Message"
            required
          />
          <button className="btn btn-primary" disabled={ask.isPending}>
            {ask.isPending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>

      <h3 className="wt-h">Call log {d?.missed ? <span className="wt-badge is-bad">{d.missed} missed</span> : null}</h3>
      {!d?.recent.length ? (
        <p className="wt-muted">No WhatsApp calls yet.</p>
      ) : (
        <ul className="wt-list">
          {d.recent.map(c => {
            const Icon =
              c.status === 'missed' ? PhoneMissed : c.direction === 'USER_INITIATED' ? PhoneIncoming : PhoneOutgoing;
            return (
              <li key={c.id} className={c.status === 'missed' ? 'is-bad' : ''}>
                <span>
                  <Icon size={15} aria-hidden="true" /> +{c.phone}
                </span>
                <span className="wt-muted">
                  {c.status} · {mins(c.durationSec)} · {when(c.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
