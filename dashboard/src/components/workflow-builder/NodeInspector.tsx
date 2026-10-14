import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Trash2,
  Plus,
  Play,
  AlertCircle,
  Clock,
  Code,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sliders,
  Layers,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Search,
  HelpCircle,
  Send,
  Bot,
  GitBranch,
  CheckCircle2,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { WorkflowNodeData, ButtonItem } from './types';
import { workflowApi, type TestWebhookResult } from '../../services/api';

interface NodeOutputField {
  label: string;
  token: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  example?: string;
}

function getNodeIcon(nodeType: string) {
  switch (nodeType) {
    case 'trigger': return <Sparkles size={13} />;
    case 'webhook_call': return <Code size={13} />;
    case 'ask_question': return <HelpCircle size={13} />;
    case 'interactive_buttons': return <Sliders size={13} />;
    case 'condition_branch': return <GitBranch size={13} />;
    case 'ai_assistant': return <Bot size={13} />;
    case 'send_message': return <Send size={13} />;
    default: return <Layers size={13} />;
  }
}

function getNodeOutputs(node: Node): NodeOutputField[] {
  const type = node.type || '';
  const id = node.id;
  const cfg = (node.data as any)?.config || {};

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
      const fields: NodeOutputField[] = [
        { label: 'Response Body (JSON)', token: `steps.${id}.data`, type: 'object', description: 'Full parsed JSON response payload', example: '{"orderId":"123","status":"shipped","total":1499}' },
        { label: 'Response Status (data.status)', token: `steps.${id}.data.status`, type: 'string', description: 'Order or payment status string', example: 'shipped' },
        { label: 'Order ID (data.orderId)', token: `steps.${id}.data.orderId`, type: 'string', description: 'Unique order identifier', example: 'ORD-8921' },
        { label: 'Total Amount (data.total)', token: `steps.${id}.data.total`, type: 'number', description: 'Numerical price or total', example: '1499' },
        { label: 'HTTP Status Code', token: `steps.${id}.status`, type: 'number', description: 'HTTP response code', example: '200' },
        { label: 'Duration (ms)', token: `steps.${id}.durationMs`, type: 'number', description: 'Roundtrip execution time in ms', example: '142' },
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
        { label: 'Customer Answer', token: `steps.${id}.answer`, type: 'string', description: 'Customer reply text captured by this question', example: 'ORD-8921' },
        { label: `Slot Variable: {{vars.${slot}}}`, token: `vars.${slot}`, type: 'string', description: `Captured variable synced to contact profile`, example: 'ORD-8921' },
      ];
    }
    case 'interactive_buttons':
      return [
        { label: 'Selected Button ID', token: `steps.${id}.choice`, type: 'string', description: 'ID of button chosen by customer', example: 'opt_1' },
        { label: 'Selected Button Text', token: `steps.${id}.userReply`, type: 'string', description: 'Text of chosen option', example: 'Track Order' },
        { label: 'Global Last Choice', token: 'vars.lastChoice', type: 'string', description: 'Most recent button choice variable', example: 'opt_1' },
      ];
    case 'ai_assistant':
      return [
        { label: 'AI Generated Reply', token: `steps.${id}.reply`, type: 'string', description: 'Generated LLM reply text', example: 'Your order is currently out for delivery...' },
        { label: 'Confidence Score', token: `steps.${id}.confidence`, type: 'number', description: 'Model confidence score (0 to 1)', example: '0.96' },
      ];
    case 'condition_branch':
      return [
        { label: 'Condition Result', token: `steps.${id}.matched`, type: 'boolean', description: 'Evaluated boolean condition result', example: 'true' },
        { label: 'Branch Path', token: `steps.${id}.branch`, type: 'string', description: 'Active branch: "true" or "false"', example: 'true' },
      ];
    case 'send_message':
      return [
        { label: 'Sent Message Text', token: `steps.${id}.text`, type: 'string', description: 'Rendered message text that was sent', example: 'Welcome!' },
        { label: 'WhatsApp Message ID', token: `steps.${id}.messageId`, type: 'string', description: 'Delivered WhatsApp message ID', example: 'msg_10023' },
      ];
    default:
      return [
        { label: 'Step Output Data', token: `steps.${id}`, type: 'object', description: 'Full step output record', example: '{}' },
      ];
  }
}

interface NodeInspectorProps {
  selectedNode: { id: string; type: string; data: WorkflowNodeData } | null;
  upstreamNodes?: Node[];
  allNodes?: Node[];
  onUpdateNode: (nodeId: string, updatedData: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeInspector({
  selectedNode,
  upstreamNodes = [],
  allNodes: _allNodes = [],
  onUpdateNode,
  onDeleteNode,
  onClose,
}: NodeInspectorProps) {
  if (!selectedNode) return null;

  const { id, type, data } = selectedNode;
  const [label, setLabel] = useState(data.label || '');
  const [config, setConfig] = useState<Record<string, any>>(data.config || {});

  // Tab & Upstream Explorer state
  const [activeTab, setActiveTab] = useState<'config' | 'upstream'>('config');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetField, setTargetField] = useState<string>('message');
  const [insertedToast, setInsertedToast] = useState<string | null>(null);
  const [copiedVarToken, setCopiedVarToken] = useState<string | null>(null);
  const [customPaths, setCustomPaths] = useState<Record<string, string>>({});

  // Webhook live testing state
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<TestWebhookResult | null>(null);
  const [showTestVars, setShowTestVars] = useState(false);
  const [testVars, setTestVars] = useState({
    phone: '919876543210',
    name: 'Test Customer',
    message: 'Hello, I would like to test this API call',
  });
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Synchronize local state when selected node changes
  useEffect(() => {
    setLabel(data.label || '');
    setConfig(data.config || {});
    setTestResult(null);
    setCopiedResponse(false);
    setActiveTab('config');
    setSearchQuery('');
    setInsertedToast(null);
    const defaultTarget = (
      type === 'ask_question' ? 'prompt' :
      (type === 'webhook_call' ? 'body' :
      (type === 'condition_branch' ? 'value' : 'message'))
    );
    setTargetField(defaultTarget);
  }, [id, data, type]);

  const updateConfig = (key: string, value: any) => {
    const nextConfig = { ...config, [key]: value };
    setConfig(nextConfig);
    onUpdateNode(id, { config: nextConfig });
  };

  const updateLabel = (val: string) => {
    setLabel(val);
    onUpdateNode(id, { label: val });
  };

  // Button management for interactive_buttons
  const buttons: ButtonItem[] = config.buttons || [];
  const addButton = () => {
    const nextIdx = buttons.length + 1;
    const newBtn: ButtonItem = {
      id: `opt_${Date.now()}_${nextIdx}`,
      text: `Option ${nextIdx}`,
    };
    const nextButtons = [...buttons, newBtn];
    updateConfig('buttons', nextButtons);
  };

  const updateButton = (idx: number, field: 'text' | 'id', val: string) => {
    const nextButtons = [...buttons];
    nextButtons[idx] = { ...nextButtons[idx], [field]: val };
    updateConfig('buttons', nextButtons);
  };

  const removeButton = (idx: number) => {
    const nextButtons = buttons.filter((_, i) => i !== idx);
    updateConfig('buttons', nextButtons);
  };

  const targetFieldOptions = useMemo(() => {
    switch (type) {
      case 'send_message':
        return [{ key: 'message', label: 'Message Text' }];
      case 'ask_question':
        return [
          { key: 'prompt', label: 'Question Prompt' },
          { key: 'retryPrompt', label: 'Retry Prompt' },
        ];
      case 'webhook_call':
        return [
          { key: 'url', label: 'Endpoint URL' },
          { key: 'body', label: 'Custom JSON Body' },
        ];
      case 'condition_branch':
        return [
          { key: 'value', label: 'Comparison Value' },
          { key: 'customField', label: 'Custom Field Expression' },
        ];
      case 'ai_assistant':
        return [
          { key: 'systemPrompt', label: 'AI System Instructions' },
        ];
      case 'interactive_buttons':
        return [
          { key: 'message', label: 'Question / Prompt Text' },
        ];
      case 'add_tag':
        return [
          { key: 'tag', label: 'Tag Name' },
        ];
      case 'handoff_to_human':
        return [
          { key: 'assignedName', label: 'Agent / Team Name' },
        ];
      default:
        return [{ key: 'message', label: 'Message Text' }];
    }
  }, [type]);

  const insertVariable = (
    variable: string,
    fieldKey?: string,
  ) => {
    const key = fieldKey || targetField || (
      type === 'ask_question' ? 'prompt' :
      (type === 'webhook_call' ? 'body' :
      (type === 'condition_branch' ? 'value' : 'message'))
    );

    const token = variable.startsWith('{{') ? variable : `{{${variable}}}`;

    if (key === 'customField') {
      updateConfig('customField', token);
      updateConfig('field', token);
      return;
    }

    const current = config[key] || '';
    const nextVal = current ? `${current} ${token}` : token;
    updateConfig(key, nextVal);
  };

  const handleInsertToken = (token: string, targetKey?: string) => {
    const key = targetKey || targetField || (
      type === 'ask_question' ? 'prompt' :
      (type === 'webhook_call' ? 'body' :
      (type === 'condition_branch' ? 'value' : 'message'))
    );
    insertVariable(token, key);
    const targetLabel = targetFieldOptions.find(o => o.key === key)?.label || key;
    const cleanToken = token.startsWith('{{') ? token : `{{${token}}}`;
    setInsertedToast(`Inserted ${cleanToken} into ${targetLabel}!`);
    setTimeout(() => setInsertedToast(null), 2400);
  };

  const handleCopyVar = (token: string) => {
    const full = token.startsWith('{{') ? token : `{{${token}}}`;
    navigator.clipboard.writeText(full);
    setCopiedVarToken(full);
    setTimeout(() => setCopiedVarToken(null), 1800);
  };

  const filteredUpstreamNodes = useMemo(() => {
    if (!upstreamNodes || upstreamNodes.length === 0) return [];
    if (!searchQuery.trim()) return upstreamNodes;
    const q = searchQuery.toLowerCase().trim();
    return upstreamNodes.filter(up => {
      const upLabel = ((up.data as any)?.label || '').toLowerCase();
      const upType = (up.type || '').toLowerCase();
      const upId = up.id.toLowerCase();
      const outputs = getNodeOutputs(up);
      const hasMatchingOutput = outputs.some(
        o => o.label.toLowerCase().includes(q) ||
             o.token.toLowerCase().includes(q) ||
             o.description.toLowerCase().includes(q) ||
             (o.example && o.example.toLowerCase().includes(q))
      );
      return upLabel.includes(q) || upType.includes(q) || upId.includes(q) || hasMatchingOutput;
    });
  }, [upstreamNodes, searchQuery]);

  const builtinHelpers: NodeOutputField[] = [
    { label: "Today's Date", token: 'date', type: 'string', description: 'Current calendar date (YYYY-MM-DD)', example: '2026-10-14' },
    { label: 'Current Time', token: 'time', type: 'string', description: 'Current 24-hr time (HH:mm)', example: '17:30' },
    { label: 'Timestamp (UNIX)', token: 'now', type: 'number', description: 'UNIX epoch seconds', example: '1728905400' },
    { label: 'Random ID', token: 'randomId', type: 'string', description: 'Unique random reference identifier', example: 'req_8f1a9' },
    { label: 'Last Node Data', token: 'steps.last.data', type: 'object', description: 'Output record of immediate previous step', example: '{"status":"ok"}' },
  ];

  // Webhook Query Parameters
  const queryParams: Array<{ key: string; value: string }> = Array.isArray(config.queryParams)
    ? config.queryParams
    : [];

  const addQueryParam = () => {
    updateConfig('queryParams', [...queryParams, { key: '', value: '' }]);
  };

  const updateQueryParam = (idx: number, field: 'key' | 'value', val: string) => {
    const next = [...queryParams];
    next[idx] = { ...next[idx], [field]: val };
    updateConfig('queryParams', next);
  };

  const removeQueryParam = (idx: number) => {
    updateConfig('queryParams', queryParams.filter((_, i) => i !== idx));
  };

  // Webhook Custom Headers
  const customHeaders: Array<{ key: string; value: string }> = Array.isArray(config.headers)
    ? config.headers
    : [];

  const addHeader = (k = '', v = '') => {
    updateConfig('headers', [...customHeaders, { key: k, value: v }]);
  };

  const updateHeader = (idx: number, field: 'key' | 'value', val: string) => {
    const next = [...customHeaders];
    next[idx] = { ...next[idx], [field]: val };
    updateConfig('headers', next);
  };

  const removeHeader = (idx: number) => {
    updateConfig('headers', customHeaders.filter((_, i) => i !== idx));
  };

  // Webhook Response Mapping
  const responseMapping: Array<{ path: string; variable: string }> = Array.isArray(config.responseMapping)
    ? config.responseMapping
    : [];

  const addResponseMapping = () => {
    updateConfig('responseMapping', [...responseMapping, { path: '', variable: '' }]);
  };

  const updateResponseMapping = (idx: number, field: 'path' | 'variable', val: string) => {
    const next = [...responseMapping];
    next[idx] = { ...next[idx], [field]: val };
    updateConfig('responseMapping', next);
  };

  const removeResponseMapping = (idx: number) => {
    updateConfig('responseMapping', responseMapping.filter((_, i) => i !== idx));
  };

  // Calculate live preview of assembled URL with Query String
  const computeResolvedUrlPreview = () => {
    const rawUrl = config.url || 'https://api.example.com/webhook';
    const validParams = queryParams.filter(p => p.key && p.key.trim());
    if (validParams.length === 0) return rawUrl;
    const sep = rawUrl.includes('?') ? '&' : '?';
    const qs = validParams
      .map(p => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value || '')}`)
      .join('&');
    return `${rawUrl}${sep}${qs}`;
  };

  // Format custom JSON body
  const formatCustomBody = () => {
    try {
      const parsed = JSON.parse(config.body || '{}');
      updateConfig('body', JSON.stringify(parsed, null, 2));
    } catch {
      // not valid JSON yet
    }
  };

  const setSampleCustomBody = () => {
    const sample = {
      phone: '{{phone}}',
      name: '{{name}}',
      message: '{{message}}',
      source: 'OpenWA_Workflow',
    };
    updateConfig('body', JSON.stringify(sample, null, 2));
  };

  // Execute Webhook Test Call via Backend
  const handleTestWebhook = async () => {
    if (!config.url) return;
    setIsTestingWebhook(true);
    setTestResult(null);
    try {
      const res = await workflowApi.testWebhook({
        url: config.url,
        method: config.method || 'POST',
        queryParams,
        headers: customHeaders,
        body: config.bodyType === 'custom' ? config.body : undefined,
        testVariables: {
          phone: testVars.phone,
          sender: `${testVars.phone}@c.us`,
          chatId: `${testVars.phone}@c.us`,
          name: testVars.name,
          contactName: testVars.name,
          message: testVars.message,
          body: testVars.message,
        },
        timeoutMs: Number(config.timeoutMs || 10000),
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        statusCode: 500,
        statusText: 'Client Error',
        durationMs: 0,
        resolvedUrl: config.url,
        error: err?.message || 'Failed to execute test request',
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const copyResultToClipboard = () => {
    if (!testResult) return;
    const text = typeof testResult.data === 'object'
      ? JSON.stringify(testResult.data, null, 2)
      : String(testResult.data ?? testResult.error ?? '');
    navigator.clipboard.writeText(text);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };


  return (
    <div className="wf-inspector-drawer">
      <div className="wf-inspector-header">
        <div className="wf-inspector-title-area">
          <span className="wf-inspector-type-pill">{type.replace(/_/g, ' ').toUpperCase()}</span>
          <input
            type="text"
            className="wf-inspector-title-input"
            value={label}
            onChange={e => updateLabel(e.target.value)}
            placeholder="Node Title"
          />
        </div>
        <button className="wf-btn-icon-close" onClick={onClose} title="Close inspector">
          <X size={18} />
        </button>
      </div>

      {/* SEGMENTED TAB BAR */}
      <div className="wf-inspector-tabs-bar">
        <button
          type="button"
          className={`wf-inspector-tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Sliders size={13} />
          <span>Configuration</span>
        </button>
        {type !== 'trigger' && (
          <button
            type="button"
            className={`wf-inspector-tab-btn ${activeTab === 'upstream' ? 'active' : ''}`}
            onClick={() => setActiveTab('upstream')}
          >
            <Sparkles size={13} style={{ color: upstreamNodes.length > 0 ? '#38bdf8' : undefined }} />
            <span>Upstream Data</span>
            <span className={`wf-tab-badge ${upstreamNodes.length > 0 ? 'highlight' : ''}`}>
              {upstreamNodes.length}
            </span>
          </button>
        )}
      </div>

      <div className="wf-inspector-body">
        {/* DEDICATED UPSTREAM DATA TAB */}
        {activeTab === 'upstream' && type !== 'trigger' ? (
          <div className="wf-upstream-tab-content">
            {/* Target Field Selector */}
            <div className="wf-target-field-bar">
              <span className="wf-target-field-label">
                <ArrowRight size={13} style={{ color: '#38bdf8' }} />
                Insert into field:
              </span>
              <select
                className="wf-target-field-select"
                value={targetField}
                onChange={e => setTargetField(e.target.value)}
              >
                {targetFieldOptions.map(opt => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label} ({opt.key})
                  </option>
                ))}
              </select>
            </div>

            {/* Toast Feedback */}
            {insertedToast && (
              <div className="wf-inserted-toast-bar">
                <CheckCircle2 size={14} />
                <span>{insertedToast}</span>
              </div>
            )}

            {/* Variable Search Bar */}
            <div className="wf-upstream-search-box">
              <Search size={14} className="wf-upstream-search-icon" />
              <input
                type="text"
                className="wf-upstream-search-input"
                placeholder="Filter variables by name, token or description..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Connected Upstream Cards */}
            <div className="wf-upstream-nodes-scroll">
              {(!upstreamNodes || upstreamNodes.length === 0) ? (
                <div className="wf-upstream-empty">
                  🔗 <strong>No upstream nodes connected yet.</strong><br />
                  Connect arrows on the canvas from previous nodes (Trigger, API call, Question, Buttons) into this node to access and insert their output data.
                </div>
              ) : filteredUpstreamNodes.length === 0 ? (
                <div className="wf-upstream-empty">
                  🔍 <strong>No variables matching "{searchQuery}"</strong><br />
                  Try searching for <code>phone</code>, <code>status</code>, <code>data</code>, or clear the search.
                </div>
              ) : (
                filteredUpstreamNodes.map(upNode => {
                  const nodeOutputs = getNodeOutputs(upNode);
                  const upLabel = (upNode.data as any)?.label || upNode.id;
                  const customPathVal = customPaths[upNode.id] || '';
                  const upType = upNode.type || 'default';

                  return (
                    <div key={upNode.id} className="wf-upstream-card">
                      <div className="wf-upstream-card-header">
                        <div className="wf-upstream-card-left">
                          <div className={`wf-node-avatar ${upType}`}>
                            {getNodeIcon(upType)}
                          </div>
                          <div>
                            <div className="wf-upstream-card-name">{upLabel}</div>
                            <div className="wf-upstream-card-meta">#{upNode.id}</div>
                          </div>
                        </div>
                        <span className="wf-upstream-card-pill">
                          {upType.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </div>

                      <div className="wf-var-list-v2">
                        {nodeOutputs.map(out => {
                          const isCopied = copiedVarToken === `{{${out.token}}}`;
                          return (
                            <div key={out.token} className="wf-var-row-v2">
                              <div className="wf-var-row-top">
                                <span className="wf-var-token-badge">
                                  <span className="wf-var-token-text">{`{{${out.token}}}`}</span>
                                  <span className={`wf-var-type-pill ${out.type}`}>{out.type}</span>
                                </span>
                                <div className="wf-var-actions">
                                  <button
                                    type="button"
                                    className="wf-btn-var-insert"
                                    onClick={() => handleInsertToken(out.token)}
                                    title={`Insert {{${out.token}}} into ${targetField}`}
                                  >
                                    + Insert
                                  </button>
                                  <button
                                    type="button"
                                    className="wf-btn-var-copy"
                                    onClick={() => handleCopyVar(out.token)}
                                    title="Copy variable tag to clipboard"
                                  >
                                    {isCopied ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                                  </button>
                                </div>
                              </div>
                              <div className="wf-var-row-bottom">
                                <span className="wf-var-desc">{out.description}</span>
                                {out.example && (
                                  <span className="wf-var-preview" title={`Sample preview: ${out.example}`}>
                                    ex: {out.example}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Custom JSON Path builder for Webhook / API nodes */}
                      {upNode.type === 'webhook_call' && (
                        <div className="wf-custom-path-section">
                          <span className="wf-custom-path-label">
                            Explore Custom JSON Path from this API:
                          </span>
                          <div className="wf-custom-path-row">
                            <input
                              type="text"
                              className="wf-custom-path-input"
                              placeholder="e.g. data.items[0].id or data.trackingUrl"
                              value={customPathVal}
                              onChange={e => setCustomPaths({ ...customPaths, [upNode.id]: e.target.value })}
                            />
                            <button
                              type="button"
                              className="wf-custom-path-btn"
                              onClick={() => {
                                if (!customPathVal.trim()) return;
                                const cleanPath = customPathVal.trim().replace(/^steps\.[^.]+\./, '');
                                handleInsertToken(`steps.${upNode.id}.${cleanPath}`);
                              }}
                            >
                              + Insert Path
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Universal Builtin Helpers */}
              <div className="wf-upstream-card" style={{ borderStyle: 'dashed' }}>
                <div className="wf-upstream-card-header">
                  <div className="wf-upstream-card-left">
                    <div className="wf-node-avatar default">
                      <Clock size={13} style={{ color: '#f59e0b' }} />
                    </div>
                    <div>
                      <div className="wf-upstream-card-name">System & Helper Variables</div>
                      <div className="wf-upstream-card-meta">Universally available</div>
                    </div>
                  </div>
                  <span className="wf-upstream-card-pill">BUILT-IN</span>
                </div>
                <div className="wf-var-list-v2">
                  {builtinHelpers.map(b => {
                    const isCopied = copiedVarToken === `{{${b.token}}}`;
                    return (
                      <div key={b.token} className="wf-var-row-v2">
                        <div className="wf-var-row-top">
                          <span className="wf-var-token-badge">
                            <span className="wf-var-token-text">{`{{${b.token}}}`}</span>
                            <span className={`wf-var-type-pill ${b.type}`}>{b.type}</span>
                          </span>
                          <div className="wf-var-actions">
                            <button
                              type="button"
                              className="wf-btn-var-insert"
                              onClick={() => handleInsertToken(b.token)}
                            >
                              + Insert
                            </button>
                            <button
                              type="button"
                              className="wf-btn-var-copy"
                              onClick={() => handleCopyVar(b.token)}
                            >
                              {isCopied ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </div>
                        <div className="wf-var-row-bottom">
                          <span className="wf-var-desc">{b.description}</span>
                          {b.example && (
                            <span className="wf-var-preview">ex: {b.example}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="wf-btn-secondary"
              style={{ marginTop: '0.5rem', alignSelf: 'flex-start', fontSize: '0.75rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}
              onClick={() => setActiveTab('config')}
            >
              ← Back to Node Configuration
            </button>
          </div>
        ) : (
          <>
            {/* QUICK UPSTREAM SUMMARY BANNER */}
            {type !== 'trigger' && upstreamNodes.length > 0 && (
              <div
                className="wf-upstream-quick-bar"
                onClick={() => setActiveTab('upstream')}
                title="Click to view and search all upstream variables"
              >
                <div className="wf-upstream-quick-info">
                  <Sparkles size={14} style={{ color: '#38bdf8' }} />
                  <span>
                    <strong>{upstreamNodes.length} Upstream Node{upstreamNodes.length > 1 ? 's' : ''}</strong> connected
                  </span>
                </div>
                <button type="button" className="wf-upstream-view-all-btn">
                  Explore Variables <ArrowRight size={12} />
                </button>
              </div>
            )}

        {/* TRIGGER NODE */}
        {type === 'trigger' && (
          <div className="wf-inspector-section">
            <label className="wf-field-label">Trigger Condition</label>
            <select
              className="wf-field-select"
              value={config.triggerType || 'message_received'}
              onChange={e => updateConfig('triggerType', e.target.value)}
            >
              <option value="message_received">Any Incoming WhatsApp Message</option>
              <option value="keyword_match">Keyword Match (Specific words in message)</option>
            </select>

            {config.triggerType === 'keyword_match' && (
              <div className="wf-field-group">
                <label className="wf-field-label">Match Keywords (comma separated)</label>
                <input
                  type="text"
                  className="wf-field-input"
                  placeholder="e.g. price, menu, demo, help"
                  value={config.keyword || ''}
                  onChange={e => updateConfig('keyword', e.target.value)}
                />
                <span className="wf-field-hint">
                  Triggers if message contains any of these words (case-insensitive)
                </span>
              </div>
            )}

            <div className="wf-checkbox-row">
              <label className="wf-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.workingHoursOnly || false}
                  onChange={e => updateConfig('workingHoursOnly', e.target.checked)}
                />
                <span>Execute only during business hours (9:00 AM - 6:00 PM)</span>
              </label>
            </div>
          </div>
        )}

        {/* SEND MESSAGE NODE */}
        {type === 'send_message' && (
          <div className="wf-inspector-section">
            <div className="wf-field-header-row">
              <label className="wf-field-label">Message Text</label>
              {upstreamNodes.length > 0 && (
                <button
                  type="button"
                  className="wf-btn-open-vars"
                  onClick={() => {
                    setTargetField('message');
                    setActiveTab('upstream');
                  }}
                  title="Browse all upstream variables"
                >
                  <Sparkles size={11} /> Browse Variables ({upstreamNodes.length})
                </button>
              )}
            </div>
            <textarea
              className="wf-field-textarea"
              rows={4}
              placeholder="Enter message text... (Supports {{variables}})"
              value={config.message || ''}
              onChange={e => updateConfig('message', e.target.value)}
            />
            <div className="wf-variable-shortcuts">
              <span className="wf-var-hint">Quick Insert:</span>
              <button
                type="button"
                className="wf-var-chip"
                onClick={() => insertVariable('trigger.phone', 'message')}
              >
                + Phone
              </button>
              <button
                type="button"
                className="wf-var-chip"
                onClick={() => insertVariable('trigger.contactName', 'message')}
              >
                + Name
              </button>
              {upstreamNodes.slice(0, 3).flatMap(up => getNodeOutputs(up).slice(0, 1)).map(out => (
                <button
                  key={out.token}
                  type="button"
                  className="wf-var-chip"
                  onClick={() => insertVariable(out.token, 'message')}
                  title={`Insert {{${out.token}}}`}
                >
                  + {out.label.split(' ')[0]}
                </button>
              ))}
              {upstreamNodes.length > 0 && (
                <button
                  type="button"
                  className="wf-var-chip"
                  style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
                  onClick={() => {
                    setTargetField('message');
                    setActiveTab('upstream');
                  }}
                >
                  + More...
                </button>
              )}
            </div>
          </div>
        )}

        {/* INTERACTIVE BUTTONS NODE */}
        {type === 'interactive_buttons' && (
          <div className="wf-inspector-section">
            <div className="wf-field-header-row">
              <label className="wf-field-label">Question / Prompt Text</label>
              {upstreamNodes.length > 0 && (
                <button
                  type="button"
                  className="wf-btn-open-vars"
                  onClick={() => {
                    setTargetField('message');
                    setActiveTab('upstream');
                  }}
                  title="Browse variables"
                >
                  <Sparkles size={11} /> Browse Variables
                </button>
              )}
            </div>
            <textarea
              className="wf-field-textarea"
              rows={3}
              placeholder="e.g. Please choose an option from the menu:"
              value={config.message || ''}
              onChange={e => updateConfig('message', e.target.value)}
            />

            <div className="wf-field-group">
              <div className="wf-flex-between">
                <label className="wf-field-label">Action Buttons ({buttons.length})</label>
                <button
                  type="button"
                  className="wf-btn-text-action"
                  onClick={addButton}
                >
                  <Plus size={13} /> Add Button
                </button>
              </div>

              <div className="wf-inspector-buttons-list">
                {buttons.map((btn, idx) => (
                  <div key={btn.id || idx} className="wf-inspector-button-row">
                    <span className="wf-btn-num-pill">{idx + 1}</span>
                    <input
                      type="text"
                      className="wf-field-input"
                      value={btn.text}
                      onChange={e => updateButton(idx, 'text', e.target.value)}
                      placeholder={`Button ${idx + 1} title`}
                    />
                    {buttons.length > 1 && (
                      <button
                        type="button"
                        className="wf-btn-icon-del"
                        onClick={() => removeButton(idx)}
                        title="Delete button"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="wf-field-group">
              <label className="wf-field-label">WhatsApp Send Mode</label>
              <select
                className="wf-field-select"
                value={config.mode || 'auto'}
                onChange={e => updateConfig('mode', e.target.value)}
              >
                <option value="auto">Auto (Native Poll with Numbered Text Fallback)</option>
                <option value="poll">Native Poll Message Only</option>
                <option value="text">Numbered Text Menu (1, 2, 3)</option>
              </select>
            </div>

            <div className="wf-field-group">
              <label className="wf-field-label">Wait for Reply Timeout (Minutes)</label>
              <input
                type="number"
                min="1"
                className="wf-field-input"
                value={config.timeoutMinutes || 60}
                onChange={e => updateConfig('timeoutMinutes', Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* ASK QUESTION (SLOT CAPTURE) NODE */}
        {type === 'ask_question' && (
          <div className="wf-inspector-section">
            <div className="wf-field-header-row">
              <label className="wf-field-label">Question Prompt</label>
              {upstreamNodes.length > 0 && (
                <button
                  type="button"
                  className="wf-btn-open-vars"
                  onClick={() => {
                    setTargetField('prompt');
                    setActiveTab('upstream');
                  }}
                  title="Browse variables"
                >
                  <Sparkles size={11} /> Browse Variables
                </button>
              )}
            </div>
            <textarea
              className="wf-field-textarea"
              rows={3}
              placeholder="e.g. Please reply with your business email address:"
              value={config.prompt || ''}
              onChange={e => updateConfig('prompt', e.target.value)}
            />

            <div className="wf-field-group">
              <label className="wf-field-label">Capture Slot Variable</label>
              <input
                type="text"
                className="wf-field-input"
                placeholder="e.g. email, phone, city, budget"
                value={config.slot || 'response'}
                onChange={e => updateConfig('slot', e.target.value)}
              />
              <span className="wf-field-hint">
                Value will be saved to variable <code>{`{{vars.${config.slot || 'response'}}}`}</code> and synced to contact profile
              </span>
            </div>

            <div className="wf-field-group">
              <label className="wf-field-label">Expected Format Validation</label>
              <select
                className="wf-field-select"
                value={config.validation || 'any'}
                onChange={e => updateConfig('validation', e.target.value)}
              >
                <option value="email">Email Address (RFC Regex)</option>
                <option value="phone">Phone Number (E.164 / International)</option>
                <option value="number">Numeric (Digits & decimals)</option>
                <option value="any">Any Text Input (No restriction)</option>
              </select>
            </div>

            <div className="wf-field-group">
              <label className="wf-field-label">Retry Prompt on Bad Format</label>
              <input
                type="text"
                className="wf-field-input"
                placeholder="e.g. Invalid email format, please try again:"
                value={config.retryPrompt || ''}
                onChange={e => updateConfig('retryPrompt', e.target.value)}
              />
            </div>

            <div className="wf-field-group">
              <label className="wf-field-label">Max Validation Retries</label>
              <input
                type="number"
                min="1"
                max="5"
                className="wf-field-input"
                value={config.maxRetries ?? 3}
                onChange={e => updateConfig('maxRetries', Number(e.target.value))}
              />
              <span className="wf-field-hint">
                If customer fails this many times, flow branches to Fallback port.
              </span>
            </div>
          </div>
        )}

        {/* CONDITION BRANCH (IF/ELSE) NODE */}
        {type === 'condition_branch' && (
          <div className="wf-inspector-section">
            <div className="wf-field-header-row">
              <label className="wf-field-label">Evaluation Field</label>
              {upstreamNodes.length > 0 && (
                <button
                  type="button"
                  className="wf-btn-open-vars"
                  onClick={() => {
                    setTargetField('value');
                    setActiveTab('upstream');
                  }}
                  title="Browse variables"
                >
                  <Sparkles size={11} /> Browse Variables
                </button>
              )}
            </div>
            <select
              className="wf-field-select"
              value={config.field || 'tag'}
              onChange={e => updateConfig('field', e.target.value)}
            >
              {upstreamNodes && upstreamNodes.length > 0 && (
                <optgroup label="Connected Upstream Variables">
                  {upstreamNodes.flatMap(upNode => {
                    const outputs = getNodeOutputs(upNode);
                    const upLabel = (upNode.data as any)?.label || upNode.id;
                    return outputs.map(out => (
                      <option key={`${upNode.id}-${out.token}`} value={out.token}>
                        [{upLabel}] {out.label} → {`{{${out.token}}}`}
                      </option>
                    ));
                  })}
                </optgroup>
              )}
              <optgroup label="Contact & Context">
                <option value="tag">Contact Tags</option>
                <option value="status">Conversation Status</option>
                <option value="message">Customer Message Body</option>
                <option value="trigger.phone">Sender Phone Number</option>
              </optgroup>
              <optgroup label="Captured Variables">
                <option value="vars.email">Captured Variable: Email</option>
                <option value="vars.lastChoice">Captured Variable: Button Choice</option>
                <option value="custom">Custom Expression...</option>
              </optgroup>
            </select>

            {(!['tag', 'status', 'message', 'trigger.phone', 'vars.email', 'vars.lastChoice'].includes(config.field) &&
              !upstreamNodes?.some(up => getNodeOutputs(up).some(out => out.token === config.field))) ||
              config.field === 'custom' ? (
              <div className="wf-field-group" style={{ marginTop: '0.4rem' }}>
                <label className="wf-field-label">Custom Field / Variable Expression</label>
                <input
                  type="text"
                  className="wf-field-input"
                  placeholder="e.g. steps.api_call.data.total or vars.budget"
                  value={config.customField || (config.field === 'custom' ? '' : config.field)}
                  onChange={e => {
                    updateConfig('customField', e.target.value);
                    updateConfig('field', e.target.value);
                  }}
                />
              </div>
            ) : null}

            <div className="wf-field-group">
              <label className="wf-field-label">Operator</label>
              <select
                className="wf-field-select"
                value={config.operator || 'contains'}
                onChange={e => updateConfig('operator', e.target.value)}
              >
                <option value="equals">Equals Exactly (==)</option>
                <option value="not_equals">Does Not Equal (!=)</option>
                <option value="contains">Contains Text</option>
                <option value="not_contains">Does Not Contain</option>
                <option value="starts_with">Starts With</option>
                <option value="ends_with">Ends With</option>
                <option value="greater_than">Greater Than (&gt;) (Numeric)</option>
                <option value="greater_than_or_equal">Greater Than or Equal (&gt;=)</option>
                <option value="less_than">Less Than (&lt;) (Numeric)</option>
                <option value="less_than_or_equal">Less Than or Equal (&lt;=)</option>
                <option value="is_empty">Is Empty / Null</option>
                <option value="is_not_empty">Is Not Empty / Present</option>
              </select>
            </div>

            {!['is_empty', 'is_not_empty'].includes(config.operator) && (
              <div className="wf-field-group">
                <div className="wf-field-header-row">
                  <label className="wf-field-label">Comparison Value</label>
                  {upstreamNodes.length > 0 && (
                    <button
                      type="button"
                      className="wf-btn-open-vars"
                      onClick={() => {
                        setTargetField('value');
                        setActiveTab('upstream');
                      }}
                      title="Insert dynamic variable"
                    >
                      <Sparkles size={11} /> Variables
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="wf-field-input"
                  placeholder="e.g. vip, pricing, 500, true"
                  value={config.value || ''}
                  onChange={e => updateConfig('value', e.target.value)}
                />
                <span className="wf-field-hint">
                  Supports dynamic variables like <code>{`{{vars.expectedTotal}}`}</code> or literal values
                </span>
              </div>
            )}
          </div>
        )}

        {/* DELAY / WAIT NODE */}
        {type === 'wait' && (
          <div className="wf-inspector-section">
            <label className="wf-field-label">Wait Duration (Seconds)</label>
            <input
              type="number"
              min="1"
              className="wf-field-input"
              value={config.seconds || 5}
              onChange={e => updateConfig('seconds', Number(e.target.value))}
            />
            <div className="wf-variable-shortcuts">
              <button
                type="button"
                className="wf-var-chip"
                onClick={() => updateConfig('seconds', 30)}
              >
                30s
              </button>
              <button
                type="button"
                className="wf-var-chip"
                onClick={() => updateConfig('seconds', 300)}
              >
                5 min
              </button>
              <button
                type="button"
                className="wf-var-chip"
                onClick={() => updateConfig('seconds', 1800)}
              >
                30 min
              </button>
              <button
                type="button"
                className="wf-var-chip"
                onClick={() => updateConfig('seconds', 3600)}
              >
                1 hr
              </button>
            </div>
          </div>
        )}

        {/* AI ASSISTANT NODE */}
        {type === 'ai_assistant' && (
          <div className="wf-inspector-section">
            <label className="wf-field-label">AI System Instructions</label>
            <textarea
              className="wf-field-textarea"
              rows={4}
              placeholder="e.g. You are a helpful sales assistant..."
              value={config.systemPrompt || ''}
              onChange={e => updateConfig('systemPrompt', e.target.value)}
            />

            <div className="wf-checkbox-row">
              <label className="wf-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.useKnowledgeBase ?? true}
                  onChange={e => updateConfig('useKnowledgeBase', e.target.checked)}
                />
                <span>Include Vector Knowledge Base / FAQs</span>
              </label>
            </div>

            <div className="wf-checkbox-row">
              <label className="wf-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.enableHandoff ?? true}
                  onChange={e => updateConfig('enableHandoff', e.target.checked)}
                />
                <span>Auto Handoff to Human if user asks or low confidence</span>
              </label>
            </div>
          </div>
        )}

        {/* HUMAN HANDOFF NODE */}
        {type === 'handoff_to_human' && (
          <div className="wf-inspector-section">
            <label className="wf-field-label">Assign To Agent / Team</label>
            <input
              type="text"
              className="wf-field-input"
              placeholder="e.g. Sales Team, Jane Doe"
              value={config.assignedName || ''}
              onChange={e => updateConfig('assignedName', e.target.value)}
            />
            <span className="wf-field-hint">
              This will update conversation status to <strong>Pending</strong> and alert agents in the Live Chat inbox.
            </span>
          </div>
        )}

        {/* ADD TAG NODE */}
        {type === 'add_tag' && (
          <div className="wf-inspector-section">
            <label className="wf-field-label">Contact Tag</label>
            <input
              type="text"
              className="wf-field-input"
              placeholder="e.g. interested, hot-lead, vip"
              value={config.tag || ''}
              onChange={e => updateConfig('tag', e.target.value)}
            />
          </div>
        )}

        {/* WEBHOOK NODE */}
        {type === 'webhook_call' && (
          <div className="wf-inspector-section">
            {/* Method Selector */}
            <div className="wf-field-group">
              <label className="wf-field-label">HTTP Method</label>
              <div className="wf-method-selector">
                {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map(m => {
                  const currentMethod = (config.method || 'POST').toUpperCase();
                  const isActive = currentMethod === m;
                  const methodClass = `method-${m.toLowerCase()}`;
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`wf-method-btn ${isActive ? `active ${methodClass}` : ''}`}
                      onClick={() => updateConfig('method', m)}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* URL Input */}
            <div className="wf-field-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="wf-field-label">Endpoint URL</label>
                <button
                  type="button"
                  className="wf-preset-btn"
                  onClick={() => updateConfig('url', 'http://localhost:2785/api/webhook-test/echo')}
                  title="Use OpenWA's built-in testing endpoint"
                  style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
                >
                  ⚡ Use Local Test Endpoint
                </button>
              </div>
              <input
                type="url"
                className="wf-field-input"
                placeholder="https://api.yourcrm.com/leads or http://localhost:2785/api/webhook-test/echo"
                value={config.url || ''}
                onChange={e => updateConfig('url', e.target.value)}
              />
              {config.url && config.url.includes('/api/webhook-test') && (
                <span className="wf-field-hint" style={{ color: '#38bdf8', marginTop: '0.2rem' }}>
                  ✨ Connected to built-in OpenWA test endpoint! Requests are captured and echoed back.
                </span>
              )}
              <div className="wf-variable-shortcuts">
                <span className="wf-var-hint">Insert:</span>
                <button
                  type="button"
                  className="wf-var-chip"
                  onClick={() => insertVariable('phone', 'url')}
                  title="Insert recipient phone number"
                >
                  phone
                </button>
                <button
                  type="button"
                  className="wf-var-chip"
                  onClick={() => insertVariable('name', 'url')}
                  title="Insert contact name"
                >
                  name
                </button>
                <button
                  type="button"
                  className="wf-var-chip"
                  onClick={() => insertVariable('message', 'url')}
                  title="Insert message body"
                >
                  message
                </button>
                <button
                  type="button"
                  className="wf-var-chip"
                  onClick={() => insertVariable('chatId', 'url')}
                  title="Insert WhatsApp Chat ID"
                >
                  chatId
                </button>
              </div>
            </div>

            {/* Query Parameters Builder */}
            <div className="wf-sub-section">
              <div className="wf-sub-header">
                <span className="wf-sub-title">
                  <Sliders size={13} />
                  <span>Query Parameters</span>
                  <span className="wf-count-pill">{queryParams.length}</span>
                </span>
                <button
                  type="button"
                  className="wf-btn-add-item"
                  onClick={addQueryParam}
                >
                  <Plus size={13} /> Add Param
                </button>
              </div>

              {queryParams.length === 0 ? (
                <span className="wf-field-hint">
                  No query parameters. Click <strong>+ Add Param</strong> to pass URL parameters (e.g. <code>?key=value</code>).
                </span>
              ) : (
                <div className="wf-kv-list">
                  {queryParams.map((param, idx) => (
                    <div key={idx} className="wf-kv-wrapper">
                      <div className="wf-kv-row">
                        <input
                          type="text"
                          className="wf-kv-input"
                          placeholder="key (e.g. phone)"
                          value={param.key}
                          onChange={e => updateQueryParam(idx, 'key', e.target.value)}
                        />
                        <span className="wf-kv-arrow">=</span>
                        <input
                          type="text"
                          className="wf-kv-input"
                          placeholder="value (e.g. {{phone}})"
                          value={param.value}
                          onChange={e => updateQueryParam(idx, 'value', e.target.value)}
                        />
                        <button
                          type="button"
                          className="wf-btn-del-item"
                          onClick={() => removeQueryParam(idx)}
                          title="Remove parameter"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="wf-param-pills-row">
                        <span
                          className="wf-param-pill"
                          onClick={() => updateQueryParam(idx, 'value', `${param.value || ''}{{phone}}`)}
                        >
                          + {'{{phone}}'}
                        </span>
                        <span
                          className="wf-param-pill"
                          onClick={() => updateQueryParam(idx, 'value', `${param.value || ''}{{message}}`)}
                        >
                          + {'{{message}}'}
                        </span>
                        <span
                          className="wf-param-pill"
                          onClick={() => updateQueryParam(idx, 'value', `${param.value || ''}{{name}}`)}
                        >
                          + {'{{name}}'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Live URL Preview */}
              {config.url && (
                <div className="wf-url-preview-box">
                  <span className="wf-url-preview-label">Assembled URL Preview:</span>
                  <span className="wf-url-preview-code">{computeResolvedUrlPreview()}</span>
                </div>
              )}
            </div>

            {/* Custom Headers Builder */}
            <div className="wf-sub-section">
              <div className="wf-sub-header">
                <span className="wf-sub-title">
                  <Layers size={13} />
                  <span>Custom Headers</span>
                  <span className="wf-count-pill">{customHeaders.length}</span>
                </span>
                <button
                  type="button"
                  className="wf-btn-add-item"
                  onClick={() => addHeader('', '')}
                >
                  <Plus size={13} /> Add Header
                </button>
              </div>

              {/* Quick header presets */}
              <div className="wf-presets-row">
                <button
                  type="button"
                  className="wf-preset-btn"
                  onClick={() => addHeader('Authorization', 'Bearer ')}
                >
                  + Bearer Token
                </button>
                <button
                  type="button"
                  className="wf-preset-btn"
                  onClick={() => addHeader('X-Api-Key', '')}
                >
                  + X-Api-Key
                </button>
                <button
                  type="button"
                  className="wf-preset-btn"
                  onClick={() => addHeader('Content-Type', 'application/json')}
                >
                  + JSON Header
                </button>
              </div>

              {customHeaders.length > 0 && (
                <div className="wf-kv-list">
                  {customHeaders.map((header, idx) => (
                    <div key={idx} className="wf-kv-row">
                      <input
                        type="text"
                        className="wf-kv-input"
                        placeholder="Header (e.g. Authorization)"
                        value={header.key}
                        onChange={e => updateHeader(idx, 'key', e.target.value)}
                      />
                      <span className="wf-kv-arrow">:</span>
                      <input
                        type="text"
                        className="wf-kv-input"
                        placeholder="Value (e.g. Bearer token)"
                        value={header.value}
                        onChange={e => updateHeader(idx, 'value', e.target.value)}
                      />
                      <button
                        type="button"
                        className="wf-btn-del-item"
                        onClick={() => removeHeader(idx)}
                        title="Remove header"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Request Body (For POST, PUT, PATCH) */}
            {['POST', 'PUT', 'PATCH'].includes((config.method || 'POST').toUpperCase()) && (
              <div className="wf-sub-section">
                <div className="wf-sub-header">
                  <span className="wf-sub-title">
                    <Code size={13} />
                    <span>Request Body (JSON)</span>
                  </span>
                </div>

                <div className="wf-body-toggle">
                  <button
                    type="button"
                    className={`wf-body-toggle-btn ${config.bodyType !== 'custom' ? 'active' : ''}`}
                    onClick={() => updateConfig('bodyType', 'default')}
                  >
                    Default Payload
                  </button>
                  <button
                    type="button"
                    className={`wf-body-toggle-btn ${config.bodyType === 'custom' ? 'active' : ''}`}
                    onClick={() => updateConfig('bodyType', 'custom')}
                  >
                    Custom JSON Body
                  </button>
                </div>

                {config.bodyType !== 'custom' ? (
                  <span className="wf-field-hint">
                    Sends standard workflow context as JSON payload: <code>phone</code>, <code>message</code>, <code>chatId</code>, <code>sessionId</code>, and captured <code>variables</code>.
                  </span>
                ) : (
                  <div className="wf-field-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="wf-field-hint">Valid JSON string with variable placeholders:</span>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          type="button"
                          className="wf-preset-btn"
                          onClick={() => {
                            setTargetField('body');
                            setActiveTab('upstream');
                          }}
                          title="Browse and insert upstream variables"
                          style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
                        >
                          <Sparkles size={11} /> Browse Variables
                        </button>
                        <button
                          type="button"
                          className="wf-preset-btn"
                          onClick={formatCustomBody}
                          title="Format and prettify JSON"
                        >
                          <Sparkles size={11} /> Format
                        </button>
                        <button
                          type="button"
                          className="wf-preset-btn"
                          onClick={setSampleCustomBody}
                          title="Insert sample JSON"
                        >
                          Sample
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={5}
                      className="wf-body-textarea"
                      placeholder='{ "phone": "{{phone}}", "text": "{{message}}" }'
                      value={config.body || ''}
                      onChange={e => updateConfig('body', e.target.value)}
                    />

                    <div className="wf-variable-shortcuts">
                      <span className="wf-var-hint">Insert:</span>
                      <button
                        type="button"
                        className="wf-var-chip"
                        onClick={() => insertVariable('phone', 'body')}
                      >
                        phone
                      </button>
                      <button
                        type="button"
                        className="wf-var-chip"
                        onClick={() => insertVariable('name', 'body')}
                      >
                        name
                      </button>
                      <button
                        type="button"
                        className="wf-var-chip"
                        onClick={() => insertVariable('message', 'body')}
                      >
                        message
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Response Variable Extraction / Mapping */}
            <div className="wf-sub-section">
              <div className="wf-sub-header">
                <span className="wf-sub-title">
                  <ArrowRight size={13} />
                  <span>Extract Response to Variables</span>
                  <span className="wf-count-pill">{responseMapping.length}</span>
                </span>
                <button
                  type="button"
                  className="wf-btn-add-item"
                  onClick={addResponseMapping}
                >
                  <Plus size={13} /> Add Mapping
                </button>
              </div>

              <span className="wf-field-hint">
                Extract JSON fields from the API response into workflow variables (available in later steps via <code>{'{{vars.variable_name}}'}</code>).
              </span>

              {responseMapping.length > 0 && (
                <div className="wf-kv-list">
                  {responseMapping.map((item, idx) => (
                    <div key={idx} className="wf-kv-row">
                      <input
                        type="text"
                        className="wf-kv-input"
                        placeholder="Path (e.g. data.id or status)"
                        value={item.path}
                        onChange={e => updateResponseMapping(idx, 'path', e.target.value)}
                      />
                      <span className="wf-kv-arrow">→ vars.</span>
                      <input
                        type="text"
                        className="wf-kv-input"
                        placeholder="Variable (e.g. crm_id)"
                        value={item.variable}
                        onChange={e => updateResponseMapping(idx, 'variable', e.target.value)}
                      />
                      <button
                        type="button"
                        className="wf-btn-del-item"
                        onClick={() => removeResponseMapping(idx)}
                        title="Remove mapping"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Save entire response */}
              <div className="wf-field-group" style={{ marginTop: '0.35rem' }}>
                <label className="wf-field-label">Or Save Entire Response to Variable</label>
                <input
                  type="text"
                  className="wf-field-input"
                  placeholder="e.g. api_response (accessible as {{vars.api_response}})"
                  value={config.saveResponseTo || ''}
                  onChange={e => updateConfig('saveResponseTo', e.target.value)}
                />
              </div>
            </div>

            {/* Timeout Setting */}
            <div className="wf-field-group">
              <label className="wf-field-label">Timeout (Milliseconds)</label>
              <input
                type="number"
                min="1000"
                max="30000"
                step="1000"
                className="wf-field-input"
                placeholder="10000"
                value={config.timeoutMs || 10000}
                onChange={e => updateConfig('timeoutMs', Number(e.target.value))}
              />
            </div>

            {/* LIVE API & WEBHOOK TEST CONSOLE */}
            <div className="wf-live-test-card">
              <div className="wf-live-test-top">
                <span className="wf-live-test-title">
                  <Play size={14} />
                  <span>Live Webhook / API Test</span>
                </span>
                <button
                  type="button"
                  className="wf-btn-toggle-vars"
                  onClick={() => setShowTestVars(!showTestVars)}
                >
                  {showTestVars ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span>Test Vars</span>
                </button>
              </div>

              {/* Test Variables Drawer */}
              {showTestVars && (
                <div className="wf-test-vars-grid">
                  <div className="wf-test-var-item">
                    <span className="wf-test-var-label">phone:</span>
                    <input
                      type="text"
                      className="wf-test-var-input"
                      value={testVars.phone}
                      onChange={e => setTestVars({ ...testVars, phone: e.target.value })}
                    />
                  </div>
                  <div className="wf-test-var-item">
                    <span className="wf-test-var-label">name:</span>
                    <input
                      type="text"
                      className="wf-test-var-input"
                      value={testVars.name}
                      onChange={e => setTestVars({ ...testVars, name: e.target.value })}
                    />
                  </div>
                  <div className="wf-test-var-item">
                    <span className="wf-test-var-label">message:</span>
                    <input
                      type="text"
                      className="wf-test-var-input"
                      value={testVars.message}
                      onChange={e => setTestVars({ ...testVars, message: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Run Test Button */}
              <button
                type="button"
                className="wf-btn-run-test"
                disabled={!config.url || isTestingWebhook}
                onClick={handleTestWebhook}
              >
                {isTestingWebhook ? (
                  <>
                    <RefreshCw size={14} className="wf-spin" />
                    <span>Sending Request...</span>
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    <span>Send Test Request</span>
                  </>
                )}
              </button>

              {/* Test Results Card */}
              {testResult && (
                <div className="wf-test-result-box">
                  <div className="wf-result-meta-bar">
                    <div className="wf-result-left">
                      <span
                        className={`wf-status-code-pill ${
                          testResult.statusCode >= 200 && testResult.statusCode < 300
                            ? 'success'
                            : 'error'
                        }`}
                      >
                        {testResult.statusCode} {testResult.statusText || (testResult.success ? 'OK' : 'Error')}
                      </span>
                      <span className="wf-duration-pill">
                        <Clock size={11} /> {testResult.durationMs}ms
                      </span>
                    </div>

                    <button
                      type="button"
                      className="wf-btn-copy-json"
                      onClick={copyResultToClipboard}
                    >
                      {copiedResponse ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {testResult.resolvedUrl && (
                    <div className="wf-url-preview-box" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="wf-url-preview-label">Executed URL:</span>
                      <span className="wf-url-preview-code">{testResult.resolvedUrl}</span>
                    </div>
                  )}

                  {testResult.error && (
                    <div className="wf-test-error-box">
                      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{testResult.error}</span>
                    </div>
                  )}

                  <pre className="wf-result-pre">
                    {typeof testResult.data === 'object' && testResult.data !== null
                      ? JSON.stringify(testResult.data, null, 2)
                      : String(testResult.data ?? (testResult.error ? '' : 'No response body'))}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DELETE NODE FOOTER */}
        {type !== 'trigger' && (
          <div className="wf-inspector-footer">
            <button
              type="button"
              className="wf-btn-danger-del"
              onClick={() => onDeleteNode(id)}
            >
              <Trash2 size={15} /> Delete Node
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
