import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Table, HelpCircle } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

/**
 * Looks up the customer's number in a Google Sheet, then replies with the row. Two outputs: the row
 * was found, or it was not.
 */
export const SheetsLookupNode = memo(function SheetsLookupNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const sheet = data.config?.sheetName || 'Sheet1';
  const keyColumn = data.config?.keyColumn || 'Phone';
  const ready = Boolean(data.config?.integrationId && data.config?.spreadsheetId);

  return (
    <div className={`wf-canvas-node wf-node-sheets ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper sheets-icon">
          <Table size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge sheets-badge">SHEETS LOOKUP</span>
          <h4 className="wf-node-title">{data.label || 'Sheets Lookup & Reply'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-sheets-info">
          <div className="wf-sheets-row">
            <span className="wf-label">Find by:</span>
            <span className="wf-val">
              {keyColumn} in “{sheet}”
            </span>
          </div>
          {!ready && <div className="wf-sheets-row wf-val-url">Choose a connection and a spreadsheet</div>}
        </div>
      </div>

      <div className="wf-button-branch-item">
        <span className="wf-btn-text">Found</span>
        <Handle
          type="source"
          position={Position.Right}
          id="found"
          className="wf-handle wf-handle-btn"
          title="Row found"
        />
      </div>
      <div className="wf-fallback-branch-item">
        <HelpCircle size={12} />
        <span>Not found</span>
        <Handle
          type="source"
          position={Position.Bottom}
          id="not_found"
          className="wf-handle wf-handle-fallback"
          title="No matching row"
        />
      </div>
    </div>
  );
});
