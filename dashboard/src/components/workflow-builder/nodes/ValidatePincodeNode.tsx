import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MapPin, CheckCircle2 } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const ValidatePincodeNode = memo(function ValidatePincodeNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const pincode = data.config?.pincode || '{{pincode}}';

  return (
    <div className={`wf-canvas-node wf-node-validate-pincode ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308' }}>
          <MapPin size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: 'rgba(234, 179, 8, 0.25)', color: '#fde047' }}>
            PINCODE VALIDATE
          </span>
          <h4 className="wf-node-title">{data.label || 'Validate Indian PIN Code'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-media-details">
          <div className="text-xs text-slate-300">
            Input: <span className="font-mono text-cyan-300">{pincode}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-700/60 text-[11px] text-amber-300">
            <CheckCircle2 size={12} className="text-amber-400" />
            <span>Regex: ^[1-9][0-9]&#123;5&#125;$ (6 digits)</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
