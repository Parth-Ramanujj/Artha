/**
 * Pure helpers for reading and inserting connections. They never change what a flow does: an
 * inserted step takes the old edge's place, the branch label stays on the first half, and the
 * second half keeps the original target and target handle.
 */

export interface GraphNode {
  id: string;
  type?: string;
  data?: { label?: string; config?: Record<string, unknown> } | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

const GENERIC = new Set(['', 'out', 'default', 'in', 'fallback']);

function nodeLabel(node: GraphNode | undefined): string {
  return node?.data?.label || node?.type || node?.id || 'Step';
}

/** The text a customer chose for a branch: a button's label, a list row, or the handle name. */
export function branchLabel(edge: GraphEdge, nodes: GraphNode[]): string | null {
  const handle = edge.sourceHandle ?? '';
  if (GENERIC.has(handle)) return null;
  const src = nodes.find(n => n.id === edge.source);
  const cfg = (src?.data?.config ?? {}) as Record<string, unknown>;
  const buttons = Array.isArray(cfg.buttons) ? (cfg.buttons as Array<{ id?: string; text?: string }>) : [];
  const text = buttons.find(b => b.id === handle)?.text;
  if (text) return text;
  return handle.replace(/_/g, ' ');
}

export interface ConnectionSummary {
  /** Steps that lead into this one: `from` is the step name, `via` the branch label if any. */
  incoming: Array<{ nodeId: string; name: string; via: string | null }>;
  /** Steps this one leads to. */
  outgoing: Array<{ nodeId: string; name: string; via: string | null }>;
}

/** Plain-language list of what a step is connected to, for the inspector. */
export function describeConnections(nodeId: string, nodes: GraphNode[], edges: GraphEdge[]): ConnectionSummary {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const incoming = edges
    .filter(e => e.target === nodeId)
    .map(e => ({ nodeId: e.source, name: nodeLabel(byId.get(e.source)), via: branchLabel(e, nodes) }));
  const outgoing = edges
    .filter(e => e.source === nodeId)
    .map(e => ({ nodeId: e.target, name: nodeLabel(byId.get(e.target)), via: branchLabel(e, nodes) }));
  return { incoming, outgoing };
}

export interface InsertResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Places `newNode` on the edge `edgeId`: source → newNode → target. The branch label (sourceHandle)
 * stays on the first half, the original target handle stays on the second. Returns null when the
 * edge does not exist, so the caller leaves the flow untouched.
 */
export function insertNodeOnEdge(
  nodes: GraphNode[],
  edges: GraphEdge[],
  edgeId: string,
  newNode: GraphNode,
): InsertResult | null {
  const edge = edges.find(e => e.id === edgeId);
  if (!edge) return null;
  if (nodes.some(n => n.id === newNode.id)) return null;

  const first: GraphEdge = {
    id: `${edge.id}-in-${newNode.id}`,
    source: edge.source,
    target: newNode.id,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: null,
  };
  const second: GraphEdge = {
    id: `${newNode.id}-out-${edge.id}`,
    source: newNode.id,
    target: edge.target,
    sourceHandle: null,
    targetHandle: edge.targetHandle ?? null,
  };
  return {
    nodes: [...nodes, newNode],
    edges: [...edges.filter(e => e.id !== edgeId), first, second],
  };
}

/** Node ids reachable only through a given edge set: used to highlight a selected step's links. */
export function edgesTouching(nodeId: string | null, edges: GraphEdge[]): Set<string> {
  const ids = new Set<string>();
  if (!nodeId) return ids;
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) ids.add(e.id);
  }
  return ids;
}
