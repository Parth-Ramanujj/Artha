import { useState } from 'react';
import { Send } from 'lucide-react';

export interface EmailFormValues {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromAddress: string;
  fromName: string;
}

export const EMPTY_EMAIL_FORM: EmailFormValues = {
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  fromAddress: '',
  fromName: '',
};

interface EmailIntegrationFieldsProps {
  values: EmailFormValues;
  onChange: (patch: Partial<EmailFormValues>) => void;
  /** Set only for a saved integration: a test email needs the saved settings. */
  integrationId: string | null;
  onSendTest: (integrationId: string, to: string) => Promise<void>;
}

const label = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
};
const hint = { fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 400 };

/** The SMTP settings and test-send for an email integration. */
export function EmailIntegrationFields({ values, onChange, integrationId, onSendTest }: EmailIntegrationFieldsProps) {
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState(false);
  const port = Number(values.smtpPort);
  const portOk = Number.isInteger(port) && port >= 1 && port <= 65535;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <label style={label}>
          SMTP host *
          <input
            className="input"
            placeholder="smtp.gmail.com"
            value={values.smtpHost}
            onChange={e => onChange({ smtpHost: e.target.value })}
          />
        </label>
        <label style={label}>
          Port *
          <input
            className="input"
            inputMode="numeric"
            value={values.smtpPort}
            aria-invalid={!portOk}
            onChange={e => onChange({ smtpPort: e.target.value })}
          />
          <span style={hint}>587 (STARTTLS) or 465 (SSL)</span>
        </label>
      </div>

      <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 8, fontWeight: 500 }}>
        <input type="checkbox" checked={values.smtpSecure} onChange={e => onChange({ smtpSecure: e.target.checked })} />
        Use SSL/TLS from the start (usually port 465)
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <label style={label}>
          Username *
          <input
            className="input"
            autoComplete="off"
            value={values.smtpUser}
            onChange={e => onChange({ smtpUser: e.target.value })}
          />
        </label>
        <label style={label}>
          Password / app password *
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={values.smtpPassword}
            onChange={e => onChange({ smtpPassword: e.target.value })}
          />
          <span style={hint}>Stored on the server. For Gmail, use an App Password, not your login password.</span>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <label style={label}>
          From address *
          <input
            className="input"
            placeholder="sales@yourcompany.com"
            value={values.fromAddress}
            onChange={e => onChange({ fromAddress: e.target.value })}
          />
        </label>
        <label style={label}>
          From name
          <input
            className="input"
            placeholder="Your Company"
            value={values.fromName}
            onChange={e => onChange({ fromName: e.target.value })}
          />
        </label>
      </div>

      {integrationId ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ ...label, flex: 1 }}>
            Send a test email to
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={sending || !testTo.trim()}
            onClick={async () => {
              setSending(true);
              try {
                await onSendTest(integrationId, testTo.trim());
              } finally {
                setSending(false);
              }
            }}
          >
            <Send size={14} /> {sending ? 'Sending…' : 'Send test'}
          </button>
        </div>
      ) : (
        <span style={hint}>Save the integration first, then you can send a test email from here.</span>
      )}
    </>
  );
}
