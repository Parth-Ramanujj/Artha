import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { UserCheck, ShieldAlert } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const HandoffNode = memo(function HandoffNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const assignedName = data.config?.assignedName || 'Available Support Agent';

  return (
    <div className={`wf-canvas-node wf-node-handoff ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper handoff-icon">
          <UserCheck size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge handoff-badge">HUMAN HANDOFF</span>
          <h4 className="wf-node-title">{data.label || 'Transfer to Human'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-handoff-desc">
          <ShieldAlert size={14} className="text-warning" />
          <span>Pauses automation and alerts agent in Live Inbox</span>
        </div>
        <div className="wf-assigned-box">
          Assigned: <strong>{assignedName}</strong>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
