import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, ListChecks, Loader2, Pause, Play, Upload, XCircle } from 'lucide-react';
import { aiCallingApi, type AiCallBatch, type CallContact } from '../../services/api';
import { useToast } from '../Toast';
import { EmptyState, Pill } from './shared';
import { errorText, formatWhen, label, panel } from './callMeta';

const BATCH_COLOR: Record<AiCallBatch['status'], string> = {
  running: '#3b82f6',
  paused: '#f59e0b',
  completed: '#22c55e',
  canceled: '#94a3b8',
};

function Progress({ batch }: { batch: AiCallBatch }) {
  const c = batch.counts;
  const done =
    (c.completed ?? 0) + (c.no_answer ?? 0) + (c.busy ?? 0) + (c.failed ?? 0) + (c.canceled ?? 0) + (c.skipped ?? 0);
  const pct = batch.totalContacts ? Math.round((done / batch.totalContacts) * 100) : 0;
  return (
    <div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: BATCH_COLOR[batch.status] }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
        {done}/{batch.totalContacts} done · {c.completed ?? 0} talked · {batch.verified} verified ·{' '}
        {(c.no_answer ?? 0) + (c.busy ?? 0)} unanswered · {c.skipped ?? 0} DND
      </div>
    </div>
  );
}

export function BatchesTab({ refreshKey, onActivity }: { refreshKey: number; onActivity?: () => void }) {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const [batches, setBatches] = useState<AiCallBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{
    fileName: string;
    contacts: CallContact[];
    invalid: number;
    duplicates: number;
  } | null>(null);
  const [name, setName] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [reading, setReading] = useState(false);
  const [starting, setStarting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setLoading(true);
      aiCallingApi
        .batches()
        .then(list => {
          setBatches(list);
          if (quiet) onActivity?.();
        })
        .catch(err => {
          if (!quiet) toastRef.current.error(errorText(err, 'Could not load call lists'));
        })
        .finally(() => setLoading(false));
    },
    [onActivity],
  );

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const running = batches.some(b => b.status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => load(true), 5000);
    return () => window.clearInterval(timer);
  }, [running, load]);

  const readFile = async (file: File) => {
    setReading(true);
    try {
      const parsed = await aiCallingApi.previewUpload(file);
      setPreview({ fileName: file.name, ...parsed });
      setName(file.name.replace(/\.(xlsx|csv|txt)$/i, ''));
    } catch (err) {
      toast.error(errorText(err, 'Could not read this file'));
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const start = async () => {
    if (!preview) return;
    setStarting(true);
    try {
      const batch = await aiCallingApi.createBatch({
        name: name || preview.fileName,
        contacts: preview.contacts,
        sendWhatsapp,
        source: 'upload',
      });
      toast.success(
        `Calling ${batch.queued} numbers${batch.skipped ? ` (${batch.skipped} skipped: DND or already queued)` : ''}`,
      );
      setPreview(null);
      load(true);
    } catch (err) {
      toast.error(errorText(err, 'Could not start the list'));
    } finally {
      setStarting(false);
    }
  };

  const act = async (batch: AiCallBatch, action: 'pause' | 'resume' | 'cancel') => {
    try {
      await aiCallingApi.batchAction(batch.id, action);
      load(true);
    } catch (err) {
      toast.error(errorText(err, 'Could not update the list'));
    }
  };

  return (
    <div>
      <div style={{ ...panel, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Call a list of numbers</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Upload an Excel (.xlsx) or CSV file with a phone column (and optionally a name column). Numbers that opted out
          (DND) are skipped automatically.
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.csv,.txt"
          style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && void readFile(e.target.files[0])}
        />
        <button className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={reading}>
          {reading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Choose file
        </button>

        {preview && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
              <FileSpreadsheet size={16} /> <b>{preview.fileName}</b>
              <Pill color="#22c55e">{preview.contacts.length} numbers</Pill>
              {preview.invalid > 0 && <Pill color="#f59e0b">{preview.invalid} invalid</Pill>}
              {preview.duplicates > 0 && <Pill color="#94a3b8">{preview.duplicates} duplicates</Pill>}
            </div>
            {preview.contacts.length > 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '8px 0' }}>
                {preview.contacts
                  .slice(0, 5)
                  .map(c => `${c.name ?? 'No name'} (${c.phone})`)
                  .join(', ')}
                {preview.contacts.length > 5 ? ` and ${preview.contacts.length - 5} more` : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
              <div style={{ flex: '1 1 240px', maxWidth: 340 }}>
                <label style={label} htmlFor="batch-name">
                  List name
                </label>
                <input
                  id="batch-name"
                  className="input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" checked={sendWhatsapp} onChange={e => setSendWhatsapp(e.target.checked)} />
                Send the WhatsApp follow-up to verified leads
              </label>
              <button
                className="btn-primary"
                onClick={() => void start()}
                disabled={starting || preview.contacts.length === 0}
              >
                {starting ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Start calling
              </button>
              <button className="btn-secondary" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={26} className="animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={30} />}
          title="No call lists yet"
          hint="Upload a sheet above to start calling."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {batches.map(batch => (
            <div key={batch.id} style={{ ...panel, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <b>{batch.name}</b>
                  <Pill color={BATCH_COLOR[batch.status]}>{batch.status}</Pill>
                  {batch.sendWhatsapp && <Pill color="#25d366">WhatsApp follow-up</Pill>}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatWhen(batch.createdAt)}</span>
                </div>
                <Progress batch={batch} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {batch.status === 'running' && (
                  <button className="btn-secondary" onClick={() => void act(batch, 'pause')}>
                    <Pause size={14} /> Pause
                  </button>
                )}
                {batch.status === 'paused' && (
                  <button className="btn-secondary" onClick={() => void act(batch, 'resume')}>
                    <Play size={14} /> Resume
                  </button>
                )}
                {(batch.status === 'running' || batch.status === 'paused') && (
                  <button className="btn-secondary" onClick={() => void act(batch, 'cancel')}>
                    <XCircle size={14} /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
