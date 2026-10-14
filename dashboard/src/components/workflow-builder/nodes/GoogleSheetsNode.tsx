import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Table } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const GoogleSheetsNode = memo(function GoogleSheetsNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const url = data.config?.webhookUrl || data.config?.url || '';
  const columns = data.config?.columns ? Object.keys(data.config.columns) : ['Phone', 'Message', 'Timestamp'];

  return (
    <div className={`wf-canvas-node wf-node-sheets ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper sheets-icon">
          <Table size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge sheets-badge">GOOGLE SHEETS</span>
          <h4 className="wf-node-title">{data.label || 'Append Sheet Row'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-sheets-info">
          <div className="wf-sheets-row">
            <span className="wf-label">Columns:</span>
            <span className="wf-val">{columns.join(', ')}</span>
          </div>
          <div className="wf-sheets-row">
            <span className="wf-label">Target:</span>
            <span className="wf-val-url">{url ? 'Configured Webhook' : 'Simulated / Not Set'}</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
