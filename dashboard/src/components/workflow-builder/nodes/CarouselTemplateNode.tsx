import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LayoutGrid, Layers } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const CarouselTemplateNode = memo(function CarouselTemplateNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const cards = (data.config?.cards as unknown[]) || [];
  const cardCount = cards.length || 3;

  return (
    <div className={`wf-canvas-node ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper" style={{ background: '#f0fdf4', color: '#16a34a' }}>
          <LayoutGrid size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: '#dcfce7', color: '#15803d' }}>CAROUSEL SLIDER</span>
          <h4 className="wf-node-title">{data.label || 'Send Carousel Template'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', background: 'rgba(22, 163, 74, 0.05)', borderRadius: '6px', fontSize: '11px', color: '#14532d' }}>
          <Layers size={13} />
          <span>{cardCount} Horizontal Scroll Cards (Cloud API + Fallback)</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
