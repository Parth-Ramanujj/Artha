import { useState } from 'react';
import { ExternalLink, FileSpreadsheet, Play } from 'lucide-react';
import { googleApi } from '../../services/api';

export type GoogleServiceChoice = 'gmail' | 'calendar' | 'sheets' | 'drive';

/** Which Google service each integration type connects. */
export const GOOGLE_TYPE_SERVICE: Record<string, GoogleServiceChoice> = {
  google_gmail: 'gmail',
  google_calendar: 'calendar',
  google_sheets: 'sheets',
  google_drive: 'drive',
};

export function isGoogleType(type: string): boolean {
  return type in GOOGLE_TYPE_SERVICE;
}

const SERVICE_HINT: Record<GoogleServiceChoice, string> = {
  gmail: 'Sends emails from your Google account.',
  calendar: 'Reads upcoming events and creates bookings in your calendar.',
  sheets: 'Adds rows to a spreadsheet you choose.',
  drive: 'Works with files this app creates in your Drive.',
};

interface GoogleServiceFieldsProps {
  service: GoogleServiceChoice;
  /** Starts the Google consent page for this service only. */
  onSignIn: () => Promise<void>;
  /** Set for a saved integration: enables the test actions. */
  integrationId: string | null;
  connectedAs: string | null;
  onRunTest: (
    integrationId: string,
    body: { service?: GoogleServiceChoice; to?: string; spreadsheetId?: string; range?: string },
  ) => Promise<void>;
  /** Whether the server has the Google OAuth settings; null while loading. */
  configStatus: { configured: boolean; missing: string[] } | null;
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

/** One Google service: sign in with Google for it, then test it. */
export function GoogleServiceFields({
  service,
  onSignIn,
  integrationId,
  connectedAs,
  onRunTest,
  configStatus,
}: GoogleServiceFieldsProps) {
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [range, setRange] = useState('Sheet1');
  const [sheetFiles, setSheetFiles] = useState<Array<{ id: string; name: string; modifiedTime?: string }> | null>(null);
  const [listError, setListError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p style={{ ...hint, fontSize: 13, margin: 0 }}>{SERVICE_HINT[service]}</p>

      {configStatus && !configStatus.configured && (
        <div className="ms-callout ms-callout-warning" role="alert" style={{ fontSize: 13 }}>
          Google sign-in is not set up on this server yet. Add {configStatus.missing.join(', ')} to the server&apos;s{' '}
          <code>.env</code> file and restart it.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || configStatus?.configured === false}
          onClick={() => run(onSignIn)}
        >
          <ExternalLink size={14} /> {integrationId ? 'Reconnect with Google' : 'Continue with Google'}
        </button>
        <span style={hint}>Google asks you to pick the account and approve access, then brings you back here.</span>
        {connectedAs && (
          <span style={{ ...hint, color: 'var(--primary-hover, #1da851)' }}>Connected as {connectedAs}</span>
        )}
      </div>

      {integrationId && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            borderTop: '1px solid var(--border)',
            paddingTop: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Test this connection</span>

          {service === 'gmail' && (
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
                disabled={busy || !testTo.trim()}
                onClick={() => run(() => onRunTest(integrationId, { service: 'gmail', to: testTo.trim() }))}
              >
                <Play size={14} /> Send
              </button>
            </div>
          )}

          {service === 'calendar' && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => run(() => onRunTest(integrationId, { service: 'calendar' }))}
            >
              <Play size={14} /> Read upcoming events
            </button>
          )}

          {service === 'drive' && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => run(() => onRunTest(integrationId, { service: 'drive' }))}
            >
              <Play size={14} /> Check Drive access
            </button>
          )}

          {service === 'sheets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  run(async () => {
                    setListError('');
                    try {
                      const res = await googleApi.spreadsheets(integrationId);
                      setSheetFiles(res.files);
                    } catch (err: unknown) {
                      setSheetFiles(null);
                      setListError(err instanceof Error ? err.message : 'Could not list your spreadsheets');
                    }
                  })
                }
              >
                <FileSpreadsheet size={14} /> {sheetFiles ? 'Refresh my spreadsheets' : 'Show my spreadsheets'}
              </button>
              {listError && (
                <span role="alert" style={{ ...hint, color: 'var(--error, #ef4444)' }}>
                  {listError}
                </span>
              )}
              {sheetFiles && sheetFiles.length === 0 && (
                <span style={hint}>No spreadsheets found in this account.</span>
              )}
              {sheetFiles && sheetFiles.length > 0 && (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    maxHeight: 240,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {sheetFiles.map(f => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setSheetId(f.id)}
                        aria-pressed={sheetId === f.id}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: `1px solid ${sheetId === f.id ? 'var(--primary, #25d366)' : 'var(--border)'}`,
                          background: sheetId === f.id ? 'var(--primary-soft)' : 'transparent',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        <strong>{f.name}</strong>
                        <span style={{ ...hint, display: 'block' }}>
                          {f.modifiedTime ? `Edited ${new Date(f.modifiedTime).toLocaleDateString()} · ` : ''}
                          {f.id}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 8,
                  alignItems: 'end',
                }}
              >
                <label style={label}>
                  Spreadsheet ID
                  <input
                    className="input"
                    placeholder="1AbC…"
                    value={sheetId}
                    onChange={e => setSheetId(e.target.value)}
                  />
                  <span style={hint}>From the sheet&apos;s URL. The test adds one row.</span>
                </label>
                <label style={label}>
                  Tab name
                  <input className="input" value={range} onChange={e => setRange(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || !sheetId.trim()}
                  onClick={() =>
                    run(() =>
                      onRunTest(integrationId, {
                        service: 'sheets',
                        spreadsheetId: sheetId.trim(),
                        range: range.trim(),
                      }),
                    )
                  }
                >
                  <Play size={14} /> Add test row
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
