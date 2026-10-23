import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Search } from 'lucide-react';
import { googleApi, integrationApi } from '../../services/api';
import { columnToken, extractSheetId, friendlyGoogleError } from '../../utils/googleErrors';

interface SheetsLookupPickerProps {
  nodeId: string;
  // The workflow step config is free-form JSON, so its values are read by key.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
  onChange: (patch: Record<string, unknown>) => void;
}

type Connection = { id: string; type: string; name: string };

const section = { display: 'flex', flexDirection: 'column' as const, gap: 6 };
const help = { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 };
const chip = {
  padding: '3px 9px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function ErrorCard({ raw }: { raw: string }) {
  const e = friendlyGoogleError(raw);
  return (
    <div
      role="alert"
      className="ms-callout ms-callout-warning"
      style={{ fontSize: 12.5, flexDirection: 'column', gap: 4 }}
    >
      <strong style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <AlertTriangle size={14} aria-hidden="true" /> {e.title}
      </strong>
      <span>{e.action}</span>
    </div>
  );
}

/**
 * "Sheets Lookup & Reply", set up by choosing, not typing: pick the connection, the spreadsheet, the tab
 * and the match column from lists. Defaults are filled in automatically.
 */
export function SheetsLookupPicker({ nodeId, config, onChange }: SheetsLookupPickerProps) {
  const integrations = useQuery({
    queryKey: ['integrations', 'list-for-sheets'],
    queryFn: async () => (await integrationApi.list()) as Connection[],
  });
  const connections = (integrations.data ?? []).filter(c => c.type === 'google_sheets');
  const connectionId: string = config.integrationId || '';
  const readAll = config.mode === 'all';

  // One connection: use it without asking.
  useEffect(() => {
    if (!connectionId && connections.length === 1) onChange({ integrationId: connections[0].id });
  }, [connectionId, connections, onChange]);

  const spreadsheets = useQuery({
    queryKey: ['google-spreadsheets', connectionId],
    queryFn: () => googleApi.spreadsheets(connectionId),
    enabled: Boolean(connectionId),
    retry: false,
  });
  const spreadsheetId: string = config.spreadsheetId || '';
  const [manualId, setManualId] = useState(false);

  const preview = useQuery({
    queryKey: ['google-sheet-preview', connectionId, spreadsheetId, config.sheetName || ''],
    queryFn: () => googleApi.sheetPreview(connectionId, spreadsheetId, config.sheetName || undefined),
    enabled: Boolean(connectionId && spreadsheetId),
    retry: false,
  });
  const p = preview.data;

  // Fill the tab and the match column from the sheet, once, so the step is ready without typing.
  useEffect(() => {
    if (!p) return;
    const patch: Record<string, unknown> = {};
    if (!config.sheetName && p.tab) patch.sheetName = p.tab;
    if (!config.keyColumn && p.suggestedKeyColumn) patch.keyColumn = p.suggestedKeyColumn;
    if (Object.keys(patch).length) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.tab, p?.suggestedKeyColumn]);

  const [testValue, setTestValue] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');
  const [testResult, setTestResult] = useState<null | {
    found: boolean;
    rowNumber?: number;
    row?: Record<string, string>;
  }>(null);

  const runTest = async () => {
    setTesting(true);
    setTestError('');
    setTestResult(null);
    try {
      const res = await googleApi.lookup(connectionId, {
        spreadsheetId,
        sheetName: config.sheetName || undefined,
        keyColumn: config.keyColumn || undefined,
        value: testValue.trim(),
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setTesting(false);
    }
  };

  // Click-to-insert: every column becomes a token the reply can use.
  const insertToken = (token: string) => {
    const current: string = config.replyTemplate ?? (readAll ? '' : '{{row}}');
    onChange({ replyTemplate: `${current}${current && !current.endsWith('\n') ? '\n' : ''}${token}` });
  };

  const headers = (p?.headers ?? []).filter(Boolean);
  const exampleRow = p?.sampleRows?.[0];

  return (
    <div className="wf-inspector-section">
      <div className="wf-field-group" style={section}>
        <label className="wf-field-label" htmlFor={`sheets-conn-${nodeId}`}>
          Google account *
        </label>
        {integrations.isLoading ? (
          <span style={help}>
            <Loader2 size={12} className="animate-spin" /> Loading connections…
          </span>
        ) : connections.length === 0 ? (
          <div className="ms-callout ms-callout-info" style={{ fontSize: 12.5 }}>
            No Google Sheets connection yet. Open <strong>Integrations</strong> → <strong>Google Sheets</strong> →
            Continue with Google, then come back here.
          </div>
        ) : (
          <select
            id={`sheets-conn-${nodeId}`}
            className="wf-field-select"
            value={connectionId}
            onChange={e => onChange({ integrationId: e.target.value, spreadsheetId: '', sheetName: '', keyColumn: '' })}
          >
            <option value="">Choose a Google account…</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {connectionId && (
        <div className="wf-field-group" style={section}>
          <label className="wf-field-label" htmlFor={`sheets-file-${nodeId}`}>
            Spreadsheet *
          </label>
          {spreadsheets.isLoading ? (
            <span style={help}>
              <Loader2 size={12} className="animate-spin" /> Loading your sheets…
            </span>
          ) : spreadsheets.isError ? (
            <ErrorCard raw={(spreadsheets.error as Error).message} />
          ) : !manualId && spreadsheets.data?.files.length ? (
            <select
              id={`sheets-file-${nodeId}`}
              className="wf-field-select"
              value={spreadsheetId}
              onChange={e => onChange({ spreadsheetId: e.target.value, sheetName: '', keyColumn: '' })}
            >
              <option value="">Choose a spreadsheet…</option>
              {spreadsheets.data.files.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`sheets-file-${nodeId}`}
              className="wf-field-input"
              placeholder="Paste the spreadsheet link or ID"
              value={spreadsheetId}
              onChange={e => onChange({ spreadsheetId: extractSheetId(e.target.value), sheetName: '', keyColumn: '' })}
            />
          )}
          <button
            type="button"
            className="btn-link"
            onClick={() => setManualId(v => !v)}
            style={{ alignSelf: 'flex-start' }}
          >
            {manualId ? 'Choose from my sheets' : 'Paste an ID instead'}
          </button>
        </div>
      )}

      {spreadsheetId && preview.isLoading && (
        <span style={help}>
          <Loader2 size={12} className="animate-spin" /> Reading the sheet…
        </span>
      )}
      {spreadsheetId && preview.isError && <ErrorCard raw={(preview.error as Error).message} />}

      {p && (
        <>
          <div className="wf-field-group" style={section}>
            <label className="wf-field-label" htmlFor={`sheets-tab-${nodeId}`}>
              Tab
            </label>
            <select
              id={`sheets-tab-${nodeId}`}
              className="wf-field-select"
              value={p.tab}
              onChange={e => onChange({ sheetName: e.target.value, keyColumn: '' })}
            >
              {p.tabs.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="wf-checkbox-row">
            <label className="wf-checkbox-label">
              <input
                type="checkbox"
                checked={readAll}
                onChange={e => onChange({ mode: e.target.checked ? 'all' : 'lookup' })}
              />
              <span>Read all rows (for an AI summary)</span>
            </label>
          </div>
          {readAll && (
            <span style={help}>
              The whole tab is available as {'{{'}steps.{nodeId}.rowsText{'}}'}. Pass it to an AI node to summarize.
            </span>
          )}

          {!readAll && (
          <>
          <div className="wf-field-group" style={section}>
            <label className="wf-field-label" htmlFor={`sheets-key-${nodeId}`}>
              Find the row where this column matches
            </label>
            <select
              id={`sheets-key-${nodeId}`}
              className="wf-field-select"
              value={config.keyColumn || p.suggestedKeyColumn}
              onChange={e => onChange({ keyColumn: e.target.value })}
            >
              {headers.map(h => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span style={help}>Usually the phone number column. Chosen automatically; change it if needed.</span>
          </div>

          <div className="wf-field-group" style={section}>
            <label className="wf-field-label" htmlFor={`sheets-value-${nodeId}`}>
              Value to find <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id={`sheets-value-${nodeId}`}
              className="wf-field-input"
              placeholder="Leave empty to use the number in the customer's message"
              value={config.keyValue ?? ''}
              onChange={e => onChange({ keyValue: e.target.value })}
            />
            <span style={help}>
              Empty: the first phone number in the customer&apos;s message, or their own number if there is none.
            </span>
          </div>
          </>
          )}

          <div className="wf-field-group" style={section}>
            <span className="wf-field-label">Reply when found</span>
            <textarea
              className="wf-field-input"
              rows={5}
              aria-label="Reply when found"
              value={config.replyTemplate ?? (readAll ? '' : '{{row}}')}
              onChange={e => onChange({ replyTemplate: e.target.value })}
            />
            <span style={help}>Click a column to add it to the reply. Empty = send nothing.</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" style={chip} onClick={() => insertToken('{{row}}')}>
                Whole row
              </button>
              {headers.map(h => (
                <button key={h} type="button" style={chip} onClick={() => insertToken(`{{${columnToken(h)}}}`)}>
                  {h}
                </button>
              ))}
            </div>
            {exampleRow && (
              <div
                style={{
                  fontSize: 12,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-tertiary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <strong style={{ display: 'block', marginBottom: 4 }}>Example from row 2</strong>
                {(config.replyTemplate ?? (readAll ? '' : '{{row}}'))
                  .replace(/\{\{\s*row\s*\}\}/g, headers.map((h, i) => `${h}: ${exampleRow[i] ?? ''}`).join('\n'))
                  .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (m: string, key: string) => {
                    const idx = headers.findIndex(h => columnToken(h) === key);
                    return idx >= 0 ? (exampleRow[idx] ?? '') : m;
                  })}
              </div>
            )}
          </div>

          <div className="wf-field-group" style={section}>
            <span className="wf-field-label">Reply when not found</span>
            <textarea
              className="wf-field-input"
              rows={2}
              aria-label="Reply when not found"
              value={config.notFoundMessage ?? ''}
              onChange={e => onChange({ notFoundMessage: e.target.value })}
            />
          </div>

          {!readAll && (
          <div className="wf-field-group" style={section}>
            <span className="wf-field-label">Try it</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="wf-field-input"
                style={{ flex: 1 }}
                placeholder="A phone number from the sheet, e.g. 98255 11193"
                value={testValue}
                onChange={e => setTestValue(e.target.value)}
                aria-label="Test value"
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={testing || !testValue.trim()}
                onClick={runTest}
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Test
              </button>
            </div>
            {testError && <ErrorCard raw={testError} />}
            {testResult && !testResult.found && (
              <div className="ms-callout ms-callout-info" style={{ fontSize: 12.5 }}>
                <AlertTriangle size={14} aria-hidden="true" /> No row matches. The customer would get the “not found”
                message.
              </div>
            )}
            {testResult?.found && testResult.row && (
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  fontSize: 12.5,
                }}
              >
                <div
                  style={{
                    padding: '6px 10px',
                    background: 'var(--primary-soft)',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  <CheckCircle2 size={14} aria-hidden="true" /> Found in row {testResult.rowNumber}
                  <ChevronDown size={12} aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }} />
                </div>
                <dl
                  style={{
                    margin: 0,
                    padding: '6px 10px',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '4px 12px',
                  }}
                >
                  {Object.entries(testResult.row).map(([k, v]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt style={{ color: 'var(--text-secondary)' }}>{k}</dt>
                      <dd style={{ margin: 0, wordBreak: 'break-word' }}>{v || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
