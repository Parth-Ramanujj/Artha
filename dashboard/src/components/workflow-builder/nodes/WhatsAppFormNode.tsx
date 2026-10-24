import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

/** Sends a published WhatsApp Form; when it waits, the flow continues once the customer submits. */
export const WhatsAppFormNode = memo(function WhatsAppFormNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const name: string = data.config?.formName || 'No form selected';
  const waits = data.config?.waitForSubmit !== false;

  return (
    <div className={`wf-canvas-node wf-node-message ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper message-icon">
          <FileText size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge message-badge">WHATSAPP FORM</span>
          <h4 className="wf-node-title">{data.label || 'WhatsApp Form'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-message-preview">{name}</div>
        <div className="wf-message-preview">{waits ? 'Continues after the customer submits' : 'Continues right away'}</div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="wf-handle wf-handle-bottom"
        title={waits ? 'Runs after the form is submitted' : undefined}
      />
    </div>
  );
});
