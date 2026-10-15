import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { CreditCard, IndianRupee } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const PaymentLinkNode = memo(function PaymentLinkNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const provider = data.config?.provider || 'UPI';
  const amount = data.config?.amount || data.config?.amountInRupees || '299';
  const desc = data.config?.description || 'Consultation Fee';

  return (
    <div className={`wf-canvas-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper" style={{ background: '#fdf4ff', color: '#c026d3' }}>
          <CreditCard size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#f5d0fe', color: '#86198f' }}>PAYMENT INTENT</span>
          <h4 className="wf-node-title">{data.label || 'Generate Payment Link'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px', background: 'rgba(192, 38, 211, 0.05)', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#701a75' }}>
            <div style={{ fontWeight: 600 }}>{provider}: {desc}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontWeight: 700, color: '#c026d3', fontSize: '13px' }}>
            <IndianRupee size={12} /><span>{amount}</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
