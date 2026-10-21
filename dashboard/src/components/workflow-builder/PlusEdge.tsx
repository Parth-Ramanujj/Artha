import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';

export interface PlusEdgeData extends Record<string, unknown> {
  /** The customer-facing branch name, e.g. "Insurance". */
  label?: string | null;
  /** Set while another edge is selected, so unrelated links recede. */
  dimmed?: boolean;
  /** Opens the insert picker for this edge. */
  onInsert?: (edgeId: string) => void;
}

/**
 * A connection with its branch label and a "+" button at its middle. The button inserts a new step on
 * this connection, so the user never has to drag a new node and wire it by hand.
 */
function PlusEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const d = (data ?? {}) as PlusEdgeData;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, opacity: d.dimmed ? 0.25 : 1 }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: d.dimmed ? 0.35 : 1,
          }}
          className="wf-edge-controls nodrag nopan"
        >
          {d.label && <span className="wf-edge-label">{d.label}</span>}
          <button
            type="button"
            className="wf-edge-plus"
            aria-label={`Add a step on this connection${d.label ? ` (${d.label})` : ''}`}
            title="Add a step here"
            onClick={e => {
              e.stopPropagation();
              d.onInsert?.(id);
            }}
          >
            <Plus size={12} aria-hidden="true" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const PlusEdge = memo(PlusEdgeInner);

/** Registered once, at module level, so React Flow keeps the same edge component between renders. */
export const edgeTypes = { plus: PlusEdge };
