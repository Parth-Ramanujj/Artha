import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Calculator, TrendingUp } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const FinancialCalcNode = memo(function FinancialCalcNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const mode = (data.config?.mode || 'SIP').toUpperCase();
  const amt = data.config?.monthlyInvestment || data.config?.amount || '5000';
  const years = data.config?.durationYears || data.config?.years || '15';
  const rate = data.config?.expectedReturnRate || data.config?.rate || '13.5';

  return (
    <div className={`wf-canvas-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper" style={{ background: '#e0f2fe', color: '#0284c7' }}>
          <Calculator size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#bae6fd', color: '#0369a1' }}>FINTECH CALC</span>
          <h4 className="wf-node-title">{data.label || 'Financial Calculator'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div style={{ padding: '6px', background: 'rgba(2, 132, 199, 0.05)', borderRadius: '6px', fontSize: '11px', color: '#0f172a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#0284c7' }}>
            <TrendingUp size={12} /> <span>{mode} Calculator</span>
          </div>
          <div style={{ marginTop: '2px', color: '#475569' }}>
            Amount: ₹{amt} | {years} Yrs @ {rate}%
          </div>
          <div style={{ marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
            Outputs: <code>steps.{'{id}'}.futureValue</code>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
