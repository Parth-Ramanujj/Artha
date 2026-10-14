import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Filter } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const FilterNode = memo(function FilterNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const field = data.config?.field || 'trigger.message';
  const operator = data.config?.operator || 'contains';
  const value = data.config?.value || '';

  return (
    <div className={`wf-canvas-node wf-node-filter ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper branch-icon">
          <Filter size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge branch-badge">FILTER</span>
          <h4 className="wf-node-title">{data.label || 'Filter Message'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-condition-formula">
          <span className="wf-field-name">{field}</span>
          <span className="wf-operator">{operator}</span>
          <span className="wf-target-val">"{value || '*'}"</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
