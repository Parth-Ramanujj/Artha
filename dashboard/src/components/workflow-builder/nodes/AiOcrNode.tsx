import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ScanText, FileSpreadsheet } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const AiOcrNode = memo(function AiOcrNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const docType = data.config?.documentType || 'POLICY';

  return (
    <div className={`wf-canvas-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper" style={{ background: '#ecfeff', color: '#0891b2' }}>
          <ScanText size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#cffafe', color: '#155e75' }}>AI OCR VISION</span>
          <h4 className="wf-node-title">{data.label || 'Document OCR Extractor'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div style={{ padding: '6px', background: 'rgba(8, 145, 178, 0.05)', borderRadius: '6px', fontSize: '11px', color: '#164e63' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
            <FileSpreadsheet size={12} />
            <span>Target: {docType} (Policy / RC / ID)</span>
          </div>
          <div style={{ marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
            Extracts policyNo, vehicleNo, expiryDate into JSON
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
