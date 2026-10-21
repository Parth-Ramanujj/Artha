/**
 * Tidy-up layout for the flow canvas: steps are placed in layers from the trigger downward, so a
 * customer's path reads top to bottom and nodes never overlap. Pure, so it can be tested and never
 * touches what the flow does; only node positions change.
 */

export interface LayoutNode {
  id: string;
  /** Real rendered size when known (React Flow measures it); otherwise the defaults are used. */
  width?: number;
  height?: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutOptions {
  columnGap?: number;
  rowGap?: number;
  nodeWidth?: number;
  nodeHeight?: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Returns a position per node id. A node's layer is the longest path from a start node (so a join
 * sits below all its inputs). Nodes in one layer are spread side by side, centred under the start.
 * Each row starts below the tallest node in the row above, so tall menus never sit on top of the
 * steps beneath them. Nodes that cannot be reached start their own layer at the top.
 */
export function layoutNodes(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): Record<string, Point> {
  const columnGap = options.columnGap ?? 80;
  const rowGap = options.rowGap ?? 140;
  const defaultWidth = options.nodeWidth ?? 280;
  const defaultHeight = options.nodeHeight ?? 150;

  const ids = nodes.map(n => n.id);
  const known = new Set(ids);
  const sizeOf = new Map(nodes.map(n => [n.id, { w: n.width ?? defaultWidth, h: n.height ?? defaultHeight }]));
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const id of ids) {
    outgoing.set(id, []);
    incomingCount.set(id, 0);
  }
  for (const e of edges) {
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) continue;
    outgoing.get(e.source)!.push(e.target);
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
  }

  // Start points: nodes with nothing feeding them, in the order they were given (trigger first).
  const starts = ids.filter(id => (incomingCount.get(id) ?? 0) === 0);
  const layer = new Map<string, number>();

  // Longest-path layering with a visited guard, so a cycle can't loop forever.
  const visit = (id: string, depth: number, path: Set<string>) => {
    if (path.has(id)) return;
    if ((layer.get(id) ?? -1) >= depth) return;
    layer.set(id, depth);
    const nextPath = new Set(path).add(id);
    for (const t of outgoing.get(id) ?? []) visit(t, depth + 1, nextPath);
  };
  for (const s of starts) visit(s, 0, new Set());
  // Anything left (only reachable through a cycle) goes on the top row of its own.
  for (const id of ids) {
    if (!layer.has(id)) visit(id, 0, new Set());
  }

  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const l = layer.get(id) ?? 0;
    byLayer.set(l, [...(byLayer.get(l) ?? []), id]);
  }

  const positions: Record<string, Point> = {};
  let rowTop = 0;
  for (const [, row] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    const width = row.reduce((sum, id) => sum + sizeOf.get(id)!.w, 0) + columnGap * (row.length - 1);
    let x = -width / 2;
    let tallest = 0;
    for (const id of row) {
      const { w, h } = sizeOf.get(id)!;
      positions[id] = { x, y: rowTop };
      x += w + columnGap;
      tallest = Math.max(tallest, h);
    }
    rowTop += tallest + rowGap;
  }
  return positions;
}
