import { useState } from 'react';
import {
  Copy,
  Check,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Play,
  Layers,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { WorkflowRun } from '../../services/api';
import type { FieldAssignment, WorkflowNodeData } from './types';

interface RunStep {
  actionId?: string;
  status?: string;
  durationMs?: number;
  output?: unknown;
}

export interface OutputSchemaField {
  label: string;
  token: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  description: string;
  example?: unknown;
}

interface NodeOutputInspectorProps {
  node: Node;
  lastRun?: WorkflowRun | null;
  onCopyToken?: (token: string) => void;
  onTestNode?: () => void;
  isTesting?: boolean;
}

export function getNodeOutputs(node: Node): OutputSchemaField[] {
  const type = node.type || '';
  const id = node.id;
  const cfg = (node.data as Partial<WorkflowNodeData>)?.config || {};

  switch (type) {
    case 'trigger':
      return [
        { label: 'Sender Phone', token: 'trigger.phone', type: 'string', description: 'Customer WhatsApp phone number without @c.us', example: '919876543210' },
        { label: 'Message Body', token: 'trigger.message', type: 'string', description: 'Incoming WhatsApp text', example: 'Track my order 1234' },
        { label: 'Contact Name', token: 'trigger.contactName', type: 'string', description: 'Customer WhatsApp profile name', example: 'Parth' },
        { label: 'Sender Chat ID', token: 'trigger.chatId', type: 'string', description: 'Full WhatsApp JID identifier', example: '919876543210@c.us' },
        { label: 'Contact Name (Profile)', token: 'contact.name', type: 'string', description: 'Contact record full name', example: 'Parth' },
        { label: 'Contact Phone (Profile)', token: 'contact.phone', type: 'string', description: 'Contact record phone', example: '919876543210' },
      ];
    case 'webhook_call': {
      const mappings: Array<{ path: string; variable: string }> = Array.isArray(cfg.responseMapping) ? cfg.responseMapping : [];
      const fields: OutputSchemaField[] = [
        { label: 'Response Body (JSON)', token: `steps.${id}.data`, type: 'object', description: 'Full parsed JSON response payload', example: { status: 'success', orderId: 'ORD-8921', total: 1499 } },
        { label: 'HTTP Status Code', token: `steps.${id}.status`, type: 'number', description: 'HTTP response code (e.g. 200, 201)', example: 200 },
        { label: 'Roundtrip Duration (ms)', token: `steps.${id}.durationMs`, type: 'number', description: 'Execution time in milliseconds', example: 142 },
      ];
      mappings.forEach(m => {
        if (m.variable) {
          fields.push({
            label: `Mapped: {{vars.${m.variable}}}`,
            token: `vars.${m.variable}`,
            type: 'string',
            description: `Mapped variable from "${m.path}"`,
            example: 'mapped_val',
          });
        }
      });
      return fields;
    }
    case 'ask_question': {
      const slot = cfg.slot || 'response';
      return [
        { label: 'Customer Reply Text', token: `steps.${id}.answer`, type: 'string', description: 'Text reply provided by customer', example: 'Delhi, India' },
        { label: `Slot Variable: {{vars.${slot}}}`, token: `vars.${slot}`, type: 'string', description: 'Saved slot synced to customer variables', example: 'Delhi, India' },
      ];
    }
    case 'interactive_buttons':
      return [
        { label: 'Selected Button ID', token: `steps.${id}.choice`, type: 'string', description: 'ID of button tapped by customer', example: 'opt_1' },
        { label: 'Selected Button Text', token: `steps.${id}.userReply`, type: 'string', description: 'Label text of tapped button', example: 'Track Order' },
        { label: 'Last Chosen Choice', token: 'vars.lastChoice', type: 'string', description: 'Most recent button choice variable', example: 'opt_1' },
      ];
    case 'ai_assistant':
      return [
        { label: 'AI Generated Reply', token: `steps.${id}.reply`, type: 'string', description: 'Generated LLM response', example: 'Your order is currently out for delivery...' },
        { label: 'Confidence Score', token: `steps.${id}.confidence`, type: 'number', description: 'Confidence score (0 to 1)', example: 0.96 },
      ];
    case 'condition_branch':
      return [
        { label: 'Condition Result', token: `steps.${id}.matched`, type: 'boolean', description: 'Evaluated boolean condition result', example: true },
        { label: 'Active Branch Path', token: `steps.${id}.branch`, type: 'string', description: 'Branch taken: "true" or "false"', example: 'true' },
      ];
    case 'send_message':
      return [
        { label: 'Sent Message Text', token: `steps.${id}.text`, type: 'string', description: 'Rendered text delivered to customer', example: 'Hello! Thank you for contacting us.' },
        { label: 'WhatsApp Message ID', token: `steps.${id}.messageId`, type: 'string', description: 'Delivered WhatsApp message ID', example: 'wamid.HBg...' },
      ];
    case 'set_fields': {
      const assignments = Array.isArray(cfg.assignments) ? cfg.assignments : [];
      const fields: OutputSchemaField[] = [
        { label: 'Updated Variables Map', token: `steps.${id}.variables`, type: 'object', description: 'All variables modified by this node' },
      ];
      assignments.forEach((a: FieldAssignment) => {
        if (a && a.name) {
          fields.push({
            label: `Variable: {{vars.${a.name}}}`,
            token: `vars.${a.name}`,
            type: 'string',
            description: `Value of custom variable '${a.name}'`,
            example: a.value || 'test_val',
          });
        }
      });
      return fields;
    }
    case 'google_sheets':
      return [
        { label: 'Append Success', token: `steps.${id}.success`, type: 'boolean', description: 'Whether the row was appended to the sheet', example: true },
        { label: 'HTTP Status Code', token: `steps.${id}.statusCode`, type: 'number', description: 'Apps script response status', example: 200 },
      ];
    case 'send_media':
      return [
        { label: 'Message Sent', token: `steps.${id}.sent`, type: 'boolean', description: 'Whether the media message was sent', example: true },
        { label: 'Delivered Message ID', token: `steps.${id}.messageId`, type: 'string', description: 'Assigned WhatsApp message ID', example: 'wamid.HBg...' },
      ];
    default:
      return [
        { label: 'Step Output Data', token: `steps.${id}`, type: 'object', description: 'Full step output record', example: {} },
      ];
  }
}

export function NodeOutputInspector({
  node,
  lastRun,
  onCopyToken,
  onTestNode,
  isTesting = false,
}: NodeOutputInspectorProps) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{ schema: boolean; execution: boolean }>({
    schema: true,
    execution: true,
  });

  const schemaOutputs = getNodeOutputs(node);

  // Look for step in lastRun
  const stepRun = (lastRun?.steps as RunStep[] | undefined)?.find(
    s => s && (s.actionId === node.id || node.data?.actionId === s.actionId),
  );

  const handleCopy = (token: string) => {
    const canonical = token.startsWith('{{') ? token : `{{${token}}}`;
    navigator.clipboard.writeText(canonical);
    setCopiedToken(canonical);
    if (onCopyToken) onCopyToken(canonical);
    setTimeout(() => setCopiedToken(null), 1800);
  };

  const handleCopyOutputJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1800);
  };

  return (
    <div className="node-output-inspector">
      <div className="output-inspector-header">
        <div className="output-inspector-title">
          <Layers size={14} className="text-emerald-400" />
          <span>Node Output &amp; Variables</span>
        </div>
        {onTestNode && (
          <button
            type="button"
            className="output-test-node-btn"
            onClick={onTestNode}
            disabled={isTesting}
            title="Test this node and capture live outputs"
          >
            {isTesting ? (
              <span className="spinner-mini" />
            ) : (
              <Play size={11} className="fill-current" />
            )}
            <span>{isTesting ? 'Testing...' : 'Test Step'}</span>
          </button>
        )}
      </div>

      {/* SECTION 1: LIVE TEST RUN OUTPUT (if available) */}
      <div className="output-inspector-section">
        <div
          className="output-section-toggle"
          onClick={() =>
            setExpandedSections(prev => ({ ...prev, execution: !prev.execution }))
          }
        >
          <div className="section-title-left">
            {expandedSections.execution ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="section-title-text">Latest Execution Result</span>
            {stepRun ? (
              <span
                className={`output-status-pill ${
                  stepRun.status === 'completed'
                    ? 'status-success'
                    : stepRun.status === 'failed'
                    ? 'status-failed'
                    : 'status-paused'
                }`}
              >
                {(stepRun.status || 'unknown').toUpperCase()}
              </span>
            ) : (
              <span className="output-status-pill status-untested">NOT TESTED YET</span>
            )}
          </div>
          {stepRun && stepRun.durationMs !== undefined && (
            <span className="output-duration-pill">
              <Clock size={11} /> {stepRun.durationMs}ms
            </span>
          )}
        </div>

        {expandedSections.execution && (
          <div className="output-section-body">
            {stepRun ? (
              <div className="output-execution-card">
                <div className="output-meta-row">
                  <span className="output-meta-item">
                    <strong>Run ID:</strong> {lastRun?.id?.slice(0, 8)}...
                  </span>
                  <button
                    type="button"
                    className="output-copy-json-btn"
                    onClick={() => handleCopyOutputJson(stepRun.output)}
                    title="Copy output payload as JSON"
                  >
                    {copiedJson ? (
                      <>
                        <Check size={11} className="text-emerald-400" /> Copied JSON
                      </>
                    ) : (
                      <>
                        <Copy size={11} /> Copy JSON
                      </>
                    )}
                  </button>
                </div>

                <div className="output-json-viewer">
                  <pre>{JSON.stringify(stepRun.output || {}, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <div className="output-untested-banner">
                <Sparkles size={14} className="text-slate-400" />
                <div className="untested-text">
                  <p className="untested-title">No execution data for this node yet</p>
                  <p className="untested-sub">
                    Run a test simulation or click &quot;Test Step&quot; above to capture real runtime output. Downstream nodes can reference the schema fields below.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: OUTPUT SCHEMA DEFINITION */}
      <div className="output-inspector-section">
        <div
          className="output-section-toggle"
          onClick={() =>
            setExpandedSections(prev => ({ ...prev, schema: !prev.schema }))
          }
        >
          <div className="section-title-left">
            {expandedSections.schema ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="section-title-text">Output Schema Fields</span>
            <span className="output-count-badge">{schemaOutputs.length}</span>
          </div>
        </div>

        {expandedSections.schema && (
          <div className="output-section-body">
            <div className="output-schema-list">
              {schemaOutputs.map(field => {
                const canonical = `{{${field.token}}}`;
                const isCopied = copiedToken === canonical;

                return (
                  <div key={field.token} className="output-field-card">
                    <div className="field-card-top">
                      <div className="field-card-meta">
                        <span className={`output-type-tag type-${field.type}`}>
                          {field.type}
                        </span>
                        <span className="field-card-label">{field.label}</span>
                      </div>
                      <button
                        type="button"
                        className="field-card-copy-btn"
                        onClick={() => handleCopy(field.token)}
                        title={`Copy ${canonical}`}
                      >
                        {isCopied ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>

                    <div className="field-card-token-line">
                      <code className="field-token-code">{canonical}</code>
                    </div>

                    {field.description && (
                      <p className="field-card-desc">{field.description}</p>
                    )}

                    {field.example !== undefined && (
                      <div className="field-card-example">
                        <span className="example-label">Example preview:</span>
                        <code className="example-val">
                          {typeof field.example === 'object'
                            ? JSON.stringify(field.example)
                            : String(field.example)}
                        </code>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
