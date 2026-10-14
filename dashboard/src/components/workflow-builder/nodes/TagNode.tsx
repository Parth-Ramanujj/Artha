import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Tag } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const TagNode = memo(function TagNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const tag = data.config?.tag || 'lead';

  return (
    <div className={`wf-canvas-node wf-node-tag ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper tag-icon">
          <Tag size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge tag-badge">CONTACT TAG</span>
          <h4 className="wf-node-title">{data.label || 'Add Tag'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-tag-preview">
          🏷️ <span className="wf-tag-value">#{tag}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
