import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Unlink, Workflow } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { workflowApi, type WorkflowDefinition } from '../../services/api';
import type { StudioTemplate } from '../../types/messageStudio';
import { buttonReplyWorkflow, withKeyword, workflowKeywords } from '../../utils/metaTemplate';

type Def = Parameters<typeof withKeyword>[0];
const def = (w: WorkflowDefinition) => w.definition as Def;

/**
 * What happens when someone taps a template's quick-reply buttons. A tap arrives as a message with the
 * button's text, so linking means: a keyword workflow listens for that text.
 */
export function TemplateAutomationsDialog({ template, onClose }: { template: StudioTemplate; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const workflows = useQuery({ queryKey: ['workflows', 'all'], queryFn: () => workflowApi.list({ limit: 200 }) });
  const all = workflows.data ?? [];
  const keywordWorkflows = all.filter(w => (w.definition as Def)?.trigger?.type === 'keyword_match');
  const quickReplies = template.buttons.filter(b => b.type === 'QUICK_REPLY' && b.text);
  const others = template.buttons.filter(b => b.type !== 'QUICK_REPLY');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workflows'] });
  const fail = (e: Error) => toast.error('Could not update the automation', e.message);

  const link = useMutation({
    mutationFn: async ({ button, workflow }: { button: string; workflow: WorkflowDefinition }) =>
      workflowApi.update(workflow.id, { definition: withKeyword(def(workflow), button, true) }),
    onSuccess: (_r, v) => {
      void refresh();
      toast.success('Linked', `Tapping “${v.button}” now starts “${v.workflow.name}”.`);
    },
    onError: fail,
  });
  const reply = useMutation({
    mutationFn: async ({ button, text }: { button: string; text: string }) => {
      const wf = await workflowApi.create(buttonReplyWorkflow(template.name, button, text));
      await workflowApi.publish(wf.id);
    },
    onSuccess: (_r, v) => {
      void refresh();
      toast.success('Auto-reply on', `Tapping “${v.button}” now sends your reply.`);
    },
    onError: fail,
  });
  const unlink = useMutation({
    mutationFn: async ({ button, workflow }: { button: string; workflow: WorkflowDefinition }) => {
      const next = withKeyword(def(workflow), button, false);
      // A keyword workflow needs at least one keyword; with none left it is switched off instead.
      if (workflowKeywords(next).length === 0) return workflowApi.disable(workflow.id);
      return workflowApi.update(workflow.id, { definition: next });
    },
    onSuccess: () => void refresh(),
    onError: fail,
  });

  return (
    <Modal open onClose={onClose} title={`Button automations — ${template.name}`} className="ms-modal-wide">
      <p className="mt-help">
        When someone taps a quick-reply button, WhatsApp sends you the button&apos;s text. Choose what happens next.
      </p>

      {workflows.isLoading ? (
        <div className="ms-state">Loading automations…</div>
      ) : quickReplies.length === 0 ? (
        <div className="ms-state">This template has no quick-reply buttons, so there is nothing to automate.</div>
      ) : (
        <div className="ta-list">
          {quickReplies.map(b => (
            <ButtonRow
              key={b.text}
              button={b.text}
              linked={all.filter(w => w.status !== 'disabled' && workflowKeywords(def(w)).includes(b.text.toLowerCase()))}
              candidates={keywordWorkflows.filter(w => !workflowKeywords(def(w)).includes(b.text.toLowerCase()))}
              busy={link.isPending || reply.isPending || unlink.isPending}
              onLink={w => link.mutate({ button: b.text, workflow: w })}
              onReply={text => reply.mutate({ button: b.text, text })}
              onUnlink={w => unlink.mutate({ button: b.text, workflow: w })}
            />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <p className="mt-help">
          {others.map(b => b.text || 'Copy offer code').join(', ')}: these buttons open a link, a call or a form, so they
          need no automation.
        </p>
      )}
      <p className="mt-help">
        Need more steps (ask questions, save a lead, hand over to a person)? Build it in{' '}
        <Link to="/workflows">Workflows</Link> with a keyword trigger, then link it here.
      </p>
    </Modal>
  );
}

function ButtonRow({
  button,
  linked,
  candidates,
  busy,
  onLink,
  onReply,
  onUnlink,
}: {
  button: string;
  linked: WorkflowDefinition[];
  candidates: WorkflowDefinition[];
  busy: boolean;
  onLink: (w: WorkflowDefinition) => void;
  onReply: (text: string) => void;
  onUnlink: (w: WorkflowDefinition) => void;
}) {
  const [mode, setMode] = useState<'reply' | 'workflow' | null>(null);
  const [text, setText] = useState('');
  const [pick, setPick] = useState('');

  return (
    <section className="mt-card">
      <h3 className="mt-card-title">
        When someone taps “{button}”
      </h3>
      {linked.length === 0 ? (
        <p className="mt-help">Nothing happens yet — you see their tap in Chats and reply yourself.</p>
      ) : (
        <ul className="ta-linked">
          {linked.map(w => (
            <li key={w.id}>
              <Workflow size={14} aria-hidden="true" /> {w.name}{' '}
              <span className="mt-optional">· {w.status}</span>
              <button className="btn-link" disabled={busy} onClick={() => onUnlink(w)}>
                <Unlink size={13} /> Unlink
              </button>
            </li>
          ))}
        </ul>
      )}
      {linked.length > 1 && (
        <p className="ms-field-error">Only one automation answers each message — keep a single link per button.</p>
      )}

      {mode === null && (
        <div className="wt-actions">
          <button className="mt-chip" onClick={() => setMode('reply')}>
            <Plus size={13} /> Send a reply
          </button>
          <button className="mt-chip" onClick={() => setMode('workflow')} disabled={candidates.length === 0}>
            <Plus size={13} /> Start an existing workflow
          </button>
        </div>
      )}
      {mode === 'reply' && (
        <div className="ms-field">
          <textarea
            className="ms-input"
            rows={3}
            maxLength={4096}
            placeholder={`What should we send when someone taps “${button}”?`}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="wt-actions">
            <button
              className="btn btn-primary"
              disabled={!text.trim() || busy}
              onClick={() => {
                onReply(text.trim());
                setMode(null);
                setText('');
              }}
            >
              Save reply
            </button>
            <button className="btn btn-secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {mode === 'workflow' && (
        <div className="ms-field">
          <select className="ms-input" value={pick} onChange={e => setPick(e.target.value)} aria-label="Workflow">
            <option value="">Choose a workflow with a keyword trigger</option>
            {candidates.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.status})
              </option>
            ))}
          </select>
          <span className="mt-help">“{button}” is added to that workflow&apos;s keywords. Its other keywords keep working.</span>
          <div className="wt-actions">
            <button
              className="btn btn-primary"
              disabled={!pick || busy}
              onClick={() => {
                const w = candidates.find(c => c.id === pick);
                if (w) onLink(w);
                setMode(null);
                setPick('');
              }}
            >
              Link workflow
            </button>
            <button className="btn btn-secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
