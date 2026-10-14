import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Layers, HelpCircle } from 'lucide-react';
import type { WorkflowNodeData, ButtonItem } from '../types';

export const ButtonsNode = memo(function ButtonsNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const prompt = data.config?.message || data.config?.text || 'Please choose an option:';
  const buttons: ButtonItem[] = data.config?.buttons || [
    { id: 'opt_1', text: 'Option 1' },
    { id: 'opt_2', text: 'Option 2' },
  ];
  const mode = data.config?.mode || 'auto';

  return (
    <div className={`wf-canvas-node wf-node-buttons ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper buttons-icon">
          <Layers size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge buttons-badge">INTERACTIVE BUTTONS</span>
          <h4 className="wf-node-title">{data.label || 'Quick Menu / Poll'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-message-prompt">
          {prompt.length > 80 ? `${prompt.substring(0, 80)}...` : prompt}
        </div>

        <div className="wf-mode-indicator">
          <span>Mode: {mode === 'poll' ? 'Native Poll' : mode === 'text' ? 'Numbered Fallback' : 'Auto Smart Fallback'}</span>
        </div>

        <div className="wf-buttons-branch-list">
          {buttons.map((btn, idx) => (
            <div key={btn.id || idx} className="wf-button-branch-item">
              <span className="wf-btn-num">{idx + 1}</span>
              <span className="wf-btn-text" title={btn.text}>{btn.text}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={btn.id}
                className="wf-handle wf-handle-btn"
                title={`Connect to action for: ${btn.text}`}
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
      </div>
    </div>
  );
});
