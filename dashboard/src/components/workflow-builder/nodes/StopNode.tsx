import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { StopCircle } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const StopNode = memo(function StopNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const reason = data.config?.reason || 'Workflow terminated';

  return (
    <div className={`wf-canvas-node wf-node-stop ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper danger-icon">
          <StopCircle size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge danger-badge">TERMINATE</span>
          <h4 className="wf-node-title">{data.label || 'Stop Workflow'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-stop-reason">
          {reason}
        </div>
      </div>
    </div>
  );
});
