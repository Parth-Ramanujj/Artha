import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CircleDashed, History, Loader2, RefreshCw, Search, XCircle } from 'lucide-react';
import { workflowApi, type WorkflowDefinition, type WorkflowRun } from '../../services/api';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { matchesSearch, summarizeRun, type RunSummary } from '../../utils/runLog';

const STATUSES = ['failed', 'completed', 'paused', 'running', 'timed_out', 'cancelled'];

const statusIcon = (status: string) =>
  status === 'success' || status === 'completed' ? (
    <CheckCircle2 size={14} className="step-icon-success" aria-hidden="true" />
  ) : status === 'failed' ? (
    <XCircle size={14} className="step-icon-error" aria-hidden="true" />
  ) : (
    <CircleDashed size={14} aria-hidden="true" />
  );

/** Execution History: every run with who wrote what, where it stopped and why. */
export function WorkflowRunLog() {
  const toast = useToast();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflowId, setWorkflowId] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [inspect, setInspect] = useState<{ run: WorkflowRun; summary: RunSummary } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      workflowApi.listRuns({ limit: 100, workflowId: workflowId || undefined, status: status || undefined }),
      workflowApi.list({ limit: 100 }),
    ])
      .then(([r, w]) => {
        setRuns(r);
        setWorkflows(w);
      })
      .catch(err => toast.error('Error', err instanceof Error ? err.message : 'Failed to load execution runs'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [workflowId, status]);

  const rows = useMemo(() => {
    const byId = new Map(workflows.map(w => [w.id, w]));
    return runs
      .map(run => ({ run, summary: summarizeRun(run, byId.get(run.workflowId)) }))
      .filter(r => matchesSearch(r.summary, query));
  }, [runs, workflows, query]);

  return (
    <div className="run-log">
      <div className="run-log-filters">
        <label className="run-log-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search name, number, message or error…"
            aria-label="Search runs"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        <select
          className="form-select"
          aria-label="Filter by workflow"
          value={workflowId}
          onChange={e => setWorkflowId(e.target.value)}
        >
          <option value="">All workflows</option>
          {workflows.map(w => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          className="form-select"
          aria-label="Filter by status"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && runs.length === 0 ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <History size={48} strokeWidth={1} />
          <p>{runs.length === 0 ? 'No execution runs recorded yet' : 'No runs match these filters'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Workflow</th>
                <th>Contact</th>
                <th>Message</th>
                <th>Status</th>
                <th>Where it stopped</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ run, summary }) => (
                <tr key={run.id}>
                  <td className="run-log-when">{new Date(run.createdAt).toLocaleString()}</td>
                  <td>
                    {summary.workflowName}
                    {summary.isTest && <span className="run-log-test">test</span>}
                  </td>
                  <td>{summary.contact}</td>
                  <td className="run-log-message" title={summary.message}>
                    {summary.message || '—'}
                  </td>
                  <td>
                    <span className={`run-status-badge ${run.status}`}>{run.status.replace('_', ' ')}</span>
                  </td>
                  <td>
                    {summary.stoppedAt ? (
                      <span className="run-log-stop" title={summary.stoppedAt.error}>
                        <strong>{summary.stoppedAt.label}</strong>
                        <span>{summary.stoppedAt.error}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <button className="btn-secondary btn-sm" onClick={() => setInspect({ run, summary })}>
                      Steps
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inspect && (
        <Modal
          open
          onClose={() => setInspect(null)}
          title={`${inspect.summary.workflowName} · ${new Date(inspect.run.createdAt).toLocaleString()}`}
          closeLabel="Close"
          footer={
            <button className="btn-secondary" onClick={() => setInspect(null)}>
              Close
            </button>
          }
        >
          <div className="run-log-detail">
            <dl className="run-log-meta">
              <dt>Contact</dt>
              <dd>{inspect.summary.contact}</dd>
              <dt>Message</dt>
              <dd>{inspect.summary.message || '—'}</dd>
              <dt>Status</dt>
              <dd>
                <span className={`run-status-badge ${inspect.run.status}`}>{inspect.run.status}</span>
              </dd>
            </dl>

            {inspect.summary.stoppedAt && (
              <div className="test-error-banner">
                <AlertCircle size={15} />
                <span>
                  Stopped at <strong>{inspect.summary.stoppedAt.label}</strong>: {inspect.summary.stoppedAt.error}
                </span>
              </div>
            )}

            <ol className="test-steps-list run-log-steps">
              {inspect.summary.steps.map((s, i) => (
                <li key={i} className={`test-step-item run-log-step ${s.status}`}>
                  <div className="step-item-title">
                    {statusIcon(s.status)}
                    <span>
                      {i + 1}. <strong>{s.label}</strong> <small>{s.type.replace(/_/g, ' ')}</small>
                    </span>
                    <small className="run-log-duration">
                      {s.status}
                      {s.durationMs !== undefined && ` · ${(s.durationMs / 1000).toFixed(1)}s`}
                    </small>
                  </div>
                  {s.error && <p className="step-error-msg">{s.error}</p>}
                  {s.output && (
                    <details>
                      <summary>Output</summary>
                      <pre className="step-output-json">{JSON.stringify(s.output, null, 2)}</pre>
                    </details>
                  )}
                </li>
              ))}
              {inspect.summary.notRun.map(label => (
                <li key={label} className="test-step-item run-log-step not-run">
                  <div className="step-item-title">
                    <CircleDashed size={14} aria-hidden="true" />
                    <span>
                      <strong>{label}</strong>
                    </span>
                    <small className="run-log-duration">did not run</small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Modal>
      )}
    </div>
  );
}
