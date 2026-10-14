import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split, Check, X } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const BranchNode = memo(function BranchNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const field = data.config?.field || 'tag';
  const operator = data.config?.operator || 'contains';
  const value = data.config?.value || '';

  return (
    <div className={`wf-canvas-node wf-node-branch ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper branch-icon">
          <Split size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge branch-badge">CONDITION</span>
          <h4 className="wf-node-title">{data.label || 'If / Else Branch'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-condition-formula">
          <span className="wf-field-name">{field}</span>
          <span className="wf-operator">{operator}</span>
          <span className="wf-target-val">"{value || '*'}"</span>
        </div>

        <div className="wf-branch-outputs">
          <div className="wf-branch-port true-branch">
            <Check size={13} className="text-success" />
            <span>TRUE</span>
            <Handle
              type="source"
              position={Position.Right}
              id="true"
              className="wf-handle wf-handle-true"
              title="Condition matches (TRUE branch)"
            />
          </div>

          <div className="wf-branch-port false-branch">
            <X size={13} className="text-danger" />
            <span>FALSE</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="false"
              className="wf-handle wf-handle-false"
              title="Condition does not match (FALSE branch)"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
