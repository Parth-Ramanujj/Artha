import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Sliders } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const SetFieldsNode = memo(function SetFieldsNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const assignments = Array.isArray(data.config?.assignments) ? data.config.assignments : [];

  return (
    <div className={`wf-canvas-node wf-node-setfields ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper action-icon">
          <Sliders size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge action-badge">SET FIELDS</span>
          <h4 className="wf-node-title">{data.label || 'Set Variables'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        {assignments.length === 0 ? (
          <div className="wf-fields-empty">No variable assignments configured</div>
        ) : (
          <div className="wf-fields-list">
            {assignments.slice(0, 3).map((a, i) => (
              <div key={i} className="wf-field-chip">
                <span className="wf-field-name">{a.name}</span>
                <span className="wf-field-eq">=</span>
                <span className="wf-field-val">{String(a.value || "''")}</span>
              </div>
            ))}
            {assignments.length > 3 && (
              <div className="wf-fields-more">+{assignments.length - 3} more...</div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
