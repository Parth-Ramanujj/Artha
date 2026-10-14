import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, MessageSquare, Key } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const TriggerNode = memo(function TriggerNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const triggerType = data.config?.triggerType || 'message_received';
  const keyword = data.config?.keyword || '';
  const workingHoursOnly = data.config?.workingHoursOnly || false;

  return (
    <div className={`wf-canvas-node wf-node-trigger ${selected ? 'is-selected' : ''}`}>
      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper trigger-icon">
          <Zap size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge">TRIGGER</span>
          <h4 className="wf-node-title">{data.label || 'Workflow Trigger'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        {triggerType === 'keyword_match' ? (
          <div className="wf-trigger-meta">
            <div className="wf-meta-row">
              <Key size={13} className="text-accent" />
              <span className="wf-meta-label">Keywords:</span>
            </div>
            <div className="wf-tags-list">
              {keyword ? (
                keyword.split(',').map((k: string, idx: number) => (
                  <span key={idx} className="wf-tag-pill">
                    {k.trim()}
                  </span>
                ))
              ) : (
                <span className="wf-text-muted">None specified</span>
              )}
            </div>
          </div>
        ) : (
          <div className="wf-trigger-meta">
            <div className="wf-meta-row">
              <MessageSquare size={13} className="text-accent" />
              <span>Any Incoming WhatsApp Message</span>
            </div>
          </div>
        )}

        {workingHoursOnly && (
          <div className="wf-badge-sub">
            ⏰ Working hours only (9AM - 6PM)
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="wf-handle wf-handle-bottom"
      />
    </div>
  );
});
