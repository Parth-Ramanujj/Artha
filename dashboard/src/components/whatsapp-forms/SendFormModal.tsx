import { useState } from 'react';
import { Modal } from '../Modal';
import { whatsappFormApi } from '../../services/api';
import type { Session } from '../../services/api';

interface SendFormModalProps {
  formId: string;
  formName: string;
  sessions: Session[];
  onClose: () => void;
}

/** Sends a published form to one phone number from a Cloud API number. */
export function SendFormModal({ formId, formName, sessions, onClose }: SendFormModalProps) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await whatsappFormApi.send(formId, { sessionId, phone, bodyText: bodyText.trim() || undefined });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Send "${formName}"`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {sent ? 'Close' : 'Cancel'}
          </button>
          {!sent && (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !sessionId || !phone.trim()}>
              {busy ? 'Sending…' : 'Send form'}
            </button>
          )}
        </>
      }
    >
      {sent ? (
        <p className="wf-success">Form sent. The customer's answers will appear in the inbox when they submit it.</p>
      ) : (
        <div className="wf-send-form">
          <label className="wf-field">
            <span>From WhatsApp number</span>
            <select value={sessionId} onChange={e => setSessionId(e.target.value)}>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="wf-field">
            <span>Customer phone (with country code)</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="919876543210" inputMode="tel" />
          </label>
          <label className="wf-field">
            <span>Message above the button (optional)</span>
            <textarea rows={3} maxLength={1024} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder={`Please fill in: ${formName}`} />
          </label>
          <p className="wf-help">WhatsApp only delivers this inside the customer's 24-hour window. Outside it, send an approved template instead.</p>
          {error && <p className="wf-error" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
