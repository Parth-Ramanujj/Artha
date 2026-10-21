import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Palette, HelpCircle } from 'lucide-react';
import type { WorkflowNodeData, ButtonItem } from '../types';

/**
 * Sends a published Message Studio message. When the message has reply buttons or a list (and the
 * step waits for the reply), each choice gets its own branch, like Interactive Buttons.
 */
export const StudioMessageNode = memo(function StudioMessageNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const name: string = data.config?.studioMessageName || 'No message selected';
  const choices: ButtonItem[] = Array.isArray(data.config?.choices) ? data.config.choices : [];
  const branches = data.config?.waitForReply !== false && choices.length > 0;

  return (
    <div className={`wf-canvas-node wf-node-message ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper message-icon">
          <Palette size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge message-badge">STUDIO MESSAGE</span>
          <h4 className="wf-node-title">{data.label || 'Studio Message'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-message-preview">{name}</div>

        {branches && (
          <>
            <div className="wf-buttons-branch-list">
              {choices.map((choice, idx) => (
                <div key={choice.id} className="wf-button-branch-item">
                  <span className="wf-btn-num">{idx + 1}</span>
                  <span className="wf-btn-text" title={choice.text}>
                    {choice.text}
                  </span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={choice.id}
                    className="wf-handle wf-handle-btn"
                    title={`Connect to action for: ${choice.text}`}
                  />
                </div>
              ))}
            </div>
            <div className="wf-fallback-branch-item">
              <HelpCircle size={12} />
              <span>Fallback / Other reply</span>
              <Handle
                type="source"
                position={Position.Bottom}
                id="fallback"
                className="wf-handle wf-handle-fallback"
                title="Connect for other replies or timeout"
              />
            </div>
          </>
        )}
      </div>

      {!branches && <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />}
    </div>
  );
});
