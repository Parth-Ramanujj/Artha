import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../Modal';
import { inputStyle } from './styles';
import type { AgentPlatform, AiAgent, AiAgentInput, Session } from '../../services/api';

const RESPONSE_PATH_HINTS: Record<AgentPlatform, string> = {
  flowise: 'Flowise usually returns the reply in "text"',
  dify: 'Dify usually returns the reply in "answer"',
  n8n: 'n8n usually returns the reply in "output"',
  langchain: 'LangServe usually returns the reply in "output"',
  botpress: 'Botpress: use the key holding the reply text, e.g. "responses.0.payload.text"',
  custom: 'Dot path to the reply text in your JSON response, e.g. "data.message"',
};

const DEFAULT_PATH: Record<AgentPlatform, string> = {
  flowise: 'text',
  dify: 'answer',
  n8n: 'output',
  langchain: 'output',
  botpress: '',
  custom: '',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
      {hint && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>{hint}</span>
      )}
    </label>
  );
}

interface AgentFormModalProps {
  /** Agent being edited, or null to create a new one. */
  agent: AiAgent | null;
  external: boolean;
  sessions: Session[];
  models: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSubmit: (data: AiAgentInput) => Promise<void>;
}

export function AgentFormModal({ agent, external, sessions, models, onClose, onSubmit }: AgentFormModalProps) {
  const [name, setName] = useState(agent?.name ?? '');
  const [role, setRole] = useState(agent?.role ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [model, setModel] = useState(agent?.model ?? '');
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.4);
  const [keywords, setKeywords] = useState((agent?.triggerKeywords ?? []).join(', '));
  const [sessionId, setSessionId] = useState(agent?.sessionId ?? '');
  const [platform, setPlatform] = useState<AgentPlatform>(agent?.externalPlatform ?? 'flowise');
  const [webhookUrl, setWebhookUrl] = useState(agent?.externalWebhookUrl ?? '');
  const [authHeader, setAuthHeader] = useState('');
  const [responsePath, setResponsePath] = useState(agent?.responseJsonPath ?? DEFAULT_PATH.flowise);
  const [autonomous, setAutonomous] = useState(agent?.autonomous ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    if (external && !webhookUrl.trim()) return;
    const data: AiAgentInput = {
      name: name.trim(),
      triggerKeywords: keywords
        .split(',')
        .map(k => k.trim())
        .filter(Boolean),
      sessionId: sessionId || null,
      autonomous,
    };
    if (external) {
      Object.assign(data, {
        isExternal: true,
        externalPlatform: platform,
        externalWebhookUrl: webhookUrl.trim(),
        responseJsonPath: responsePath.trim() || null,
      });
      // Omit to keep the stored header; on create an empty field simply means "no header".
      if (authHeader) data.externalAuthHeader = authHeader;
    } else {
      Object.assign(data, {
        role: role.trim(),
        description: description.trim() || null,
        systemPrompt: systemPrompt.trim() || null,
        model: model.trim() || undefined,
        temperature,
      });
    }
    setSaving(true);
    try {
      await onSubmit(data);
    } finally {
      setSaving(false);
    }
  };

  const title = `${agent ? 'Edit' : external ? 'Connect' : 'Create'} ${external ? 'External Agent' : 'AI Agent'}`;

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !name.trim() || (external && !webhookUrl.trim())}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {agent ? 'Save' : external ? 'Connect Agent' : 'Create Agent'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </Field>

        {external ? (
          <>
            <Field label="Platform">
              <select
                value={platform}
                onChange={e => {
                  const next = e.target.value as AgentPlatform;
                  // Swap in the new platform's default path only if the user hadn't customised it.
                  if (responsePath === DEFAULT_PATH[platform]) setResponsePath(DEFAULT_PATH[next]);
                  setPlatform(next);
                }}
                style={inputStyle}
              >
                <option value="flowise">Flowise AI</option>
                <option value="n8n">n8n Workflow</option>
                <option value="dify">Dify.ai</option>
                <option value="langchain">LangChain / LangServe</option>
                <option value="botpress">Botpress</option>
                <option value="custom">Custom REST API</option>
              </select>
            </Field>
            <Field label="Webhook URL *">
              <input
                type="url"
                placeholder="https://your-agent.com/api/v1/predict"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field
              label="Authorization header (optional)"
              hint={agent?.hasAuthHeader ? 'Leave empty to keep the saved header.' : undefined}
            >
              <input
                type="password"
                autoComplete="off"
                placeholder={agent?.hasAuthHeader ? 'unchanged' : 'Bearer your_secret_token'}
                value={authHeader}
                onChange={e => setAuthHeader(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Response JSON path" hint={RESPONSE_PATH_HINTS[platform]}>
              <input
                type="text"
                value={responsePath}
                onChange={e => setResponsePath(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Role">
              <input
                type="text"
                placeholder="e.g. Customer support & FAQ"
                value={role}
                onChange={e => setRole(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Description">
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="System prompt">
              <textarea
                rows={6}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                list="ai-agent-models"
                placeholder="Server default"
                value={model}
                onChange={e => setModel(e.target.value)}
                style={inputStyle}
              />
              <datalist id="ai-agent-models">
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label={`Temperature: ${temperature.toFixed(2)}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </Field>
          </>
        )}

        <Field label="Trigger keywords (comma separated)" hint="Empty = answers any chat no other agent claims">
          <input
            type="text"
            placeholder="price, order, help"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Answers on">
          <select value={sessionId} onChange={e => setSessionId(e.target.value)} style={inputStyle}>
            <option value="">All numbers</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="toggle-switch-container" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={autonomous} onChange={e => setAutonomous(e.target.checked)} />
          <span>Auto-reply to customers</span>
        </label>
      </div>
    </Modal>
  );
}
