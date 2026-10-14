import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const DelayNode = memo(function DelayNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const seconds = Number(data.config?.seconds || 5);
  const displayTime =
    seconds >= 3600
      ? `${(seconds / 3600).toFixed(1)} hr`
      : seconds >= 60
      ? `${Math.round(seconds / 60)} min`
      : `${seconds} sec`;

  return (
    <div className={`wf-canvas-node wf-node-delay ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper delay-icon">
          <Clock size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge delay-badge">DELAY / TIMER</span>
          <h4 className="wf-node-title">{data.label || 'Wait Duration'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-delay-display">
          <span>⏳ Wait for {displayTime}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
