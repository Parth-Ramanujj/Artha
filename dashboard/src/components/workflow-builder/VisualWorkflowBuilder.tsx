import { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  ArrowLeft,
  Save,
  Play,
  FlaskConical,
  Sparkles,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { workflowApi, type WorkflowDefinition, type WorkflowRun } from '../../services/api';
import { nodeTypes } from './nodes';
import { NodePalette } from './NodePalette';
import { NodeInspector } from './NodeInspector';
import { WORKFLOW_PRESETS, type WorkflowPreset } from './WorkflowPresets';
import type { CanvasNodeType, WorkflowNodeData } from './types';
import { useToast } from '../Toast';
import { Modal } from '../Modal';
import './VisualWorkflowBuilder.css';

interface VisualWorkflowBuilderProps {
  workflow?: WorkflowDefinition | null;
  onClose: () => void;
  onSaved: (saved: WorkflowDefinition) => void;
  sessions?: Array<{ id: string; alias?: string; status: string }>;
}

const DEFAULT_INITIAL_NODES: Node[] = [
  {
    id: 'node-trigger',
    type: 'trigger',
    position: { x: 280, y: 80 },
    data: {
      label: 'Incoming Message',
      config: {
        triggerType: 'message_received',
        keyword: '',
        workingHoursOnly: false,
      },
    },
  },
  {
    id: 'node-msg-1',
    type: 'send_message',
    position: { x: 280, y: 280 },
    data: {
      label: 'Welcome Greeting',
      config: {
        message: 'Hello! Thank you for reaching out to us. How can we help you today?',
      },
    },
  },
];

const DEFAULT_INITIAL_EDGES: Edge[] = [
  {
    id: 'e-trigger-to-msg-1',
    source: 'node-trigger',
    target: 'node-msg-1',
    sourceHandle: 'out',
    targetHandle: 'in',
    animated: true,
    style: { stroke: '#25d366', strokeWidth: 2 },
  },
];

function BuilderInnerCanvas({
  workflow,
  onClose,
  onSaved,
  sessions = [],
}: VisualWorkflowBuilderProps) {
  const toast = useToast();
  const reactFlowInstance = useReactFlow();

  const [name, setName] = useState<string>(workflow?.name || 'New WhatsApp Flow');
  const [description, setDescription] = useState<string>(workflow?.description || '');
  const [status, setStatus] = useState<string>(workflow?.status || 'draft');
  const [saving, setSaving] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  // Inspector active selection
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: string;
    data: WorkflowNodeData;
  } | null>(null);

  // Test simulation modal state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testSessionId, setTestSessionId] = useState(sessions[0]?.id || '');
  const [testChatId, setTestChatId] = useState('919876543210');
  const [testMessageBody, setTestMessageBody] = useState('Hello');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WorkflowRun | null>(null);

  // Extract initial nodes and edges from definition if available
  const initialNodes: Node[] = (() => {
    const defNodes = (workflow?.definition as any)?.nodes;
    if (Array.isArray(defNodes) && defNodes.length > 0) {
      return defNodes.map(n => ({
        ...n,
        position: n.position || { x: 250, y: 100 },
      }));
    }
    return DEFAULT_INITIAL_NODES;
  })();

  const initialEdges: Edge[] = (() => {
    const defEdges = (workflow?.definition as any)?.edges;
    if (Array.isArray(defEdges) && defEdges.length > 0) {
      return defEdges.map(e => ({
        ...e,
        animated: true,
        style: {
          stroke: e.sourceHandle === 'false' ? '#ef4444' : e.sourceHandle === 'fallback' ? '#f59e0b' : '#25d366',
          strokeWidth: 2,
        },
      }));
    }
    return DEFAULT_INITIAL_EDGES;
  })();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle new edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      const strokeColor =
        params.sourceHandle === 'false'
          ? '#ef4444'
          : params.sourceHandle === 'fallback'
          ? '#f59e0b'
          : '#25d366';

      setEdges(eds =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: strokeColor, strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  // Node selection for inspector
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode({
      id: node.id,
      type: node.type || 'send_message',
      data: node.data as WorkflowNodeData,
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Compute upstream ancestor nodes for selectedNode (DAG reverse search)
  const upstreamNodes = useMemo(() => {
    if (!selectedNode) return [];
    const visited = new Set<string>();
    const queue = [selectedNode.id];
    const result: Node[] = [];

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const incomingEdges = edges.filter(e => e.target === currId);
      for (const edge of incomingEdges) {
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          const sourceNode = nodes.find(n => n.id === edge.source);
          if (sourceNode) {
            result.push(sourceNode);
            queue.push(sourceNode.id);
          }
        }
      }
    }
    return result;
  }, [selectedNode, nodes, edges]);

  // Update node config from inspector
  const handleUpdateNode = useCallback(
    (nodeId: string, updatedData: Partial<WorkflowNodeData>) => {
      setNodes(nds =>
        nds.map(n => {
          if (n.id === nodeId) {
            const nextData = {
              ...(n.data as WorkflowNodeData),
              ...updatedData,
            };
            // also sync selected node
            setSelectedNode(prev => (prev && prev.id === nodeId ? { ...prev, data: nextData } : prev));
            return { ...n, data: nextData };
          }
          return n;
        }),
      );
    },
    [setNodes],
  );

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
      toast.success('Node deleted', 'The node was removed from the flow');
    },
    [setNodes, setEdges, toast],
  );

  // Add node via click
  const handleAddNode = useCallback(
    (type: CanvasNodeType, defaultConfig: Record<string, any>, title: string) => {
      const id = `node-${type}-${Date.now()}`;
      const centerPos = reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2 - 100,
        y: window.innerHeight / 2 - 100,
      });

      const newNode: Node = {
        id,
        type,
        position: centerPos,
        data: {
          label: title,
          type,
          config: defaultConfig,
        },
      };

      setNodes(nds => [...nds, newNode]);
      setSelectedNode({
        id,
        type,
        data: newNode.data as WorkflowNodeData,
      });
    },
    [reactFlowInstance, setNodes],
  );

  // Drag and Drop from NodePalette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow/type') as CanvasNodeType;
      const title = event.dataTransfer.getData('application/reactflow/title');
      const configRaw = event.dataTransfer.getData('application/reactflow/config');

      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let config = {};
      try {
        config = JSON.parse(configRaw);
      } catch {
        config = {};
      }

      const id = `node-${type}-${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position,
        data: {
          label: title || type,
          type,
          config,
        },
      };

      setNodes(nds => [...nds, newNode]);
      setSelectedNode({
        id,
        type,
        data: newNode.data as WorkflowNodeData,
      });
    },
    [reactFlowInstance, setNodes],
  );

  // Load preset template
  const handleLoadPreset = (preset: WorkflowPreset) => {
    if (
      nodes.length > 2 &&
      !window.confirm(`Load "${preset.name}" preset? This will replace the current flow.`)
    ) {
      return;
    }

    setName(preset.name);
    setDescription(preset.description);
    setNodes(
      preset.nodes.map(n => ({
        ...n,
        data: { ...n.data, type: n.type },
      })),
    );
    setEdges(
      preset.edges.map(e => ({
        ...e,
        animated: true,
        style: {
          stroke: e.sourceHandle === 'false' ? '#ef4444' : e.sourceHandle === 'fallback' ? '#f59e0b' : '#25d366',
          strokeWidth: 2,
        },
      })),
    );
    setPresetsOpen(false);
    toast.success('Preset Loaded', `Applied "${preset.name}" template`);
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2 });
    }, 150);
  };

  // Build payload for backend
  const constructDefinitionPayload = () => {
    // Determine trigger from trigger node if exists
    const triggerNode = nodes.find(n => n.type === 'trigger');
    const triggerConfig: Record<string, any> = (triggerNode?.data?.config as Record<string, any>) || {};
    const triggerType = triggerConfig.triggerType || 'message_received';

    // Format clean nodes and edges
    const graphNodes = nodes.map(n => ({
      id: n.id,
      type: n.type,
      data: n.data,
      position: n.position,
    }));

    const graphEdges = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
      label: typeof e.label === 'string' ? e.label : undefined,
    }));

    return {
      trigger: {
        type: triggerType,
        config: {
          keyword: triggerConfig.keyword || '',
        },
      },
      conditions: triggerConfig.workingHoursOnly
        ? [
            {
              type: 'working_hours',
              config: { timezone: 'UTC', start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
            },
          ]
        : [],
      nodes: graphNodes,
      edges: graphEdges,
    };
  };

  // Save flow
  const handleSave = async (publishImmediate = false) => {
    if (!name.trim()) {
      toast.error('Workflow Name Required', 'Please enter a name for this workflow');
      return;
    }

    setSaving(true);
    try {
      const definition = constructDefinitionPayload();
      const payload: Partial<WorkflowDefinition> = {
        name: name.trim(),
        description: description.trim() || null,
        definition,
      };

      let saved: WorkflowDefinition;
      if (workflow?.id) {
        saved = await workflowApi.update(workflow.id, payload);
      } else {
        saved = await workflowApi.create(payload);
      }

      if (publishImmediate) {
        if (saved.status !== 'published') {
          saved = await workflowApi.publish(saved.id);
        }
        setStatus('published');
        toast.success('Published Successfully', `Workflow "${saved.name}" is now live on WhatsApp!`);
      } else {
        toast.success('Saved Successfully', `Workflow "${saved.name}" saved as draft.`);
      }

      onSaved(saved);
    } catch (err: any) {
      toast.error('Save Failed', err?.message || 'Could not save workflow');
    } finally {
      setSaving(false);
    }
  };

  // Run test simulation
  const handleRunSimulation = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // First auto-save if newly created or modified
      const definition = constructDefinitionPayload();
      let targetId = workflow?.id;
      if (!targetId) {
        const created = await workflowApi.create({
          name: name.trim() || 'Simulated Test Flow',
          description: description.trim() || null,
          definition,
        });
        targetId = created.id;
        onSaved(created);
      } else {
        await workflowApi.update(targetId, { definition });
      }

      const result = await workflowApi.test(targetId, {
        sessionId: testSessionId || undefined,
        chatId: testChatId || '919876543210',
        messageBody: testMessageBody,
      });

      setTestResult(result);
      if (result.status === 'completed' || result.status === 'paused') {
        toast.success(
          'Simulation Finished',
          result.status === 'paused'
            ? 'Execution paused: Waiting for customer reply (buttons / question slot).'
            : 'Workflow completed successfully.',
        );
      } else {
        toast.error('Simulation Failed', result.failureReason || 'Run failed');
      }
    } catch (err: any) {
      toast.error('Simulation Error', err?.message || 'Failed to execute test run');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="wf-builder-wrapper">
      {/* TOP TOOLBAR */}
      <div className="wf-builder-toolbar">
        <div className="wf-toolbar-left">
          <button className="wf-toolbar-btn-back" onClick={onClose} title="Back to Workflows">
            <ArrowLeft size={16} /> Back
          </button>

          <div className="wf-toolbar-title-box">
            <input
              type="text"
              className="wf-toolbar-title-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Flow Name..."
            />
            <span className={`wf-toolbar-status-badge ${status}`}>
              {status}
            </span>
          </div>
        </div>

        <div className="wf-toolbar-right">
          {/* Templates Preset Dropdown */}
          <div className="wf-presets-dropdown">
            <button
              className="wf-btn-tool secondary"
              onClick={() => setPresetsOpen(prev => !prev)}
            >
              <Sparkles size={15} /> Templates <ChevronDown size={14} />
            </button>
            {presetsOpen && (
              <div className="wf-presets-menu">
                {WORKFLOW_PRESETS.map(preset => (
                  <div
                    key={preset.id}
                    className="wf-preset-item"
                    onClick={() => handleLoadPreset(preset)}
                  >
                    <span className="wf-preset-item-title">{preset.name}</span>
                    <span className="wf-preset-item-desc">{preset.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Simulation */}
          <button
            className="wf-btn-tool secondary"
            onClick={() => setShowTestModal(true)}
            title="Test run with simulated incoming message"
          >
            <FlaskConical size={15} /> Test Flow
          </button>

          {/* Save Draft */}
          <button
            className="wf-btn-tool secondary"
            onClick={() => void handleSave(false)}
            disabled={saving}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save Draft
          </button>

          {/* Save & Publish */}
          <button
            className="wf-btn-tool primary"
            onClick={() => void handleSave(true)}
            disabled={saving}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Publish Flow
          </button>
        </div>
      </div>

      {/* MAIN BUILDER BODY */}
      <div className="wf-builder-body">
        {/* LEFT PALETTE */}
        <NodePalette onAddNode={handleAddNode} />

        {/* CENTER REACT FLOW CANVAS */}
        <div className="wf-canvas-area" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background gap={16} size={1} color="#64748b" />
            <Controls />
            <MiniMap
              nodeColor={n => {
                switch (n.type) {
                  case 'trigger': return '#c084fc';
                  case 'send_message': return '#25d366';
                  case 'interactive_buttons': return '#60a5fa';
                  case 'ask_question': return '#fbbf24';
                  case 'condition_branch': return '#f472b6';
                  case 'wait': return '#fb923c';
                  case 'ai_assistant': return '#2dd4bf';
                  case 'handoff_to_human': return '#f87171';
                  default: return '#94a3b8';
                }
              }}
            />
          </ReactFlow>
        </div>

        {/* RIGHT INSPECTOR */}
        {selectedNode && (
          <NodeInspector
            selectedNode={selectedNode}
            upstreamNodes={upstreamNodes}
            allNodes={nodes}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* TEST SIMULATION MODAL */}
      <Modal
        open={showTestModal}
        onClose={() => setShowTestModal(false)}
        title="Simulate WhatsApp Flow Execution"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowTestModal(false)}>
              Close
            </button>
            <button className="btn-primary" onClick={handleRunSimulation} disabled={testing}>
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run Simulation
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">WhatsApp Session</label>
            <select
              className="form-select"
              value={testSessionId}
              onChange={e => setTestSessionId(e.target.value)}
            >
              {sessions.length === 0 ? (
                <option value="">No Active Sessions (Mock Run)</option>
              ) : (
                sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.alias || s.id} ({s.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="form-label">Customer WhatsApp Number / Chat ID</label>
            <input
              type="text"
              className="form-input"
              value={testChatId}
              onChange={e => setTestChatId(e.target.value)}
              placeholder="e.g. 919876543210"
            />
          </div>

          <div>
            <label className="form-label">Simulated Incoming Message</label>
            <input
              type="text"
              className="form-input"
              value={testMessageBody}
              onChange={e => setTestMessageBody(e.target.value)}
              placeholder="e.g. hi, price, or option number 1"
            />
            <span className="field-hint" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              This simulates the user typing this message to trigger or resume the workflow.
            </span>
          </div>

          {/* Test Results Output */}
          {testResult && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'var(--bg-light)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Simulation Result:</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background:
                      testResult.status === 'completed'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : testResult.status === 'paused'
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                    color:
                      testResult.status === 'completed'
                        ? '#22c55e'
                        : testResult.status === 'paused'
                        ? '#3b82f6'
                        : '#ef4444',
                  }}
                >
                  {testResult.status.toUpperCase()}
                </span>
              </div>

              {testResult.failureReason && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  {testResult.failureReason}
                </div>
              )}

              {Boolean(testResult.triggerData?.['waitingForInput']) && (
                <div style={{ color: '#3b82f6', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  ⏳ Flow paused: Waiting for reply on slot/choice: <strong>{String(testResult.triggerData?.['expectedInputType'])}</strong>
                </div>
              )}

              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                <strong>Executed Steps: {testResult.steps?.length || 0}</strong>
                <pre
                  style={{
                    maxHeight: '150px',
                    overflowY: 'auto',
                    background: 'var(--bg-card)',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    marginTop: '0.3rem',
                  }}
                >
                  {JSON.stringify(testResult.steps, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export function VisualWorkflowBuilder(props: VisualWorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <BuilderInnerCanvas {...props} />
    </ReactFlowProvider>
  );
}
