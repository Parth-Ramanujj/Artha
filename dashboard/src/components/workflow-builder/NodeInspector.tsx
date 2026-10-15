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
  Paperclip,
  Filter,
  StopCircle,
  Table,
  FlaskConical,
  Loader2,
  UserCheck,
  ShieldCheck,
  MapPin,
  Contact,
  BellRing,
  GitFork,
  Calculator,
  CreditCard,
  ScanText,
  LayoutGrid,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { WorkflowNodeData, ButtonItem } from './types';
import { workflowApi, type TestWebhookResult, type WorkflowRun } from '../../services/api';
import { VariablePicker } from './VariablePicker';
import { NodeOutputInspector } from './NodeOutputInspector';
import { DynamicInput, DynamicTextarea } from './DynamicField';

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
    case 'set_fields': return <Sliders size={13} />;
    case 'filter': return <Filter size={13} />;
    case 'stop_workflow': return <StopCircle size={13} />;
    case 'google_sheets': return <Table size={13} />;
    case 'send_media': return <Paperclip size={13} />;
    case 'search_agents': return <UserCheck size={13} />;
    case 'create_lead': return <ShieldCheck size={13} />;
    case 'validate_pincode': return <MapPin size={13} />;
    case 'send_contact_vcard': return <Contact size={13} />;
    case 'working_hours_gateway': return <Clock size={13} />;
    case 'internal_alert': return <BellRing size={13} />;
    case 'ab_test_split': return <GitFork size={13} />;
    case 'financial_calculator': return <Calculator size={13} />;
    case 'payment_link': return <CreditCard size={13} />;
    case 'ai_document_ocr': return <ScanText size={13} />;
    case 'send_carousel_template': return <LayoutGrid size={13} />;
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
    case 'set_fields': {
      const assignments = Array.isArray(cfg.assignments) ? cfg.assignments : [];
      const fields: NodeOutputField[] = [
        { label: 'Variables Map', token: `steps.${id}.variables`, type: 'object', description: 'All variables updated by this node' },
      ];
      assignments.forEach((a: any) => {
        if (a && a.name) {
          fields.push({
            label: `Variable: {{vars.${a.name}}}`,
            token: `vars.${a.name}`,
            type: 'string',
            description: `Value of custom variable '${a.name}'`,
            example: a.value,
          });
        }
      });
      return fields;
    }
    case 'google_sheets':
      return [
        { label: 'Append Success', token: `steps.${id}.success`, type: 'boolean', description: 'Whether the row was successfully appended', example: 'true' },
        { label: 'HTTP Status Code', token: `steps.${id}.statusCode`, type: 'number', description: 'Response status code', example: '200' },
      ];
    case 'send_media':
      return [
        { label: 'Message Sent', token: `steps.${id}.sent`, type: 'boolean', description: 'Whether the media message was sent', example: 'true' },
        { label: 'Message ID', token: `steps.${id}.messageId`, type: 'string', description: 'Assigned WhatsApp message ID', example: 'wamid.HBg...' },
      ];
    case 'search_agents':
      return [
        { label: 'Advisors Found Count', token: `steps.${id}.count`, type: 'number', description: 'Number of verified advisors matched', example: '3' },
        { label: 'Formatted Profile Cards', token: `steps.${id}.formattedCards`, type: 'string', description: 'WhatsApp message text with Call Now and WhatsApp links', example: '✅ Found 3 verified advisors...' },
        { label: 'Searched Pincode', token: `steps.${id}.pincode`, type: 'string', description: 'Pincode used for advisor lookup', example: '380015' },
        { label: 'Advisors List', token: `steps.${id}.agents`, type: 'array', description: 'Raw array of matched advisor profiles' },
      ];
    case 'create_lead':
      return [
        { label: 'Lead Reference ID', token: `steps.${id}.leadNumber`, type: 'string', description: 'Unique CRM Lead Reference ID', example: 'LD-INS-59281' },
        { label: 'Database Lead ID', token: `steps.${id}.leadId`, type: 'string', description: 'Primary key of the lead in database', example: 'uuid-1234' },
        { label: 'Lead Status', token: `steps.${id}.status`, type: 'string', description: 'Current status: assigned / qualified / new', example: 'assigned' },
        { label: 'Assigned Advisor Name', token: `steps.${id}.matchedAgentName`, type: 'string', description: 'Name of the advisor assigned to this lead', example: 'Rajesh Sharma' },
        { label: 'Assigned Advisor Phone', token: `steps.${id}.matchedAgentPhone`, type: 'string', description: 'Contact phone of the assigned advisor', example: '919876501001' },
      ];
    case 'validate_pincode':
      return [
        { label: 'Is Valid', token: `steps.${id}.isValid`, type: 'boolean', description: 'Whether the PIN code is a valid 6-digit Indian Pincode', example: 'true' },
        { label: 'Cleaned Pincode', token: `steps.${id}.pincode`, type: 'string', description: 'Sanitized 6-digit numeric Pincode', example: '380015' },
      ];
    case 'send_contact_vcard':
      return [
        { label: 'Sent Success', token: `steps.${id}.sent`, type: 'boolean', description: 'Whether vCard was sent', example: 'true' },
        { label: 'Advisor Name', token: `steps.${id}.displayName`, type: 'string', description: 'Advisor contact name', example: 'Alpeshkumar Patel' },
        { label: 'Advisor Phone', token: `steps.${id}.phoneNumber`, type: 'string', description: 'Advisor contact number', example: '+919426378401' },
      ];
    case 'working_hours_gateway':
      return [
        { label: 'Is Business Open', token: `steps.${id}.isOpen`, type: 'boolean', description: 'True if inside working hours', example: 'true' },
        { label: 'Evaluated Branch', token: `steps.${id}.branch`, type: 'string', description: '"open" or "closed"', example: 'open' },
        { label: 'Current Local Time', token: `steps.${id}.currentTime`, type: 'string', description: 'HH:mm in target timezone', example: '14:30' },
      ];
    case 'internal_alert':
      return [
        { label: 'Alert Sent', token: `steps.${id}.alerted`, type: 'boolean', description: 'Whether manager was notified', example: 'true' },
        { label: 'Manager Recipient', token: `steps.${id}.recipient`, type: 'string', description: 'Manager WhatsApp JID', example: '919876543210@c.us' },
      ];
    case 'ab_test_split':
      return [
        { label: 'Assigned Variant', token: `steps.${id}.variant`, type: 'string', description: '"A" or "B"', example: 'A' },
        { label: 'Target Branch', token: `steps.${id}.branch`, type: 'string', description: '"variant_a" or "variant_b"', example: 'variant_a' },
      ];
    case 'financial_calculator':
      return [
        { label: 'Future Value', token: `steps.${id}.futureValue`, type: 'number', description: 'Calculated maturity amount', example: '5200000' },
        { label: 'Formatted Future Value', token: `steps.${id}.formattedFutureValue`, type: 'string', description: 'Future Value with ₹ symbol and commas', example: '₹52,00,000' },
        { label: 'Invested Amount', token: `steps.${id}.investedAmount`, type: 'number', description: 'Total amount deposited', example: '900000' },
        { label: 'Wealth Gain', token: `steps.${id}.wealthGain`, type: 'number', description: 'Total returns earned', example: '4300000' },
        { label: 'Formatted Wealth Gain', token: `steps.${id}.formattedWealthGain`, type: 'string', description: 'Formatted wealth gain', example: '₹43,00,000' },
        { label: 'Monthly EMI', token: `steps.${id}.formattedMonthlyEmi`, type: 'string', description: 'Calculated loan EMI', example: '₹14,500' },
      ];
    case 'payment_link':
      return [
        { label: 'UPI Deep Link', token: `steps.${id}.upiLink`, type: 'string', description: 'upi:// deep link for GPay/PhonePe', example: 'upi://pay?pa=...' },
        { label: 'Payment Checkout URL', token: `steps.${id}.paymentUrl`, type: 'string', description: 'Razorpay / Web checkout link', example: 'https://rzp.io/l/...' },
        { label: 'Transaction ID', token: `steps.${id}.txnId`, type: 'string', description: 'Generated payment reference', example: 'TXN_17290123' },
      ];
    case 'ai_document_ocr':
      return [
        { label: 'Extracted Policy Number', token: `steps.${id}.policyNumber`, type: 'string', description: 'Read policy number', example: 'OG-24-1102-1801' },
        { label: 'Extracted Vehicle Number', token: `steps.${id}.vehicleNumber`, type: 'string', description: 'Read vehicle reg number', example: 'GJ02BT8921' },
        { label: 'Insured Name', token: `steps.${id}.insuredName`, type: 'string', description: 'Policyholder name', example: 'Rajesh Patel' },
        { label: 'Policy Expiry Date', token: `steps.${id}.expiryDate`, type: 'string', description: 'Expiry date YYYY-MM-DD', example: '2026-12-31' },
      ];
    case 'send_carousel_template':
      return [
        { label: 'Sent Success', token: `steps.${id}.sent`, type: 'boolean', description: 'Whether carousel cards were sent', example: 'true' },
        { label: 'Cards Dispatched Count', token: `steps.${id}.cardCount`, type: 'number', description: 'Number of cards delivered', example: '3' },
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
  lastRun?: WorkflowRun | null;
  onUpdateNode: (nodeId: string, updatedData: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
  onOpenWorkflowTest?: () => void;
}

export function NodeInspector({
  selectedNode,
  upstreamNodes = [],
  allNodes: _allNodes = [],
  lastRun = null,
  onUpdateNode,
  onDeleteNode,
  onClose,
  onOpenWorkflowTest,
}: NodeInspectorProps) {
  if (!selectedNode) return null;

  const { id, type, data } = selectedNode;
  const [label, setLabel] = useState(data.label || '');
  const [config, setConfig] = useState<Record<string, any>>(data.config || {});

  // Tab & Upstream Explorer state (config, outputs, upstream)
  const [activeTab, setActiveTab] = useState<'config' | 'outputs' | 'upstream'>('config');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetField, setTargetField] = useState<string>('message');
  const [insertedToast, setInsertedToast] = useState<string | null>(null);
  const [copiedVarToken, setCopiedVarToken] = useState<string | null>(null);
  const [customPaths, setCustomPaths] = useState<Record<string, string>>({});

  // Activepieces Variable Picker popover state
  const [isVariablePickerOpen, setIsVariablePickerOpen] = useState(false);
  const [activePickerContext, setActivePickerContext] = useState<{
    fieldName: string;
    insertToken: (token: string) => void;
  } | null>(null);

  const handleOpenVariablePicker = (context: {
    fieldName: string;
    insertToken: (token: string) => void;
  }) => {
    setActivePickerContext(context);
    setIsVariablePickerOpen(true);
  };

  const handleSelectFromPicker = (token: string, _friendlyLabel?: string) => {
    if (activePickerContext?.insertToken) {
      activePickerContext.insertToken(token);
    } else {
      insertVariable(token);
    }
    const clean = token.startsWith('{{') ? token : `{{${token}}}`;
    setInsertedToast(`Inserted ${clean} into ${activePickerContext?.fieldName || targetField}!`);
    setTimeout(() => setInsertedToast(null), 2400);
    setIsVariablePickerOpen(false);
  };

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
      case 'set_fields':
        return [{ key: 'value', label: 'Field Value' }];
      case 'filter':
        return [{ key: 'value', label: 'Comparison Target' }];
      case 'stop_workflow':
        return [{ key: 'reason', label: 'Termination Reason' }];
      case 'google_sheets':
        return [{ key: 'webhookUrl', label: 'Google Sheets Webhook URL' }];
      case 'send_media':
        return [
          { key: 'url', label: 'Media URL' },
          { key: 'caption', label: 'Caption Text' },
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

  // Step testing state for all node types
  const [isTestingStep, setIsTestingStep] = useState(false);
  const [stepTestResult, setStepTestResult] = useState<{
    success: boolean;
    status: 'completed' | 'failed';
    durationMs: number;
    output: any;
    error?: string;
  } | null>(null);

  const handleExecuteStepTest = async () => {
    if (type === 'webhook_call') {
      await handleTestWebhook();
      return;
    }

    setIsTestingStep(true);
    const start = Date.now();
    try {
      await new Promise(r => setTimeout(r, 300));
      const durationMs = Date.now() - start;

      const sampleCustomer = {
        name: 'Parth Ramanuj',
        phone: '919876543210',
        message: 'Hello, track my order 1234',
      };

      let simulatedOutput: any = {};
      if (type === 'send_message') {
        const rawMsg = config.message || '';
        const rendered = rawMsg
          .replace(/\{\{trigger\.contactName\}\}/g, sampleCustomer.name)
          .replace(/\{\{trigger\.phone\}\}/g, sampleCustomer.phone)
          .replace(/\{\{trigger\.message\}\}/g, sampleCustomer.message)
          .replace(/\{\{name\}\}/g, sampleCustomer.name)
          .replace(/\{\{phone\}\}/g, sampleCustomer.phone);

        simulatedOutput = {
          recipient: config.recipient || sampleCustomer.phone,
          renderedText: rendered || '(Empty message text)',
          messageId: `wamid.HBg${Date.now()}TEST`,
          timestamp: new Date().toISOString(),
          deliveryStatus: 'simulated_success',
        };
      } else if (type === 'interactive_buttons') {
        const btns = config.buttons || [];
        simulatedOutput = {
          prompt: config.message || 'Please choose an option:',
          choice: btns[0]?.id || 'opt_1',
          userReply: btns[0]?.text || 'Option 1',
          availableButtons: btns.map((b: any) => b.text),
        };
      } else if (type === 'ask_question') {
        const slot = config.slot || 'response';
        simulatedOutput = {
          prompt: config.question || config.message || 'Please reply to continue:',
          expectedSlot: slot,
          answer: 'Test customer reply',
          variables: { [slot]: 'Test customer reply' },
        };
      } else if (type === 'condition_branch') {
        const fieldVal = sampleCustomer.message;
        const operator = config.operator || 'contains';
        const targetVal = config.value || 'order';
        let matched = false;
        if (operator === 'contains') matched = fieldVal.toLowerCase().includes(targetVal.toLowerCase());
        else if (operator === 'equals') matched = fieldVal.toLowerCase() === targetVal.toLowerCase();
        else if (operator === 'starts_with') matched = fieldVal.toLowerCase().startsWith(targetVal.toLowerCase());
        else matched = Boolean(fieldVal);

        simulatedOutput = {
          testedField: config.field || 'trigger.message',
          testedValue: fieldVal,
          operator,
          targetValue: targetVal,
          matched,
          branch: matched ? 'true' : 'false',
        };
      } else if (type === 'ai_assistant') {
        simulatedOutput = {
          systemPrompt: config.prompt || 'You are an AI WhatsApp assistant.',
          userQuery: sampleCustomer.message,
          reply: 'Simulated AI Response: Hello! I can help you with your order #1234. It is currently scheduled for delivery.',
          confidence: 0.96,
          model: config.model || 'gpt-4o-mini',
        };
      } else if (type === 'set_fields') {
        const assignments = config.assignments || [];
        const varsMap: Record<string, any> = {};
        assignments.forEach((a: any) => {
          if (a?.name) varsMap[a.name] = a.value || 'test_val';
        });
        simulatedOutput = {
          assignedVariables: varsMap,
          updatedCount: Object.keys(varsMap).length,
        };
      } else if (type === 'filter') {
        simulatedOutput = {
          checkedField: config.field || 'trigger.message',
          operator: config.operator || 'contains',
          passed: true,
          action: 'continue_workflow',
        };
      } else if (type === 'trigger') {
        simulatedOutput = {
          event: config.eventType || 'message_received',
          sender: `${sampleCustomer.phone}@c.us`,
          phone: sampleCustomer.phone,
          contactName: sampleCustomer.name,
          message: sampleCustomer.message,
          timestamp: new Date().toISOString(),
        };
      } else if (type === 'search_agents') {
        const pin = config.pincode || '380015';
        simulatedOutput = {
          agentsFound: true,
          count: 3,
          pincode: pin,
          agents: [
            { id: 'ag_1', name: 'Rajesh Sharma (IRDAI & AMFI Certified)', phone: '919876501001', rating: 4.9, serviceArea: 'Gujarat & Western Region' },
            { id: 'ag_2', name: 'Priya Patel (Claims & Portfolio Specialist)', phone: '919876501002', rating: 4.95, serviceArea: 'Ahmedabad' },
            { id: 'ag_3', name: 'Artha Advisory Desk (Pan-India)', phone: '919227102108', rating: 5.0, serviceArea: 'Pan-India Priority' },
          ],
          formattedCards: `✅ Found 3 verified advisor(s) serving Pincode *${pin}*:\n\n*1. Rajesh Sharma* ⭐ 4.9/5\n📞 Call Now: tel:+919876501001\n💬 WhatsApp: https://wa.me/919876501001`,
          branch: 'agents_found',
        };
      } else if (type === 'create_lead') {
        simulatedOutput = {
          leadCreated: true,
          leadId: `lead_${Date.now()}`,
          leadNumber: `LD-INS-${Math.floor(10000 + Math.random() * 90000)}`,
          status: 'assigned',
          matchedAgentName: 'Rajesh Sharma (IRDAI & AMFI Certified)',
          matchedAgentPhone: '919876501001',
          customerPhone: sampleCustomer.phone,
          branch: 'lead_created',
        };
      } else if (type === 'validate_pincode') {
        const pin = String(config.pincode || '380015').trim();
        const isValid = /^[1-9][0-9]{5}$/.test(pin);
        simulatedOutput = {
          isValid,
          pincode: pin,
          branch: isValid ? 'pincode_valid' : 'invalid_pincode',
        };
      } else {
        simulatedOutput = {
          nodeId: id,
          nodeType: type,
          status: 'success',
          config,
        };
      }

      setStepTestResult({
        success: true,
        status: 'completed',
        durationMs,
        output: simulatedOutput,
      });
    } catch (err: any) {
      setStepTestResult({
        success: false,
        status: 'failed',
        durationMs: Date.now() - start,
        output: null,
        error: err?.message || 'Failed to simulate step',
      });
    } finally {
      setIsTestingStep(false);
    }
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
        <div className="wf-inspector-header-actions">
          <button
            type="button"
            className="wf-inspector-header-test-btn"
            onClick={handleExecuteStepTest}
            disabled={isTestingStep || isTestingWebhook}
            title="Test Step & Preview Output"
          >
            {isTestingStep || isTestingWebhook ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={11} className="fill-current" />
            )}
            <span>Test Step</span>
          </button>
          <button className="wf-btn-icon-close" onClick={onClose} title="Close inspector">
            <X size={18} />
          </button>
        </div>
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
        <button
          type="button"
          className={`wf-inspector-tab-btn ${activeTab === 'outputs' ? 'active' : ''}`}
          onClick={() => setActiveTab('outputs')}
        >
          <Layers size={13} />
          <span>Outputs & Data</span>
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
        {/* DEDICATED OUTPUTS TAB */}
        {activeTab === 'outputs' && (
          <div className="wf-outputs-tab-content">
            <NodeOutputInspector
              node={{ id, type, data, position: { x: 0, y: 0 } } as Node}
              lastRun={lastRun || (stepTestResult ? ({
                id: 'sim_run',
                workflowId: 'wf',
                businessId: 'default',
                status: 'completed',
                triggerData: null,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                steps: [{
                  actionId: id,
                  status: stepTestResult.status,
                  durationMs: stepTestResult.durationMs,
                  output: stepTestResult.output,
                }],
              } as unknown as WorkflowRun) : null)}
              onCopyToken={handleCopyVar}
              onTestNode={handleExecuteStepTest}
              isTesting={isTestingStep || isTestingWebhook}
            />
          </div>
        )}

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
            <DynamicTextarea
              label="Message Text"
              required
              rows={5}
              placeholder="Enter message text... (Supports {{variables}})"
              value={config.message || ''}
              onChange={val => updateConfig('message', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              quickTokens={[
                { label: 'Phone', token: 'trigger.phone' },
                { label: 'Name', token: 'trigger.contactName' },
                { label: 'Incoming Msg', token: 'trigger.message' },
              ]}
              description="Compose rich WhatsApp messages with text formatting (*bold*, _italic_) and dynamic variables."
            />
          </div>
        )}

        {/* INTERACTIVE BUTTONS NODE */}
        {type === 'interactive_buttons' && (
          <div className="wf-inspector-section">
            <DynamicTextarea
              label="Question / Prompt Text"
              required
              rows={3}
              placeholder="e.g. Please choose an option from the menu:"
              value={config.message || ''}
              onChange={val => updateConfig('message', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="Message displayed above the interactive buttons."
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
                <option value="auto">Interactive Buttons (with Numbered Menu Fallback)</option>
                <option value="buttons">Interactive Buttons Only</option>
                <option value="text">Numbered Interactive Menu (1, 2, 3)</option>
                <option value="poll">WhatsApp Poll (Optional)</option>
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
            <DynamicTextarea
              label="Question Prompt"
              required
              rows={3}
              placeholder="e.g. Please reply with your business email address:"
              value={config.prompt || ''}
              onChange={val => updateConfig('prompt', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="Message sent to the customer asking for input."
            />

            <DynamicInput
              label="Capture Slot Variable"
              required
              placeholder="e.g. email, phone, city, budget"
              value={config.slot || 'response'}
              onChange={val => updateConfig('slot', val)}
              description={`Captured reply is stored as {{vars.${config.slot || 'response'}}} and synced to contact.`}
            />

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

            <DynamicInput
              label="Retry Prompt on Bad Format"
              placeholder="e.g. Invalid email format, please try again:"
              value={config.retryPrompt || ''}
              onChange={val => updateConfig('retryPrompt', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />

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
              <DynamicInput
                label="Custom Field / Variable Expression"
                placeholder="e.g. steps.api_call.data.total or vars.budget"
                value={config.customField || (config.field === 'custom' ? '' : config.field)}
                onChange={val => {
                  updateConfig('customField', val);
                  updateConfig('field', val);
                }}
                onOpenVariablePicker={handleOpenVariablePicker}
              />
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
              <DynamicInput
                label="Comparison Value"
                placeholder="e.g. vip, pricing, 500, true"
                value={config.value || ''}
                onChange={val => updateConfig('value', val)}
                onOpenVariablePicker={handleOpenVariablePicker}
                description="Supports dynamic variables like {{vars.expectedTotal}} or literal values."
              />
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
            <DynamicTextarea
              label="AI System Instructions"
              rows={4}
              placeholder="e.g. You are a helpful sales assistant..."
              value={config.systemPrompt || ''}
              onChange={val => updateConfig('systemPrompt', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="System prompt guiding the AI persona and instructions."
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
            <DynamicInput
              label="Assign To Agent / Team"
              placeholder="e.g. Sales Team, Jane Doe"
              value={config.assignedName || ''}
              onChange={val => updateConfig('assignedName', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="This will update conversation status to Pending and alert agents in the Live Chat inbox."
            />
          </div>
        )}

        {/* ADD TAG NODE */}
        {type === 'add_tag' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Contact Tag"
              placeholder="e.g. interested, hot-lead, vip"
              value={config.tag || ''}
              onChange={val => updateConfig('tag', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="Tag applied to customer profile in CRM."
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
              <DynamicInput
                required
                type="url"
                placeholder="https://api.yourcrm.com/leads or http://localhost:2785/api/webhook-test/echo"
                value={config.url || ''}
                onChange={val => updateConfig('url', val)}
                onOpenVariablePicker={handleOpenVariablePicker}
              />
              {config.url && config.url.includes('/api/webhook-test') && (
                <span className="wf-field-hint" style={{ color: '#38bdf8', marginTop: '0.2rem' }}>
                  ✨ Connected to built-in OpenWA test endpoint! Requests are captured and echoed back.
                </span>
              )}
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

                    <DynamicTextarea
                      rows={6}
                      placeholder='{ "phone": "{{phone}}", "text": "{{message}}" }'
                      value={config.body || ''}
                      onChange={val => updateConfig('body', val)}
                      onOpenVariablePicker={handleOpenVariablePicker}
                      quickTokens={[
                        { label: 'phone', token: 'phone' },
                        { label: 'name', token: 'name' },
                        { label: 'message', token: 'message' },
                      ]}
                      description="Valid JSON payload. Variable tokens will be evaluated at runtime."
                    />
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

        {/* SET FIELDS NODE */}
        {type === 'set_fields' && (
          <div className="wf-inspector-section">
            <div className="wf-field-header-row">
              <label className="wf-field-label">Variable Assignments</label>
              <button
                type="button"
                className="wf-btn-add-var"
                onClick={() => {
                  const current = Array.isArray(config.assignments) ? config.assignments : [];
                  updateConfig('assignments', [...current, { name: '', value: '' }]);
                }}
              >
                <Plus size={11} /> Add Variable
              </button>
            </div>
            <div className="wf-assignments-editor">
              {((Array.isArray(config.assignments) && config.assignments.length > 0)
                ? config.assignments
                : [{ name: 'customVar', value: '{{trigger.message}}' }]
              ).map((a: any, idx: number) => {
                const assignments = Array.isArray(config.assignments) ? config.assignments : [{ name: 'customVar', value: '{{trigger.message}}' }];
                return (
                  <div key={idx} className="wf-assignment-row" style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="wf-field-input"
                      placeholder="Name"
                      style={{ flex: 1 }}
                      value={a.name || ''}
                      onChange={e => {
                        const updated = [...assignments];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        updateConfig('assignments', updated);
                      }}
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>=</span>
                    <input
                      type="text"
                      className="wf-field-input"
                      placeholder="Value"
                      style={{ flex: 1.5 }}
                      value={a.value || ''}
                      onChange={e => {
                        const updated = [...assignments];
                        updated[idx] = { ...updated[idx], value: e.target.value };
                        updateConfig('assignments', updated);
                      }}
                    />
                    <button
                      type="button"
                      className="wf-btn-del-mini"
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                      onClick={() => {
                        const updated = assignments.filter((_: any, i: number) => i !== idx);
                        updateConfig('assignments', updated);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
            <span className="wf-field-hint">
              Variables can be referenced in downstream nodes as <code>{'{{vars.variableName}}'}</code>.
            </span>
          </div>
        )}

        {/* FILTER NODE */}
        {type === 'filter' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Field to Check"
              placeholder="trigger.message, trigger.phone, vars.leadScore"
              value={config.field || 'trigger.message'}
              onChange={val => updateConfig('field', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="Variable expression to test (e.g. trigger.message, vars.vip)."
            />
            <div className="wf-field-group">
              <label className="wf-field-label">Operator</label>
              <select
                className="wf-field-select"
                value={config.operator || 'contains'}
                onChange={e => updateConfig('operator', e.target.value)}
              >
                <option value="contains">Contains (text)</option>
                <option value="not_contains">Does not contain</option>
                <option value="equals">Equals (exact match)</option>
                <option value="not_equals">Does not equal</option>
                <option value="starts_with">Starts with</option>
                <option value="ends_with">Ends with</option>
                <option value="empty">Is Empty</option>
                <option value="not_empty">Is Not Empty</option>
                <option value="greater_than">Greater than (&gt;)</option>
                <option value="less_than">Less than (&lt;)</option>
              </select>
            </div>
            {config.operator !== 'empty' && config.operator !== 'not_empty' && (
              <DynamicInput
                label="Target Comparison Value"
                placeholder="e.g. invoice, urgent, order"
                value={config.value || ''}
                onChange={val => updateConfig('value', val)}
                onOpenVariablePicker={handleOpenVariablePicker}
              />
            )}
            <span className="wf-field-hint">
              If the condition passes, workflow continues; otherwise, execution stops cleanly.
            </span>
          </div>
        )}

        {/* STOP WORKFLOW NODE */}
        {type === 'stop_workflow' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Termination Reason"
              placeholder="e.g. Ineligible customer or completed branch"
              value={config.reason || 'Workflow finished normally'}
              onChange={val => updateConfig('reason', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="This node terminates workflow execution cleanly. No further connected nodes will run."
            />
          </div>
        )}

        {/* GOOGLE SHEETS NODE */}
        {type === 'google_sheets' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Google Sheets / Apps Script Webhook URL"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={config.webhookUrl || config.url || ''}
              onChange={val => {
                updateConfig('webhookUrl', val);
                updateConfig('url', val);
              }}
              onOpenVariablePicker={handleOpenVariablePicker}
              description="Deploy a Google Apps Script as Web App with doPost(e) to append spreadsheet rows."
            />
            <DynamicTextarea
              label="Row Data (JSON Columns)"
              rows={4}
              placeholder='{"Phone": "{{trigger.phone}}", "Message": "{{trigger.message}}", "Date": "{{now}}"}'
              value={typeof config.columns === 'object' ? JSON.stringify(config.columns, null, 2) : (config.columns || '')}
              onChange={val => {
                try {
                  const parsed = JSON.parse(val);
                  updateConfig('columns', parsed);
                } catch {
                  updateConfig('columns', val);
                }
              }}
              onOpenVariablePicker={handleOpenVariablePicker}
              quickTokens={[
                { label: 'Phone', token: 'trigger.phone' },
                { label: 'Message', token: 'trigger.message' },
                { label: 'Name', token: 'trigger.contactName' },
                { label: 'Date', token: 'date' },
              ]}
              description="JSON map of column names to values. Upstream variables are dynamically interpolated."
            />
          </div>
        )}

        {/* SEND MEDIA NODE */}
        {type === 'send_media' && (
          <div className="wf-inspector-section">
            <div className="wf-field-group">
              <label className="wf-field-label">Media Type</label>
              <select
                className="wf-field-select"
                value={config.mediaType || 'image'}
                onChange={e => updateConfig('mediaType', e.target.value)}
              >
                <option value="image">Image (JPEG / PNG)</option>
                <option value="document">Document (PDF / DOC)</option>
                <option value="audio">Audio / Voice Note</option>
              </select>
            </div>
            <DynamicInput
              label="Media File URL"
              placeholder="https://example.com/brochure.pdf"
              value={config.url || config.mediaUrl || ''}
              onChange={val => {
                updateConfig('url', val);
                updateConfig('mediaUrl', val);
              }}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Caption / Description"
              placeholder="Here is your requested catalog, {{trigger.contactName}}!"
              value={config.caption || ''}
              onChange={val => updateConfig('caption', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
          </div>
        )}

        {/* SEARCH AGENTS NODE */}
        {type === 'search_agents' && (
          <div className="wf-inspector-section">
            <div className="wf-field-group">
              <label className="wf-field-label">Primary Service</label>
              <select
                className="wf-field-select"
                value={config.mainService || 'insurance'}
                onChange={e => updateConfig('mainService', e.target.value)}
              >
                <option value="insurance">Insurance Advisory</option>
                <option value="mutual_fund">Mutual Funds & Investments</option>
              </select>
            </div>
            <DynamicInput
              label="Customer Residential Pincode"
              placeholder="{{steps.node-ask-pincode.answer}} or 380015"
              value={config.pincode || ''}
              onChange={val => updateConfig('pincode', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Product Category (Optional)"
              placeholder="{{productCategory}} or Health Insurance"
              value={config.productCategory || ''}
              onChange={val => updateConfig('productCategory', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <div className="wf-field-group">
              <label className="wf-field-label">Maximum Advisors to Display</label>
              <input
                type="number"
                min={1}
                max={5}
                className="wf-field-input"
                value={config.limit || 3}
                onChange={e => updateConfig('limit', parseInt(e.target.value, 10))}
              />
            </div>
            <div className="wf-field-checkbox-row">
              <input
                type="checkbox"
                id="sendDirectMessage"
                checked={config.sendDirectMessage !== false}
                onChange={e => updateConfig('sendDirectMessage', e.target.checked)}
              />
              <label htmlFor="sendDirectMessage" className="text-xs text-slate-300">
                Send advisor profile cards directly to customer on WhatsApp
              </label>
            </div>
          </div>
        )}

        {/* CREATE LEAD NODE */}
        {type === 'create_lead' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Customer Phone Number"
              placeholder="{{trigger.phone}}"
              value={config.customerPhone || ''}
              onChange={val => updateConfig('customerPhone', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <div className="wf-field-group">
              <label className="wf-field-label">Main Service</label>
              <select
                className="wf-field-select"
                value={config.mainService || 'insurance'}
                onChange={e => updateConfig('mainService', e.target.value)}
              >
                <option value="insurance">Insurance</option>
                <option value="mutual_fund">Mutual Fund & Investment</option>
              </select>
            </div>
            <DynamicInput
              label="Selected Service / Journey"
              placeholder="Buy New Insurance / Claim Support / SIP"
              value={config.selectedService || ''}
              onChange={val => updateConfig('selectedService', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Residential Pincode"
              placeholder="{{steps.node-ask-pincode.answer}}"
              value={config.pincode || ''}
              onChange={val => updateConfig('pincode', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
          </div>
        )}

        {/* VALIDATE PINCODE NODE */}
        {type === 'validate_pincode' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Pincode to Validate"
              placeholder="{{last.answer}}"
              value={config.pincode || ''}
              onChange={val => updateConfig('pincode', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <p className="text-xs text-slate-400 mt-2">
              Validates against Indian PIN code standard regex: <code className="text-amber-400 font-mono">^[1-9][0-9]&#123;5&#125;$</code>.
              Branches to <code className="text-emerald-400">pincode_valid</code> or <code className="text-red-400">invalid_pincode</code>.
            </p>
          </div>
        )}

        {/* SEND CONTACT VCARD NODE */}
        {type === 'send_contact_vcard' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Advisor Full Name"
              placeholder="{{steps.search_agents.primaryAgent.name}} or Alpeshkumar Patel"
              value={config.displayName || ''}
              onChange={val => updateConfig('displayName', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Contact Phone Number"
              placeholder="{{steps.search_agents.primaryAgent.phone}} or +919426378401"
              value={config.phoneNumber || ''}
              onChange={val => updateConfig('phoneNumber', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Company / Agency Name"
              placeholder="LIC / HDFC Life / PadosiAgent"
              value={config.organization || ''}
              onChange={val => updateConfig('organization', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Advisor Designation"
              placeholder="Senior Certified Financial Advisor"
              value={config.title || ''}
              onChange={val => updateConfig('title', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <p className="text-xs text-emerald-400 mt-2">
              💡 Sends a native WhatsApp Contact Card with 1-click "Save Contact" button on the customer's phone.
            </p>
          </div>
        )}

        {/* WORKING HOURS GATEWAY NODE */}
        {type === 'working_hours_gateway' && (
          <div className="wf-inspector-section">
            <div className="grid grid-cols-2 gap-3">
              <div className="wf-field-group">
                <label className="wf-field-label">Opening Time</label>
                <input
                  type="time"
                  className="wf-field-input"
                  value={config.openTime || '09:00'}
                  onChange={e => updateConfig('openTime', e.target.value)}
                />
              </div>
              <div className="wf-field-group">
                <label className="wf-field-label">Closing Time</label>
                <input
                  type="time"
                  className="wf-field-input"
                  value={config.closeTime || '20:00'}
                  onChange={e => updateConfig('closeTime', e.target.value)}
                />
              </div>
            </div>
            <div className="wf-field-group mt-2">
              <label className="wf-field-label">Office Timezone</label>
              <select
                className="wf-field-select"
                value={config.timezone || 'Asia/Kolkata'}
                onChange={e => updateConfig('timezone', e.target.value)}
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST - India)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST - UAE)</option>
                <option value="UTC">UTC (Universal)</option>
              </select>
            </div>
            <p className="text-xs text-amber-400 mt-2">
              ⚡ Connect the right port for <strong>OPEN</strong> hours and bottom port for <strong>CLOSED</strong> hours.
            </p>
          </div>
        )}

        {/* INTERNAL ALERT NODE */}
        {type === 'internal_alert' && (
          <div className="wf-inspector-section">
            <DynamicInput
              label="Manager / Advisor Phone Number"
              placeholder="919876543210 (without +)"
              value={config.recipientPhone || ''}
              onChange={val => updateConfig('recipientPhone', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicTextarea
              label="Alert Notification Message"
              placeholder="🚨 *NEW LEAD!* Name: {{trigger.contactName}}..."
              value={config.templateMessage || ''}
              onChange={val => updateConfig('templateMessage', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
              rows={5}
            />
            <p className="text-xs text-slate-400 mt-1">
              Dispatches an immediate alert to your internal team WhatsApp without interrupting the customer's chat.
            </p>
          </div>
        )}

        {/* A/B TEST SPLIT NODE */}
        {type === 'ab_test_split' && (
          <div className="wf-inspector-section">
            <div className="wf-field-group">
              <label className="wf-field-label">Variant A Percentage ({config.splitRatio || 50}%)</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                className="w-full"
                value={config.splitRatio || 50}
                onChange={e => updateConfig('splitRatio', parseInt(e.target.value, 10))}
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>Branch A: {config.splitRatio || 50}%</span>
                <span>Branch B: {100 - (config.splitRatio || 50)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* FINANCIAL CALCULATOR NODE */}
        {type === 'financial_calculator' && (
          <div className="wf-inspector-section">
            <div className="wf-field-group">
              <label className="wf-field-label">Calculation Mode</label>
              <select
                className="wf-field-select"
                value={config.mode || 'SIP'}
                onChange={e => updateConfig('mode', e.target.value)}
              >
                <option value="SIP">Monthly SIP (Wealth Accumulator)</option>
                <option value="LOAN_EMI">Loan / Policy EMI</option>
                <option value="LUMPSUM">Lump-sum Investment</option>
              </select>
            </div>
            <DynamicInput
              label="Investment / Loan Amount (₹)"
              placeholder="{{steps.amount.value}} or 5000"
              value={config.monthlyInvestment || config.amount || ''}
              onChange={val => updateConfig('monthlyInvestment', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <DynamicInput
                label="Duration (Years)"
                placeholder="15"
                value={config.durationYears || '15'}
                onChange={val => updateConfig('durationYears', val)}
                onOpenVariablePicker={handleOpenVariablePicker}
              />
              <DynamicInput
                label="Expected Return / Interest Rate (%)"
                placeholder="13.5"
                value={config.expectedReturnRate || '13.5'}
                onChange={val => updateConfig('expectedReturnRate', val)}
                onOpenVariablePicker={handleOpenVariablePicker}
              />
            </div>
            <p className="text-xs text-cyan-400 mt-2">
              📊 Outputs: <code className="text-white">steps.{'{id}'}.formattedFutureValue</code>, <code className="text-white">steps.{'{id}'}.formattedWealthGain</code>.
            </p>
          </div>
        )}

        {/* PAYMENT LINK NODE */}
        {type === 'payment_link' && (
          <div className="wf-inspector-section">
            <div className="wf-field-group">
              <label className="wf-field-label">Payment Gateway / Method</label>
              <select
                className="wf-field-select"
                value={config.provider || 'UPI'}
                onChange={e => updateConfig('provider', e.target.value)}
              >
                <option value="UPI">UPI Deep Link (GPay / PhonePe / Paytm)</option>
                <option value="RAZORPAY">Razorpay Payment Link</option>
              </select>
            </div>
            <DynamicInput
              label="Amount to Charge (₹)"
              placeholder="299"
              value={config.amount || ''}
              onChange={val => updateConfig('amount', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Payment Description / Purpose"
              placeholder="Advisor Consultation & Policy Audit"
              value={config.description || ''}
              onChange={val => updateConfig('description', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Business UPI VPA / ID"
              placeholder="paytmqr.advisor@paytm"
              value={config.payeeVpa || ''}
              onChange={val => updateConfig('payeeVpa', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
          </div>
        )}

        {/* AI DOCUMENT OCR NODE */}
        {type === 'ai_document_ocr' && (
          <div className="wf-inspector-section">
            <div className="wf-field-group">
              <label className="wf-field-label">Target Document Type</label>
              <select
                className="wf-field-select"
                value={config.documentType || 'POLICY'}
                onChange={e => updateConfig('documentType', e.target.value)}
              >
                <option value="POLICY">Insurance Policy Schedule / Certificate</option>
                <option value="RC_BOOK">Vehicle Registration RC Book</option>
                <option value="AADHAAR">Identity / Aadhaar Card</option>
                <option value="AUTO">Auto Detect</option>
              </select>
            </div>
            <DynamicInput
              label="Image URL to Parse (Optional)"
              placeholder="{{trigger.mediaUrl}} or latest image"
              value={config.imageUrl || ''}
              onChange={val => updateConfig('imageUrl', val)}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
          </div>
        )}

        {/* SEND CAROUSEL TEMPLATE NODE */}
        {type === 'send_carousel_template' && (
          <div className="wf-inspector-section">
            <p className="text-xs text-slate-300 mb-2">
              Displays interactive swipeable cards on Meta Cloud API, or separate Unicode-framed advisor cards on WhatsApp Web.
            </p>
            <DynamicInput
              label="Card 1 Title"
              placeholder="Alpeshkumar Patel (20+ Yrs Exp)"
              value={config.cards?.[0]?.title || ''}
              onChange={val => {
                const cards = [...(config.cards || [{ title: '', description: '' }])];
                cards[0] = { ...cards[0], title: val };
                updateConfig('cards', cards);
              }}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
            <DynamicInput
              label="Card 1 Phone (For Direct Call/Chat)"
              placeholder="919426378401"
              value={config.cards?.[0]?.phone || ''}
              onChange={val => {
                const cards = [...(config.cards || [{ title: '', description: '' }])];
                cards[0] = { ...cards[0], phone: val };
                updateConfig('cards', cards);
              }}
              onOpenVariablePicker={handleOpenVariablePicker}
            />
          </div>
        )}

        {/* TEST STEP ACTION PANEL */}
        <div className="wf-step-test-panel">
          <div className="wf-step-test-header">
            <div className="wf-step-test-info">
              <span className="wf-step-test-title">
                <Play size={13} className="text-cyan-400 fill-current" />
                Step Testing
              </span>
              <span className="wf-step-test-subtitle">
                Test this step with sample data and verify output schema
              </span>
            </div>
            <div className="wf-step-test-actions">
              <button
                type="button"
                className="wf-btn-test-step-primary"
                onClick={handleExecuteStepTest}
                disabled={isTestingStep || isTestingWebhook}
                title="Test this node and preview outputs"
              >
                {isTestingStep || isTestingWebhook ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <Play size={12} className="fill-current" />
                    <span>Test Step</span>
                  </>
                )}
              </button>
              {onOpenWorkflowTest && (
                <button
                  type="button"
                  className="wf-btn-test-flow-secondary"
                  onClick={onOpenWorkflowTest}
                  title="Run full workflow simulation"
                >
                  <FlaskConical size={13} />
                  <span>Test Flow</span>
                </button>
              )}
            </div>
          </div>

          {/* Webhook result */}
          {type === 'webhook_call' && testResult && (
            <div className={`wf-step-test-result-box ${testResult.success ? 'success' : 'failed'}`}>
              <div className="wf-step-test-result-top">
                <span className={`wf-step-status-pill ${testResult.success ? 'success' : 'failed'}`}>
                  {testResult.success ? '200 OK' : `${testResult.statusCode || 500} ERROR`}
                </span>
                <span className="wf-step-duration-label">
                  <Clock size={11} /> {testResult.durationMs}ms
                </span>
                <button
                  type="button"
                  className="wf-btn-copy-result"
                  onClick={copyResultToClipboard}
                >
                  {copiedResponse ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="wf-step-result-json">
                {typeof testResult.data === 'object'
                  ? JSON.stringify(testResult.data, null, 2)
                  : String(testResult.data ?? testResult.error ?? '')}
              </pre>
            </div>
          )}

          {/* Other node result */}
          {type !== 'webhook_call' && stepTestResult && (
            <div className={`wf-step-test-result-box ${stepTestResult.success ? 'success' : 'failed'}`}>
              <div className="wf-step-test-result-top">
                <span className={`wf-step-status-pill ${stepTestResult.success ? 'success' : 'failed'}`}>
                  {stepTestResult.success ? 'SUCCESS' : 'FAILED'}
                </span>
                <span className="wf-step-duration-label">
                  <Clock size={11} /> {stepTestResult.durationMs}ms
                </span>
                <button
                  type="button"
                  className="wf-btn-copy-result"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(stepTestResult.output, null, 2));
                    setCopiedResponse(true);
                    setTimeout(() => setCopiedResponse(false), 1800);
                  }}
                >
                  {copiedResponse ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedResponse ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="wf-step-result-json">
                {JSON.stringify(stepTestResult.output, null, 2)}
              </pre>
            </div>
          )}
        </div>

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

      {/* Activepieces-Style Variable Picker / Data Selector Popover */}
      <VariablePicker
        isOpen={isVariablePickerOpen}
        onClose={() => setIsVariablePickerOpen(false)}
        upstreamNodes={upstreamNodes}
        lastRun={lastRun}
        onSelectVariable={handleSelectFromPicker}
        anchorFieldName={activePickerContext?.fieldName || targetField}
      />
    </div>
  );
}
