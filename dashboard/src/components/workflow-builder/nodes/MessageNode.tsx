import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquareText } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const MessageNode = memo(function MessageNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const message = data.config?.message || 'Hello! Thanks for reaching out.';

  return (
    <div className={`wf-canvas-node wf-node-message ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper message-icon">
          <MessageSquareText size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge message-badge">SEND MESSAGE</span>
          <h4 className="wf-node-title">{data.label || 'Send Text Message'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-message-preview">
          {message.length > 100 ? `${message.substring(0, 100)}...` : message}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
