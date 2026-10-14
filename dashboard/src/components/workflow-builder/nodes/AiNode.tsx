import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, Sparkles, BookOpen } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

export const AiNode = memo(function AiNode({
  data,
  selected,
}: {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}) {
  const prompt = data.config?.systemPrompt || 'You are an intelligent WhatsApp AI assistant.';
  const useKnowledge = data.config?.useKnowledgeBase ?? true;
  const enableHandoff = data.config?.enableHandoff ?? true;

  return (
    <div className={`wf-canvas-node wf-node-ai ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="wf-handle wf-handle-top" />

      <div className="wf-node-header">
        <div className="wf-node-icon-wrapper ai-icon">
          <Bot size={16} />
        </div>
        <div className="wf-node-title-box">
          <span className="wf-node-badge ai-badge">AI ASSISTANT</span>
          <h4 className="wf-node-title">{data.label || 'Groq LLM / RAG'}</h4>
        </div>
      </div>

      <div className="wf-node-body">
        <div className="wf-message-prompt">
          {prompt.length > 70 ? `${prompt.substring(0, 70)}...` : prompt}
        </div>

        <div className="wf-ai-pills">
          {useKnowledge && (
            <span className="wf-ai-pill rag">
              <BookOpen size={11} /> Vector RAG
            </span>
          )}
          {enableHandoff && (
            <span className="wf-ai-pill handoff">
              <Sparkles size={11} /> Auto Handoff
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" className="wf-handle wf-handle-bottom" />
    </div>
  );
});
