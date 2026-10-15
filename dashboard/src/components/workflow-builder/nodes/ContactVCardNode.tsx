import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Contact, PhoneCall, Building } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const ContactVCardNode = memo(function ContactVCardNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const displayName = data.config?.displayName || data.config?.name || 'Advisor Name';
  const phoneNumber = data.config?.phoneNumber || data.config?.phone || '+91 98765 43210';
  const organization = data.config?.organization || 'PadosiAgent';

  return (
    <div className={`wf-canvas-node wf-node-vcard ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper vcard-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
          <Contact size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#d1fae5', color: '#065f46' }}>WHATSAPP VCARD</span>
          <h4 className="wf-node-title">{data.label || 'Send Contact vCard'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-vcard-preview" style={{ padding: '8px', background: 'rgba(5, 150, 105, 0.05)', borderRadius: '6px', fontSize: '12px' }}>
          <div style={{ fontWeight: 600, color: '#111827' }}>📇 {displayName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4b5563', marginTop: '2px' }}>
            <PhoneCall size={11} /> <span>{phoneNumber}</span>
          </div>
          {organization && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', marginTop: '2px', fontSize: '11px' }}>
              <Building size={11} /> <span>{organization}</span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
