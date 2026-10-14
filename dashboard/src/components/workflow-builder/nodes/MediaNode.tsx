import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Paperclip, Image, FileText, Music } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const MediaNode = memo(function MediaNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const mediaType = data.config?.mediaType || 'image';
  const url = data.config?.url || '';
  const caption = data.config?.caption || '';

  const getMediaIcon = () => {
    switch (mediaType) {
      case 'document':
        return <FileText size={16} />;
      case 'audio':
        return <Music size={16} />;
      default:
        return <Image size={16} />;
    }
  };

  return (
    <div className={`wf-canvas-node wf-node-media ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper media-icon">
          <Paperclip size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge media-badge">SEND {mediaType.toUpperCase()}</span>
          <h4 className="wf-node-title">{data.label || 'Send Media Message'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-media-details">
          <div className="wf-media-preview-row">
            {getMediaIcon()}
            <span className="wf-media-type">{mediaType}</span>
          </div>
          {caption && <div className="wf-media-caption">"{caption}"</div>}
          <div className="wf-media-url">{url ? (url.length > 35 ? url.substring(0, 35) + '...' : url) : 'No URL specified'}</div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
