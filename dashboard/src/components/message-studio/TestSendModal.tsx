import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Modal } from '../Modal';
import { messageStudioApi } from '../../services/api';
import type { StudioTestResult } from '../../types/messageStudio';

interface TestSendModalProps {
  messageId: string;
  sessionId: string;
  sessionName: string;
  onClose: () => void;
  onSent: () => void;
}

const PHONE_KEY = 'openwa.messageStudio.testPhone';

function rememberedPhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) ?? '';
  } catch {
    return '';
  }
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  pending: 'Submitted',
};

/** Sends one copy to a number the user types and confirms. Shows what WhatsApp has accepted so far. */
export function TestSendModal({ messageId, sessionId, sessionName, onClose, onSent }: TestSendModalProps) {
  const [phone, setPhone] = useState(rememberedPhone);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<StudioTestResult | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const digits = phone.replace(/\D/g, '');
  const validPhone = digits.length >= 8 && digits.length <= 15;

  const send = useMutation({
    mutationFn: () => messageStudioApi.testSend(messageId, { sessionId, phone, confirm: true }),
    onSuccess: r => {
      setResult(r);
      onSent();
      try {
        localStorage.setItem(PHONE_KEY, phone);
      } catch {
        // not remembered
      }
    },
  });
  const check = useMutation({
    mutationFn: () => messageStudioApi.testStatus(messageId),
    onSuccess: r => setStatuses(r.statuses),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Send a test"
      footer={
        result ? (
          <>
            <button className="btn btn-secondary" onClick={() => check.mutate()} disabled={check.isPending}>
              {check.isPending ? 'Checking…' : 'Check delivery'}
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!validPhone || !confirmed || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? 'Sending…' : 'Send test'}
            </button>
          </>
        )
      }
    >
      {!result ? (
        <div className="ms-stack">
          <p className="ms-muted">
            One copy is sent from <strong>{sessionName}</strong>. Customers who opted out or are on Do-Not-Disturb are
            never messaged.
          </p>
          <label className="ms-field">
            <span className="ms-label">Phone number with country code *</span>
            <input
              className="ms-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              aria-invalid={phone !== '' && !validPhone}
            />
            {phone !== '' && !validPhone && (
              <span className="ms-field-error">Enter a full number including the country code.</span>
            )}
          </label>
          <label className="ms-check">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            This is my number or a tester's, and they agreed to receive this test.
          </label>
          {send.isError && (
            <div className="ms-callout ms-callout-error" role="alert">
              {(send.error as Error).message}
            </div>
          )}
        </div>
      ) : (
        <div className="ms-stack" aria-live="polite">
          <p>
            Test to <strong>{result.recipient}</strong>:
          </p>
          <ul className="ms-test-parts">
            {result.parts.map((p, i) => {
              const live = p.messageId ? statuses[p.messageId] : undefined;
              return (
                <li key={i} className={p.status === 'failed' ? 'is-failed' : ''}>
                  {p.status === 'failed' ? (
                    <XCircle size={16} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  )}
                  <span>
                    Part {i + 1} ({p.type}):{' '}
                    {p.status === 'failed'
                      ? `Failed — ${p.error ?? 'unknown error'}`
                      : live
                        ? (STATUS_LABEL[live] ?? live)
                        : 'Submitted to WhatsApp'}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="ms-hint">
            “Submitted” means WhatsApp accepted it; delivery updates arrive a few seconds later.
          </p>
        </div>
      )}
    </Modal>
  );
}
