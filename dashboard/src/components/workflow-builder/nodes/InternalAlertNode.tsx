import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { BellRing, Send } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const InternalAlertNode = memo(function InternalAlertNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const recipient = data.config?.recipientPhone || data.config?.phone || '+91 Manager Phone';

  return (
    <div className={`wf-canvas-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper" style={{ background: '#fee2e2', color: '#dc2626' }}>
          <BellRing size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#fecaca', color: '#991b1b' }}>TEAM ALERT</span>
          <h4 className="wf-node-title">{data.label || 'Notify Team WhatsApp'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Send size={12} color="#dc2626" />
          <span>Alert to: <strong>{recipient}</strong></span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
