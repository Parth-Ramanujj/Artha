import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitFork } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const ABTestNode = memo(function ABTestNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const splitRatio = data.config?.splitRatio ?? 50;

  return (
    <div className={`wf-canvas-node wf-node-branch ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper branch-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
          <GitFork size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#ddd6fe', color: '#5b21b6' }}>A/B SPLIT</span>
          <h4 className="wf-node-title">{data.label || 'A/B Test Split'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
          <span>Split: {splitRatio}% A / {100 - splitRatio}% B</span>
        </div>

        <div className="wf-branch-outputs">
          <div className="wf-branch-port true-branch" style={{ fontSize: '11px', color: '#7c3aed' }}>
            <span>Variant A ({splitRatio}%)</span>
            <Handle
              type="source"
              position={Position.Right}
              id="variant_a"
              className="wf-handle wf-handle-true"
              title="Variant A Branch"
            />
          </div>

          <div className="wf-branch-port false-branch" style={{ fontSize: '11px', color: '#6366f1' }}>
            <span>Variant B ({100 - splitRatio}%)</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="variant_b"
              className="wf-handle wf-handle-false"
              title="Variant B Branch"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
