import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Sparkles,
  Boxes,
  Layers,
  Send,
  Sliders,
  Table,
  Filter,
  StopCircle,
  Paperclip,
  Code,
  HelpCircle,
  Bot,
  GitBranch,
  UserCheck,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { WorkflowRun } from '../../services/api';
import type { FieldAssignment, ResponseMapping, WorkflowNodeData } from './types';

export type VariableType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export interface VariableItem {
  key: string;
  token: string;
  label: string;
  friendlyPath: string;
  type: VariableType;
  description?: string;
  example?: unknown;
  children?: VariableItem[];
}

export interface NodeVariableGroup {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  icon: ReactNode;
  variables: VariableItem[];
}

interface VariablePickerProps {
  isOpen: boolean;
  onClose: () => void;
  upstreamNodes: Node[];
  lastRun?: WorkflowRun | null;
  onSelectVariable: (token: string, friendlyLabel?: string) => void;
  anchorFieldName?: string;
  searchPlaceholder?: string;
}

function getNodeIcon(nodeType: string): ReactNode {
  switch (nodeType) {
    case 'trigger': return <Sparkles size={14} className="text-emerald-400" />;
    case 'send_message': return <Send size={14} className="text-emerald-400" />;
    case 'send_media': return <Paperclip size={14} className="text-teal-400" />;
    case 'interactive_buttons': return <Sliders size={14} className="text-blue-400" />;
    case 'ask_question': return <HelpCircle size={14} className="text-amber-400" />;
    case 'condition_branch': return <GitBranch size={14} className="text-purple-400" />;
    case 'filter': return <Filter size={14} className="text-cyan-400" />;
    case 'set_fields': return <Sliders size={14} className="text-indigo-400" />;
    case 'stop_workflow': return <StopCircle size={14} className="text-rose-400" />;
    case 'google_sheets': return <Table size={14} className="text-emerald-500" />;
    case 'webhook_call': return <Code size={14} className="text-sky-400" />;
    case 'ai_assistant': return <Bot size={14} className="text-fuchsia-400" />;
    case 'search_agents': return <UserCheck size={14} className="text-emerald-400" />;
    case 'create_lead': return <ShieldCheck size={14} className="text-indigo-400" />;
    case 'validate_pincode': return <MapPin size={14} className="text-amber-400" />;
    default: return <Layers size={14} className="text-slate-400" />;
  }
}

function getTypeBadge(type: VariableType): { label: string; className: string } {
  switch (type) {
    case 'string':
      return { label: 'text', className: 'type-badge-string' };
    case 'number':
      return { label: '123', className: 'type-badge-number' };
    case 'boolean':
      return { label: 'bool', className: 'type-badge-boolean' };
    case 'object':
      return { label: '{ }', className: 'type-badge-object' };
    case 'array':
      return { label: '[ ]', className: 'type-badge-array' };
    default:
      return { label: 'val', className: 'type-badge-null' };
  }
}

export function VariablePicker({
  isOpen,
  onClose,
  upstreamNodes,
  lastRun,
  onSelectVariable,
  anchorFieldName = 'Active Field',
  searchPlaceholder = 'Search upstream data & variables...',
}: VariablePickerProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'outputs' | 'builtin'>('outputs');
  const [viewMode, setViewMode] = useState<'friendly' | 'advanced'>('friendly');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [expandedObjects, setExpandedObjects] = useState<Record<string, boolean>>({});
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Auto-expand all upstream nodes on open
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, boolean> = {};
      upstreamNodes.forEach(n => {
        initial[n.id] = true;
      });
      setExpandedNodes(initial);
      setSearch('');
    }
  }, [isOpen, upstreamNodes]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Extract execution results map from lastRun
  const runtimeStepOutputs = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {};
    if (lastRun && Array.isArray(lastRun.steps)) {
      (lastRun.steps as Array<{ actionId?: string; output?: Record<string, unknown> }>).forEach(s => {
        if (s && s.actionId && s.output) {
          map[s.actionId] = s.output;
        }
      });
    }
    // Also check triggerData
    const triggerData = (lastRun?.triggerData as { stepOutputs?: Record<string, Record<string, unknown>> }) || {};
    if (triggerData.stepOutputs) {
      Object.assign(map, triggerData.stepOutputs);
    }
    return map;
  }, [lastRun]);

  // Build schema variable groups for each upstream node
  const nodeGroups: NodeVariableGroup[] = useMemo(() => {
    return upstreamNodes.map(node => {
      const id = node.id;
      const type = node.type || '';
      const label = (node.data as Partial<WorkflowNodeData>)?.label || id;
      const config = (node.data as Partial<WorkflowNodeData>)?.config || {};
      const runtimeOutput = runtimeStepOutputs[id];
      const items: VariableItem[] = [];

      switch (type) {
        case 'trigger': {
          items.push(
            {
              key: 'message',
              token: 'trigger.message',
              label: 'Message Text',
              friendlyPath: `${label} › Message Text`,
              type: 'string',
              description: 'Body text of the incoming WhatsApp message',
              example: runtimeOutput?.text || runtimeOutput?.message || 'Hello, I have an inquiry',
            },
            {
              key: 'phone',
              token: 'trigger.phone',
              label: 'Sender Phone',
              friendlyPath: `${label} › Sender Phone`,
              type: 'string',
              description: 'Clean phone number without @c.us suffix',
              example: runtimeOutput?.phone || '919876543210',
            },
            {
              key: 'contactName',
              token: 'trigger.contactName',
              label: 'Sender Profile Name',
              friendlyPath: `${label} › Sender Profile Name`,
              type: 'string',
              description: 'Customer WhatsApp display name',
              example: runtimeOutput?.name || runtimeOutput?.contactName || 'Aarav Sharma',
            },
            {
              key: 'chatId',
              token: 'trigger.chatId',
              label: 'Full Chat JID',
              friendlyPath: `${label} › Full Chat JID`,
              type: 'string',
              description: 'Internal WhatsApp identifier',
              example: '919876543210@c.us',
            },
            {
              key: 'contact.name',
              token: 'contact.name',
              label: 'Contact Name (CRM)',
              friendlyPath: `${label} › Contact Name`,
              type: 'string',
              description: 'Contact CRM profile record name',
              example: 'Aarav Sharma',
            },
            {
              key: 'contact.phone',
              token: 'contact.phone',
              label: 'Contact Phone (CRM)',
              friendlyPath: `${label} › Contact Phone`,
              type: 'string',
              description: 'Contact CRM profile phone number',
              example: '919876543210',
            },
          );
          break;
        }

        case 'webhook_call': {
          const bodyData = runtimeOutput?.data || {
            orderId: 'ORD-9821',
            status: 'delivered',
            total: 1499,
            customerName: 'Aarav Sharma',
            tracking: 'IN-TRACK-772',
          };

          items.push(
            {
              key: 'data',
              token: `steps.${id}.data`,
              label: 'Full Response Body',
              friendlyPath: `${label} › Response Body`,
              type: 'object',
              description: 'Complete parsed JSON object from HTTP response',
              example: JSON.stringify(bodyData),
              children: Object.entries(bodyData).map(([k, v]) => ({
                key: `data.${k}`,
                token: `steps.${id}.data.${k}`,
                label: `data.${k}`,
                friendlyPath: `${label} › data › ${k}`,
                type: Array.isArray(v) ? 'array' : typeof v === 'object' && v !== null ? 'object' : (typeof v as VariableType),
                example: typeof v === 'object' ? JSON.stringify(v) : String(v),
              })),
            },
            {
              key: 'statusCode',
              token: `steps.${id}.statusCode`,
              label: 'Status Code',
              friendlyPath: `${label} › Status Code`,
              type: 'number',
              description: 'HTTP response status (200, 201, 404, etc.)',
              example: runtimeOutput?.statusCode || 200,
            },
            {
              key: 'durationMs',
              token: `steps.${id}.durationMs`,
              label: 'Response Time (ms)',
              friendlyPath: `${label} › Response Time`,
              type: 'number',
              description: 'Roundtrip execution latency in milliseconds',
              example: runtimeOutput?.durationMs || 124,
            },
          );

          // Add configured response mappings if present
          if (Array.isArray(config.responseMapping)) {
            config.responseMapping.forEach((m: ResponseMapping) => {
              if (m && m.variable) {
                items.push({
                  key: `vars.${m.variable}`,
                  token: `vars.${m.variable}`,
                  label: `Mapped: {{vars.${m.variable}}}`,
                  friendlyPath: `${label} › Mapped: ${m.variable}`,
                  type: 'string',
                  description: `Variable extracted from response path "${m.path}"`,
                  example: m.example || 'extracted_value',
                });
              }
            });
          }
          break;
        }

        case 'set_fields': {
          const assignments = Array.isArray(config.assignments) ? config.assignments : [];
          assignments.forEach((a: FieldAssignment) => {
            if (a && a.name) {
              items.push({
                key: a.name,
                token: `vars.${a.name}`,
                label: `Variable: {{vars.${a.name}}}`,
                friendlyPath: `${label} › ${a.name}`,
                type: 'string',
                description: `Custom variable assigned value "${a.value || ''}"`,
                example: a.value || 'assigned_value',
              });
            }
          });
          items.push({
            key: 'variables',
            token: `steps.${id}.variables`,
            label: 'All Assigned Variables',
            friendlyPath: `${label} › Variables Map`,
            type: 'object',
            description: 'Dictionary of all key-value pairs set by this node',
          });
          break;
        }

        case 'ask_question': {
          const slot = config.slot || 'response';
          items.push(
            {
              key: 'answer',
              token: `steps.${id}.answer`,
              label: 'Customer Answer',
              friendlyPath: `${label} › Customer Answer`,
              type: 'string',
              description: 'Customer message text captured in reply to this question',
              example: runtimeOutput?.answer || 'John Doe',
            },
            {
              key: `vars.${slot}`,
              token: `vars.${slot}`,
              label: `Slot: {{vars.${slot}}}`,
              friendlyPath: `${label} › Slot: ${slot}`,
              type: 'string',
              description: `Captured answer saved into contact slot "${slot}"`,
              example: runtimeOutput?.answer || 'John Doe',
            },
          );
          break;
        }

        case 'interactive_buttons': {
          items.push(
            {
              key: 'choice',
              token: `steps.${id}.choice`,
              label: 'Chosen Button ID',
              friendlyPath: `${label} › Chosen Button ID`,
              type: 'string',
              description: 'ID of the button selected by customer',
              example: runtimeOutput?.choice || 'opt_1',
            },
            {
              key: 'userReply',
              token: `steps.${id}.userReply`,
              label: 'Chosen Button Title',
              friendlyPath: `${label} › Chosen Button Title`,
              type: 'string',
              description: 'Title text of selected button',
              example: runtimeOutput?.userReply || 'Track Order',
            },
            {
              key: 'lastChoice',
              token: 'vars.lastChoice',
              label: 'Last Button Choice',
              friendlyPath: `${label} › Last Button Choice`,
              type: 'string',
              description: 'Most recently selected interactive choice',
              example: 'opt_1',
            },
          );
          break;
        }

        case 'ai_assistant': {
          items.push(
            {
              key: 'reply',
              token: `steps.${id}.reply`,
              label: 'AI Generated Reply',
              friendlyPath: `${label} › AI Reply`,
              type: 'string',
              description: 'Complete text response generated by the AI model',
              example: runtimeOutput?.reply || 'Your order is on the way and arriving tomorrow!',
            },
            {
              key: 'confidence',
              token: `steps.${id}.confidence`,
              label: 'Confidence Score',
              friendlyPath: `${label} › Confidence`,
              type: 'number',
              description: 'AI model confidence rating (0 to 1)',
              example: runtimeOutput?.confidence || 0.98,
            },
            {
              key: 'handoff',
              token: `steps.${id}.handoff`,
              label: 'Human Handover Flag',
              friendlyPath: `${label} › Handover Flag`,
              type: 'boolean',
              description: 'Whether the AI recommended escalating to human support',
              example: runtimeOutput?.handoff || false,
            },
          );
          break;
        }

        case 'filter': {
          items.push(
            {
              key: 'passed',
              token: `steps.${id}.passed`,
              label: 'Filter Passed',
              friendlyPath: `${label} › Passed`,
              type: 'boolean',
              description: 'Whether the filter condition evaluated to true',
              example: true,
            },
            {
              key: 'value',
              token: `steps.${id}.value`,
              label: 'Evaluated Value',
              friendlyPath: `${label} › Evaluated Value`,
              type: 'string',
              description: 'Resolved string value of the tested field',
              example: runtimeOutput?.value || 'urgent priority',
            },
          );
          break;
        }

        case 'condition_branch': {
          items.push(
            {
              key: 'branch',
              token: `steps.${id}.branch`,
              label: 'Selected Branch',
              friendlyPath: `${label} › Selected Branch`,
              type: 'string',
              description: 'Active execution branch ("true" or "false")',
              example: 'true',
            },
            {
              key: 'matched',
              token: `steps.${id}.matched`,
              label: 'Condition Match',
              friendlyPath: `${label} › Condition Match`,
              type: 'boolean',
              description: 'Boolean outcome of the condition logic',
              example: true,
            },
          );
          break;
        }

        case 'google_sheets': {
          items.push(
            {
              key: 'success',
              token: `steps.${id}.success`,
              label: 'Append Status',
              friendlyPath: `${label} › Append Status`,
              type: 'boolean',
              description: 'True if spreadsheet row append succeeded',
              example: true,
            },
            {
              key: 'appendedRow',
              token: `steps.${id}.appendedRow`,
              label: 'Appended Row Data',
              friendlyPath: `${label} › Appended Row`,
              type: 'object',
              description: 'Object containing formatted spreadsheet column values',
            },
          );
          break;
        }

        case 'send_media': {
          items.push(
            {
              key: 'messageId',
              token: `steps.${id}.messageId`,
              label: 'Media Message ID',
              friendlyPath: `${label} › Message ID`,
              type: 'string',
              description: 'Assigned WhatsApp media message identifier',
              example: 'wamid.HBgLMTE5OT...',
            },
            {
              key: 'sent',
              token: `steps.${id}.sent`,
              label: 'Dispatch Success',
              friendlyPath: `${label} › Dispatch Success`,
              type: 'boolean',
              description: 'Whether media transmission succeeded',
              example: true,
            },
          );
          break;
        }

        case 'send_message': {
          items.push(
            {
              key: 'messageId',
              token: `steps.${id}.messageId`,
              label: 'Sent Message ID',
              friendlyPath: `${label} › Sent Message ID`,
              type: 'string',
              description: 'Delivered WhatsApp message ID',
              example: 'msg_1092837',
            },
            {
              key: 'text',
              token: `steps.${id}.text`,
              label: 'Rendered Message Text',
              friendlyPath: `${label} › Rendered Text`,
              type: 'string',
              description: 'Final interpolated text dispatched to recipient',
              example: 'Thank you for your inquiry!',
            },
          );
          break;
        }

        case 'search_agents': {
          items.push(
            {
              key: 'count',
              token: `steps.${id}.count`,
              label: 'Advisors Count',
              friendlyPath: `${label} › Found Count`,
              type: 'number',
              description: 'Number of certified advisors matched for this location',
              example: 3,
            },
            {
              key: 'formattedCards',
              token: `steps.${id}.formattedCards`,
              label: 'Advisor Profile Cards Text',
              friendlyPath: `${label} › Formatted Cards`,
              type: 'string',
              description: 'Rendered WhatsApp text with direct Call Now & WhatsApp links',
              example: '✅ Found 3 verified advisors...',
            },
            {
              key: 'pincode',
              token: `steps.${id}.pincode`,
              label: 'Searched Pincode',
              friendlyPath: `${label} › Pincode`,
              type: 'string',
              description: 'Pincode searched for advisors',
              example: '380015',
            },
          );
          break;
        }

        case 'create_lead': {
          items.push(
            {
              key: 'leadNumber',
              token: `steps.${id}.leadNumber`,
              label: 'Lead Reference Number',
              friendlyPath: `${label} › Lead Number`,
              type: 'string',
              description: 'Unique reference identifier for customer query',
              example: 'LD-INS-58291',
            },
            {
              key: 'leadId',
              token: `steps.${id}.leadId`,
              label: 'Lead Database ID',
              friendlyPath: `${label} › Lead ID`,
              type: 'string',
              description: 'Primary key UUID of the saved lead in database',
              example: 'lead_uuid_123',
            },
            {
              key: 'status',
              token: `steps.${id}.status`,
              label: 'Lead Status',
              friendlyPath: `${label} › Status`,
              type: 'string',
              description: 'Current status of the lead: assigned / qualified',
              example: 'assigned',
            },
            {
              key: 'matchedAgentName',
              token: `steps.${id}.matchedAgentName`,
              label: 'Assigned Advisor Name',
              friendlyPath: `${label} › Advisor Name`,
              type: 'string',
              description: 'Full name and accreditation of the assigned advisor',
              example: 'Rajesh Sharma (IRDAI & AMFI)',
            },
            {
              key: 'matchedAgentPhone',
              token: `steps.${id}.matchedAgentPhone`,
              label: 'Assigned Advisor Phone',
              friendlyPath: `${label} › Advisor Phone`,
              type: 'string',
              description: 'Direct phone number of the assigned advisor',
              example: '919876501001',
            },
          );
          break;
        }

        case 'validate_pincode': {
          items.push(
            {
              key: 'isValid',
              token: `steps.${id}.isValid`,
              label: 'Is Valid Pincode',
              friendlyPath: `${label} › Is Valid`,
              type: 'boolean',
              description: 'Whether the submitted 6-digit Indian PIN code passed validation',
              example: true,
            },
            {
              key: 'pincode',
              token: `steps.${id}.pincode`,
              label: 'Cleaned Pincode',
              friendlyPath: `${label} › Clean Pincode`,
              type: 'string',
              description: 'Sanitized 6-digit Pincode value',
              example: '380015',
            },
          );
          break;
        }

        default: {
          items.push({
            key: 'output',
            token: `steps.${id}`,
            label: 'Step Output Data',
            friendlyPath: `${label} › Output`,
            type: 'object',
            description: 'Full step output record',
            example: '{}',
          });
        }
      }

      return {
        nodeId: id,
        nodeType: type,
        nodeLabel: label,
        icon: getNodeIcon(type),
        variables: items,
      };
    });
  }, [upstreamNodes, runtimeStepOutputs]);

  // Built-in system variables
  const builtinVariables: VariableItem[] = useMemo(() => [
    {
      key: 'now',
      token: 'now',
      label: 'Current Timestamp (ISO)',
      friendlyPath: 'System › Current Timestamp',
      type: 'string',
      description: 'Current UTC timestamp in ISO 8601 format',
      example: new Date().toISOString(),
    },
    {
      key: 'today',
      token: 'today',
      label: 'Current Date (YYYY-MM-DD)',
      friendlyPath: 'System › Current Date',
      type: 'string',
      description: 'Current date string without time component',
      example: new Date().toISOString().slice(0, 10),
    },
    {
      key: 'randomId',
      token: 'randomId',
      label: 'Random Unique ID',
      friendlyPath: 'System › Random ID',
      type: 'string',
      description: 'Short cryptographically random ticket/reference ID',
      example: 'a7f92bc',
    },
    {
      key: 'phone',
      token: 'phone',
      label: 'Customer Phone (Shorthand)',
      friendlyPath: 'Shorthand › Customer Phone',
      type: 'string',
      description: 'Shorthand equivalent to {{trigger.phone}}',
      example: '919876543210',
    },
    {
      key: 'message',
      token: 'message',
      label: 'Incoming Message (Shorthand)',
      friendlyPath: 'Shorthand › Incoming Message',
      type: 'string',
      description: 'Shorthand equivalent to {{trigger.message}}',
      example: 'Order status check',
    },
    {
      key: 'name',
      token: 'name',
      label: 'Contact Name (Shorthand)',
      friendlyPath: 'Shorthand › Contact Name',
      type: 'string',
      description: 'Shorthand equivalent to {{trigger.contactName}}',
      example: 'Aarav Sharma',
    },
  ], []);

  // Filter groups according to search input
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return nodeGroups;
    const q = search.toLowerCase();

    return nodeGroups
      .map(group => {
        const matchesGroupLabel = group.nodeLabel.toLowerCase().includes(q);
        const filteredVars = group.variables.filter(v => {
          if (matchesGroupLabel) return true;
          if (v.label.toLowerCase().includes(q)) return true;
          if (v.token.toLowerCase().includes(q)) return true;
          if (v.friendlyPath.toLowerCase().includes(q)) return true;
          if (v.description?.toLowerCase().includes(q)) return true;
          if (v.children?.some(c => c.label.toLowerCase().includes(q) || c.token.toLowerCase().includes(q))) return true;
          return false;
        });

        return {
          ...group,
          variables: filteredVars,
        };
      })
      .filter(g => g.variables.length > 0);
  }, [nodeGroups, search]);

  const filteredBuiltins = useMemo(() => {
    if (!search.trim()) return builtinVariables;
    const q = search.toLowerCase();
    return builtinVariables.filter(
      b => b.label.toLowerCase().includes(q) || b.token.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q),
    );
  }, [builtinVariables, search]);

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const toggleObjectExpanded = (token: string) => {
    setExpandedObjects(prev => ({ ...prev, [token]: !prev[token] }));
  };

  const handleCopy = (e: React.MouseEvent, token: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`{{${token}}}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1800);
  };

  const handleSelect = (item: VariableItem) => {
    onSelectVariable(item.token, item.label);
  };

  if (!isOpen) return null;

  return (
    <div className="ap-data-selector-backdrop" onClick={onClose}>
      <div className="ap-data-selector-popover" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ap-data-selector-header">
          <div className="ap-header-title-row">
            <div className="ap-header-title">
              <span className="ap-picker-chip">Data Selector</span>
              <span className="ap-target-badge" title={`Inserting into: ${anchorFieldName}`}>
                {anchorFieldName}
              </span>
            </div>
            <button className="ap-close-btn" onClick={onClose} title="Close (Esc)">
              <X size={15} />
            </button>
          </div>

          {/* Search Box */}
          <div className="ap-search-bar">
            <Search size={14} className="ap-search-icon" />
            <input
              type="text"
              className="ap-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
            {search && (
              <button className="ap-search-clear" onClick={() => setSearch('')}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Tab Bar & View Mode Toggle */}
          <div className="ap-controls-row">
            <div className="ap-tab-group">
              <button
                className={`ap-tab-btn ${activeTab === 'outputs' ? 'active' : ''}`}
                onClick={() => setActiveTab('outputs')}
              >
                Upstream Data ({upstreamNodes.length})
              </button>
              <button
                className={`ap-tab-btn ${activeTab === 'builtin' ? 'active' : ''}`}
                onClick={() => setActiveTab('builtin')}
              >
                Variables & Helpers ({builtinVariables.length})
              </button>
            </div>

            <div className="ap-view-toggle">
              <button
                className={`ap-view-btn ${viewMode === 'friendly' ? 'active' : ''}`}
                onClick={() => setViewMode('friendly')}
                title="Show human-readable path tree"
              >
                Friendly
              </button>
              <button
                className={`ap-view-btn ${viewMode === 'advanced' ? 'active' : ''}`}
                onClick={() => setViewMode('advanced')}
                title="Show raw canonical tokens {{token}}"
              >
                Advanced
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="ap-data-selector-body">
          {activeTab === 'outputs' ? (
            filteredGroups.length === 0 ? (
              <div className="ap-empty-state">
                <div className="ap-empty-icon">
                  <Boxes size={28} />
                </div>
                <h4>No Upstream Outputs Found</h4>
                <p>
                  {search
                    ? `No output matching "${search}". Try searching for text, phone, or orderId.`
                    : upstreamNodes.length === 0
                    ? 'This node is not connected to any upstream trigger or action node yet. Connect nodes on the canvas to pass data into this step.'
                    : 'Connect upstream steps or run a test simulation to generate output variables.'}
                </p>
              </div>
            ) : (
              <div className="ap-nodes-list">
                {filteredGroups.map(group => {
                  const isExpanded = expandedNodes[group.nodeId] ?? true;

                  return (
                    <div key={group.nodeId} className="ap-node-card">
                      <div
                        className="ap-node-card-header"
                        onClick={() => toggleNodeExpanded(group.nodeId)}
                      >
                        <div className="ap-node-title-group">
                          <span className="ap-node-icon">{group.icon}</span>
                          <span className="ap-node-label">{group.nodeLabel}</span>
                          <span className="ap-node-type-tag">{group.nodeType}</span>
                        </div>
                        <div className="ap-node-header-right">
                          <span className="ap-count-tag">{group.variables.length} fields</span>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ap-node-items-tree">
                          {group.variables.map(item => {
                            const badge = getTypeBadge(item.type);
                            const hasChildren = item.children && item.children.length > 0;
                            const isObjExpanded = expandedObjects[item.token] ?? false;

                            return (
                              <div key={item.token} className="ap-tree-item-wrapper">
                                <div
                                  className="ap-variable-row"
                                  onClick={() => handleSelect(item)}
                                  title={`Click to insert {{${item.token}}}`}
                                >
                                  <div className="ap-var-left">
                                    <span className={`ap-type-badge ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                    <div className="ap-var-text-box">
                                      <span className="ap-var-name">
                                        {viewMode === 'friendly' ? item.label : `{{${item.token}}}`}
                                      </span>
                                      {viewMode === 'friendly' ? (
                                        <span className="ap-var-subtext">{item.token}</span>
                                      ) : item.description ? (
                                        <span className="ap-var-subtext">{item.description}</span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="ap-var-right">
                                    {item.example !== undefined && (
                                      <span className="ap-var-example" title={`Sample: ${item.example}`}>
                                        {String(item.example).length > 25
                                          ? `${String(item.example).slice(0, 25)}…`
                                          : String(item.example)}
                                      </span>
                                    )}

                                    {hasChildren && (
                                      <button
                                        className="ap-expand-obj-btn"
                                        onClick={e => {
                                          e.stopPropagation();
                                          toggleObjectExpanded(item.token);
                                        }}
                                        title={isObjExpanded ? 'Collapse nested properties' : 'Expand nested properties'}
                                      >
                                        {isObjExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                      </button>
                                    )}

                                    <button
                                      className="ap-copy-var-btn"
                                      onClick={e => handleCopy(e, item.token)}
                                      title="Copy token to clipboard"
                                    >
                                      {copiedToken === item.token ? (
                                        <Check size={12} className="text-emerald-400" />
                                      ) : (
                                        <Copy size={12} />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* Nested Child Items for JSON Objects */}
                                {hasChildren && isObjExpanded && (
                                  <div className="ap-nested-tree">
                                    {item.children!.map(child => {
                                      const childBadge = getTypeBadge(child.type);
                                      return (
                                        <div
                                          key={child.token}
                                          className="ap-variable-row nested"
                                          onClick={() => handleSelect(child)}
                                          title={`Click to insert {{${child.token}}}`}
                                        >
                                          <div className="ap-var-left">
                                            <span className={`ap-type-badge ${childBadge.className}`}>
                                              {childBadge.label}
                                            </span>
                                            <div className="ap-var-text-box">
                                              <span className="ap-var-name">
                                                {viewMode === 'friendly' ? child.label : `{{${child.token}}}`}
                                              </span>
                                              <span className="ap-var-subtext">{child.token}</span>
                                            </div>
                                          </div>

                                          <div className="ap-var-right">
                                            {child.example !== undefined && (
                                              <span className="ap-var-example" title={`Sample: ${child.example}`}>
                                                {String(child.example).slice(0, 25)}
                                              </span>
                                            )}
                                            <button
                                              className="ap-copy-var-btn"
                                              onClick={e => handleCopy(e, child.token)}
                                              title="Copy token"
                                            >
                                              {copiedToken === child.token ? (
                                                <Check size={12} className="text-emerald-400" />
                                              ) : (
                                                <Copy size={12} />
                                              )}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Builtin System Variables Tab */
            <div className="ap-builtin-list">
              <div className="ap-builtin-intro">
                <Sparkles size={14} className="text-amber-400" />
                <span>
                  Built-in system tokens and convenience variables available globally in any text field or condition.
                </span>
              </div>

              {filteredBuiltins.map(b => {
                const badge = getTypeBadge(b.type);
                return (
                  <div
                    key={b.token}
                    className="ap-variable-row"
                    onClick={() => handleSelect(b)}
                    title={`Click to insert {{${b.token}}}`}
                  >
                    <div className="ap-var-left">
                      <span className={`ap-type-badge ${badge.className}`}>
                        {badge.label}
                      </span>
                      <div className="ap-var-text-box">
                        <span className="ap-var-name">
                          {viewMode === 'friendly' ? b.label : `{{${b.token}}}`}
                        </span>
                        <span className="ap-var-subtext">{b.description}</span>
                      </div>
                    </div>

                    <div className="ap-var-right">
                      <span className="ap-var-example" title={`Example: ${b.example}`}>
                        {String(b.example).slice(0, 25)}
                      </span>
                      <button
                        className="ap-copy-var-btn"
                        onClick={e => handleCopy(e, b.token)}
                        title="Copy token"
                      >
                        {copiedToken === b.token ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="ap-data-selector-footer">
          <div className="ap-footer-hint">
            <span>Click any item to insert at cursor position. Syntax: <code>{`{{expression}}`}</code></span>
          </div>
          <div className="ap-footer-actions">
            <span className="ap-kbd-shortcut">ESC to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
