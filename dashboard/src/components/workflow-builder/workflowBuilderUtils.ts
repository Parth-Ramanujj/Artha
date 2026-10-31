/**
 * Workflow Builder Utility Functions
 *
 * Implements Activepieces-style DAG traversal, variable token insertion,
 * expression extraction, and client-side workflow validation rules.
 */

import type { WorkflowNodeData } from './types';

export interface EdgeLike {
  source: string;
  target: string;
}

export interface NodeLike {
  id: string;
  type?: string;
  data?: Partial<WorkflowNodeData>;
}

/**
 * Traverses DAG edges backwards from a target node to find all valid upstream ancestor nodes.
 * Guarantees cycle-safety via visited set.
 */
export function computeUpstreamNodes<T extends NodeLike>(
  targetNodeId: string,
  nodes: T[],
  edges: EdgeLike[],
): T[] {
  if (!targetNodeId || !nodes.length) return [];

  const visited = new Set<string>([targetNodeId]);
  const queue = [targetNodeId];
  const upstreamNodes: T[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const incomingEdges = edges.filter(e => e.target === currentId);

    for (const edge of incomingEdges) {
      if (!visited.has(edge.source)) {
        visited.add(edge.source);
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          upstreamNodes.push(sourceNode);
          queue.push(sourceNode.id);
        }
      }
    }
  }

  return upstreamNodes;
}

/**
 * Inserts a variable reference token at the current cursor or selection range.
 * Preserves text before and after the cursor, replacing any highlighted range.
 */
export function insertVariableToken(
  currentText: string,
  rawToken: string,
  selectionStart?: number,
  selectionEnd?: number,
): { text: string; nextCursor: number } {
  const token = rawToken.startsWith('{{') ? rawToken : `{{${rawToken}}}`;
  const text = currentText || '';
  const start = Math.max(0, Math.min(selectionStart ?? text.length, text.length));
  const end = Math.max(start, Math.min(selectionEnd ?? text.length, text.length));

  const before = text.substring(0, start);
  const after = text.substring(end);
  const nextText = `${before}${token}${after}`;
  const nextCursor = start + token.length;

  return { text: nextText, nextCursor };
}

/**
 * Extracts all `{{...}}` variable references from a dynamic string template.
 */
export function extractVariableReferences(template: string): string[] {
  if (!template) return [];
  const regex = /\{\{([^}]+)\}\}/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match[1]?.trim()) {
      matches.push(match[1].trim());
    }
  }

  return matches;
}

/**
 * Validates a workflow for production readiness:
 * - Requires at least one trigger node
 * - Detects orphan/unconnected nodes
 * - Checks unclosed or malformed `{{...}}` expressions
 * - Validates critical node configurations
 */
export interface WorkflowValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateWorkflow(
  nodes: NodeLike[],
  edges: EdgeLike[],
): { isValid: boolean; errors: WorkflowValidationError[] } {
  const errors: WorkflowValidationError[] = [];

  if (nodes.length === 0) {
    errors.push({
      message: 'Workflow is empty. Add at least one trigger node to get started.',
      severity: 'error',
    });
    return { isValid: false, errors };
  }

  // 1. Check for trigger node
  const hasTrigger = nodes.some(n => n.type === 'trigger');
  if (!hasTrigger) {
    errors.push({
      message: 'Workflow must have a WhatsApp Trigger node.',
      severity: 'error',
    });
  }

  // 2. Check for disconnected / orphan nodes (nodes with 0 incoming and 0 outgoing edges)
  if (nodes.length > 1) {
    for (const node of nodes) {
      const hasIncoming = edges.some(e => e.target === node.id);
      const hasOutgoing = edges.some(e => e.source === node.id);

      if (!hasIncoming && !hasOutgoing) {
        errors.push({
          nodeId: node.id,
          message: `Node "${node.data?.label || node.id}" is disconnected from the workflow graph.`,
          severity: 'warning',
        });
      }
    }
  }

  // 3. Node-specific configuration validation
  for (const node of nodes) {
    const config = node.data?.config || {};

    if (node.type === 'webhook_call') {
      if (!config.url || !String(config.url).trim()) {
        errors.push({
          nodeId: node.id,
          field: 'url',
          message: `HTTP Request node "${node.data?.label || node.id}" requires a destination URL.`,
          severity: 'error',
        });
      } else if (!/^https?:\/\//i.test(String(config.url).trim()) && !String(config.url).includes('{{')) {
        errors.push({
          nodeId: node.id,
          field: 'url',
          message: `HTTP Request URL must start with http:// or https://, or use a dynamic variable.`,
          severity: 'error',
        });
      }
    }

    if (node.type === 'send_message') {
      if (!config.message && !config.body) {
        errors.push({
          nodeId: node.id,
          field: 'message',
          message: `Send Message node "${node.data?.label || node.id}" has empty message text.`,
          severity: 'warning',
        });
      }
    }

    // Check for broken / unclosed dynamic expressions
    const configStr = JSON.stringify(config);
    const unclosedOpening = (configStr.match(/\{\{/g) || []).length;
    const unclosedClosing = (configStr.match(/\}\}/g) || []).length;
    if (unclosedOpening !== unclosedClosing) {
      errors.push({
        nodeId: node.id,
        message: `Node "${node.data?.label || node.id}" has an unclosed variable expression {{...}}.`,
        severity: 'error',
      });
    }
  }

  const hasFatalErrors = errors.some(e => e.severity === 'error');
  return {
    isValid: !hasFatalErrors,
    errors,
  };
}
