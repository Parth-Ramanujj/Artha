import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock, Sun, Moon } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const WorkingHoursNode = memo(function WorkingHoursNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const openTime = data.config?.openTime || '09:00';
  const closeTime = data.config?.closeTime || '20:00';
  const tz = data.config?.timezone || 'Asia/Kolkata';

  return (
    <div className={`wf-canvas-node wf-node-branch ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper branch-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
          <Clock size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#fde68a', color: '#92400e' }}>SCHEDULE GATEWAY</span>
          <h4 className="wf-node-title">{data.label || 'Working Hours'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-condition-formula" style={{ fontSize: '11px', color: '#4b5563', marginBottom: '8px' }}>
          <span>⏰ {openTime} - {closeTime} ({tz})</span>
        </div>

        <div className="wf-branch-outputs">
          <div className="wf-branch-port true-branch" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#059669' }}>
            <Sun size={13} />
            <span>OPEN</span>
            <Handle
              type="source"
              position={Position.Right}
              id="open"
              className="wf-handle wf-handle-true"
              title="Within business hours (OPEN branch)"
            />
          </div>

          <div className="wf-branch-port false-branch" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#dc2626' }}>
            <Moon size={13} />
            <span>CLOSED</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="closed"
              className="wf-handle wf-handle-false"
              title="After hours / Holiday (CLOSED branch)"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
