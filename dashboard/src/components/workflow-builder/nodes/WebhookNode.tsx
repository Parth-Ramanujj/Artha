import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Globe, ArrowRight, Sliders, Layers } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const WebhookNode = memo(function WebhookNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const url = data.config?.url || 'https://api.example.com/webhook';
  const method = (data.config?.method || 'POST').toUpperCase();
  const queryParams = (data.config?.queryParams as Array<{ key: string; value: string }>) || [];
  const headers = (data.config?.headers as Array<{ key: string; value: string }>) || [];
  const responseMapping = (data.config?.responseMapping as Array<{ path: string; variable: string }>) || [];
  const saveResponseTo = data.config?.saveResponseTo as string | undefined;

  const getMethodBadgeClass = (m: string) => {
    switch (m) {
      case 'GET': return 'method-get';
      case 'POST': return 'method-post';
      case 'PUT': return 'method-put';
      case 'PATCH': return 'method-patch';
      case 'DELETE': return 'method-delete';
      default: return 'method-post';
    }
  };

  return (
    <div className={`wf-canvas-node wf-node-webhook ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper webhook-icon">
          <Globe size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge webhook-badge">WEBHOOK / API</span>
          <h4 className="wf-node-title">{data.label || 'API Request'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-webhook-preview">
          <span className={`wf-http-method ${getMethodBadgeClass(method)}`}>{method}</span>
          <span className="wf-http-url" title={url}>
            {url.length > 36 ? `${url.substring(0, 36)}...` : url}
          </span>
        </div>

        {(queryParams.length > 0 || headers.length > 0 || responseMapping.length > 0 || saveResponseTo) && (
          <div className="wf-webhook-badges">
            {queryParams.length > 0 && (
              <span className="wf-tag-badge" title={`${queryParams.length} query parameters`}>
                <Sliders size={10} /> {queryParams.length} param{queryParams.length > 1 ? 's' : ''}
              </span>
            )}
            {headers.length > 0 && (
              <span className="wf-tag-badge" title={`${headers.length} custom headers`}>
                <Layers size={10} /> {headers.length} header{headers.length > 1 ? 's' : ''}
              </span>
            )}
            {(responseMapping.length > 0 || saveResponseTo) && (
              <span className="wf-tag-badge wf-mapping-badge" title="Saves response into variables">
                <ArrowRight size={10} /> {saveResponseTo ? `vars.${saveResponseTo}` : `${responseMapping.length} var${responseMapping.length > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});

