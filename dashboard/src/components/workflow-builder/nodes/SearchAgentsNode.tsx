import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { UserCheck, PhoneCall, MessageCircle } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const SearchAgentsNode = memo(function SearchAgentsNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const pincode = data.config?.pincode || '{{pincode}}';
  const mainService = data.config?.mainService || 'insurance';
  const limit = data.config?.limit || 3;

  return (
    <div className={`wf-canvas-node wf-node-search-agents ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper ai-icon" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
          <UserCheck size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#34d399' }}>
            ADVISORY MATCH
          </span>
          <h4 className="wf-node-title">{data.label || 'Search 3 Matching Advisors'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-media-details">
          <div className="text-xs text-slate-300 font-medium">
            Service: <span className="text-emerald-400 capitalize">{mainService}</span>
          </div>
          <div className="text-xs text-slate-400">
            Pincode: <span className="font-mono text-cyan-300">{pincode}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-700/60 text-[11px] text-slate-300">
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <PhoneCall size={11} /> Call Now
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-teal-400 font-semibold">
              <MessageCircle size={11} /> WhatsApp
            </span>
            <span className="ml-auto text-slate-400 font-mono">Max {limit}</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
