import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { HelpCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const QuestionNode = memo(function QuestionNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const prompt = data.config?.prompt || data.config?.message || 'Please provide your email:';
  const slot = data.config?.slot || 'response';
  const validation = data.config?.validation || 'any';
  const maxRetries = data.config?.maxRetries ?? 3;

  return (
    <div className={`wf-canvas-node wf-node-question ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper question-icon">
          <HelpCircle size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge question-badge">ASK QUESTION</span>
          <h4 className="wf-node-title">{data.label || 'Capture Data Slot'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-message-prompt">
          {prompt.length > 70 ? `${prompt.substring(0, 70)}...` : prompt}
        </div>

        <div className="wf-slot-details">
          <div className="wf-slot-row">
            <span className="wf-slot-label">Save To:</span>
            <span className="wf-slot-variable">{`{{vars.${slot}}}`}</span>
          </div>
          <div className="wf-slot-row">
            <span className="wf-slot-label">Validate:</span>
            <span className="wf-slot-type-badge">{validation.toUpperCase()}</span>
          </div>
        </div>

        <div className="wf-ports-dual-list">
          <div className="wf-port-item wf-port-success">
            <CheckCircle2 size={13} className="text-success" />
            <span>Valid Input</span>
            <Handle
              type="source"
              position={Position.Right}
              id="default"
              className="wf-handle wf-handle-success"
              title="Next step when response is valid"
            />
          </div>

          <div className="wf-port-item wf-port-fallback">
            <AlertTriangle size={13} className="text-warning" />
            <span>Invalid ({maxRetries}x fail)</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="fallback"
              className="wf-handle wf-handle-fallback"
              title="Fallback step if user exceeds max attempts"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
