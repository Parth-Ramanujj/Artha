import { BadRequestException, BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentStatus, AiAgent } from './entities/ai-agent.entity';
import { AiAgentInputDto, AGENT_PLATFORMS } from './dto/ai-agent.dto';
import { AiService } from './ai.service';
import { Session } from '../session/entities/session.entity';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import {
  isSsrfProtectionEnabled,
  redactSsrfError,
  SsrfBlockedError,
  withSafeFetch,
} from '../../common/security/ssrf-guard';
import { createLogger } from '../../common/services/logger.service';

export type AgentReplyOutcome = 'skipped' | 'replied' | 'failed';
type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** What the API returns: the webhook auth header never leaves the server. */
export type AiAgentView = Omit<AiAgent, 'externalAuthToken' | 'triggerKeywords'> & {
  triggerKeywords: string[];
  hasAuthHeader: boolean;
};

// A chat that an agent answered stays with it for follow-ups that no longer contain its keyword.
const CHAT_OWNER_MS = 60 * 60 * 1000;
const CHAT_OWNER_MAX = 5000;
const HISTORY_TURNS = 12;
const EXTERNAL_TIMEOUT_MS = 20_000;
const MAX_REPLY_CHARS = 4000;

const BUILDER_PROMPT = `You design WhatsApp customer-chat AI agents for a business. From the owner's description, answer with ONLY a JSON object:
{"name":"short agent name","role":"3-6 word role","description":"one sentence on what it handles","systemPrompt":"complete instructions for the agent: who it is, what it helps with, what to ask the customer, tone, what it must never do (invent prices, policies or order details), and when to say a team member will follow up","triggerKeywords":["5-10 lowercase words or short phrases customers would write that should route the chat to this agent, including Gujarati/Hindi words if the business serves them"]}`;

/**
 * Business-defined chat agents: a built-in model with its own instructions, or an external webhook
 * (Flowise, n8n, Dify…). Active agents with auto-reply on answer incoming WhatsApp chats by keyword.
 */
@Injectable()
export class AiAgentService {
  private readonly logger = createLogger('AiAgentService');
  // shortcut: chat ownership lives in this process; a restart or a second instance forgets it (follow-ups
  // then route by keyword again). Move it to the conversation row if agents must stick across restarts.
  private readonly chatOwner = new Map<string, { agentId: string; at: number }>();

  constructor(
    @InjectRepository(AiAgent, 'data') private readonly repo: Repository<AiAgent>,
    @InjectRepository(Session, 'data') private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Message, 'data') private readonly messageRepo: Repository<Message>,
    private readonly ai: AiService,
    private readonly engines: EngineRegistry,
  ) {}

  // ── CRUD ──

  view(agent: AiAgent): AiAgentView {
    const { externalAuthToken, triggerKeywords, ...rest } = agent;
    return { ...rest, triggerKeywords: triggerKeywords ?? [], hasAuthHeader: Boolean(externalAuthToken) };
  }

  async list(businessId: string): Promise<AiAgentView[]> {
    const agents = await this.repo.find({ where: { businessId }, order: { createdAt: 'ASC' } });
    return agents.map(a => this.view(a));
  }

  private async find(businessId: string, id: string): Promise<AiAgent> {
    const agent = await this.repo.findOne({ where: { id, businessId } });
    if (!agent) throw new NotFoundException('AI agent not found');
    return agent;
  }

  async create(businessId: string, input: AiAgentInputDto): Promise<AiAgentView> {
    if (!input.name?.trim()) throw new BadRequestException('Give the agent a name');
    const agent = this.repo.create({
      businessId,
      name: input.name.trim(),
      model: process.env.GROQ_DEFAULT_MODEL || 'openai/gpt-oss-120b',
      status: AgentStatus.ACTIVE,
      temperature: 0.5,
      autonomous: false,
    });
    await this.apply(businessId, agent, input);
    return this.view(await this.repo.save(agent));
  }

  async update(businessId: string, id: string, input: AiAgentInputDto): Promise<AiAgentView> {
    const agent = await this.find(businessId, id);
    await this.apply(businessId, agent, input);
    return this.view(await this.repo.save(agent));
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.find(businessId, id);
    await this.repo.delete({ id, businessId });
  }

  /** Copies validated input onto the agent; rules that span fields are checked on the result. */
  private async apply(businessId: string, agent: AiAgent, input: AiAgentInputDto): Promise<void> {
    const text = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
    if (input.name !== undefined) agent.name = input.name.trim() || agent.name;
    if (input.role !== undefined) agent.role = input.role.trim() || 'Customer Support';
    if (input.description !== undefined) agent.description = text(input.description);
    if (input.model !== undefined) agent.model = input.model.trim() || agent.model;
    if (input.temperature !== undefined) agent.temperature = input.temperature;
    if (input.systemPrompt !== undefined) agent.systemPrompt = text(input.systemPrompt);
    if (input.status !== undefined) agent.status = input.status;
    if (input.autonomous !== undefined) agent.autonomous = input.autonomous;
    if (input.triggerKeywords !== undefined) {
      agent.triggerKeywords = [...new Set(input.triggerKeywords.map(k => k.trim().toLowerCase()).filter(Boolean))];
    }
    if (input.sessionId !== undefined) {
      const sessionId = text(input.sessionId);
      if (
        sessionId &&
        !(await this.sessionRepo.findOne({ where: { id: sessionId, businessId }, select: { id: true } }))
      ) {
        throw new BadRequestException('That WhatsApp number does not belong to this business');
      }
      agent.sessionId = sessionId;
    }
    if (input.isExternal !== undefined) agent.isExternal = input.isExternal;
    if (input.externalPlatform !== undefined) agent.externalPlatform = input.externalPlatform;
    if (input.externalWebhookUrl !== undefined) agent.externalWebhookUrl = text(input.externalWebhookUrl);
    if (input.externalAuthHeader !== undefined) agent.externalAuthToken = text(input.externalAuthHeader);
    if (input.responseJsonPath !== undefined) agent.responseJsonPath = text(input.responseJsonPath);

    if (agent.isExternal) {
      if (!agent.externalWebhookUrl || !/^https?:\/\/[^\s]+$/i.test(agent.externalWebhookUrl)) {
        throw new BadRequestException('An external agent needs its webhook URL (https://…)');
      }
      if (agent.externalPlatform && !(AGENT_PLATFORMS as readonly string[]).includes(agent.externalPlatform)) {
        throw new BadRequestException('Unknown platform');
      }
    }
  }

  // ── builder, test chat, connection test ──

  /** Drafts an agent from the owner's description; it starts with auto-reply off so it can be reviewed first. */
  async build(businessId: string, prompt: string): Promise<AiAgentView> {
    const { content } = await this.complete(
      [
        { role: 'system', content: BUILDER_PROMPT },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 1200 },
    );
    const draft = parseJsonObject(content);
    const name = str(draft.name, 100);
    const systemPrompt = str(draft.systemPrompt, 8000);
    if (!name || !systemPrompt)
      throw new BadGatewayException('The AI did not return a usable agent. Try describing it again.');
    const keywords = Array.isArray(draft.triggerKeywords)
      ? draft.triggerKeywords.filter((k): k is string => typeof k === 'string').slice(0, 30)
      : [];
    return this.create(businessId, {
      name,
      role: str(draft.role, 100) ?? undefined,
      description: str(draft.description, 1000),
      systemPrompt,
      triggerKeywords: keywords.map(k => k.slice(0, 50)),
      autonomous: false,
    });
  }

  async test(
    businessId: string,
    id: string,
    message: string,
    history: ChatTurn[] = [],
  ): Promise<{ reply: string; latencyMs: number }> {
    const agent = await this.find(businessId, id);
    const started = Date.now();
    const reply = await this.replyFor(agent, message, history, 'openwa-test-chat', 'test');
    return { reply, latencyMs: Date.now() - started };
  }

  /** Sends a real test message to an external agent and remembers whether it answered. */
  async ping(
    businessId: string,
    id: string,
  ): Promise<{ ok: boolean; latencyMs: number; reply?: string; error?: string }> {
    const agent = await this.find(businessId, id);
    if (!agent.isExternal) throw new BadRequestException('Only external agents have a connection to test');
    const started = Date.now();
    let result: { ok: boolean; latencyMs: number; reply?: string; error?: string };
    try {
      const reply = await this.callExternal(
        agent,
        'Hello, this is a connection test from OpenWA.',
        [],
        'openwa-test-chat',
        'test',
      );
      result = { ok: true, latencyMs: Date.now() - started, reply };
    } catch (err) {
      result = { ok: false, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
    }
    await this.repo.update(agent.id, {
      externalStatus: result.ok ? 'connected' : 'error',
      lastPingMs: result.ok ? result.latencyMs : null,
    });
    return result;
  }

  // ── live auto-reply ──

  /**
   * Answers a fresh one-to-one customer message with the agent that owns the chat or whose keyword it
   * contains (an agent without keywords takes the rest). 'skipped' leaves the message to the default
   * AI assistant; 'failed' means a person should pick the chat up.
   */
  async autoReply(sessionId: string, businessId: string, msg: IncomingMessage): Promise<AgentReplyOutcome> {
    const body = msg.body?.trim();
    if (!body) return 'skipped';
    const agents = (
      await this.repo.find({
        where: { businessId, status: AgentStatus.ACTIVE, autonomous: true },
        order: { createdAt: 'ASC' },
      })
    ).filter(a => !a.sessionId || a.sessionId === sessionId);
    const agent = this.pick(agents, `${sessionId}:${msg.chatId}`, body);
    if (!agent) return 'skipped';
    const engine = this.engines.get(sessionId);
    if (!engine) return 'skipped';

    const key = `${sessionId}:${msg.chatId}`;
    const isNewChat = this.chatOwner.get(key)?.agentId !== agent.id;
    try {
      const history = await this.history(sessionId, msg.chatId, body);
      const reply = await this.replyFor(agent, body, history, msg.chatId, sessionId);
      await engine.sendTextMessage(msg.chatId, reply);
    } catch (err) {
      this.logger.warn(
        `Agent ${agent.id} could not answer chat ${msg.chatId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'failed';
    }
    this.own(key, agent.id);
    if (isNewChat) await this.repo.increment({ id: agent.id }, 'conversationsHandled', 1);
    return 'replied';
  }

  private pick(agents: AiAgent[], chatKey: string, body: string): AiAgent | null {
    if (agents.length === 0) return null;
    const text = body.toLowerCase();
    const byKeyword = agents.find(a => (a.triggerKeywords ?? []).some(k => k && text.includes(k)));
    if (byKeyword) return byKeyword;
    const owner = this.chatOwner.get(chatKey);
    if (owner && Date.now() - owner.at < CHAT_OWNER_MS) {
      const current = agents.find(a => a.id === owner.agentId);
      if (current) return current;
    }
    return agents.find(a => !a.triggerKeywords?.length) ?? null;
  }

  private own(key: string, agentId: string): void {
    if (this.chatOwner.size >= CHAT_OWNER_MAX) {
      const oldest = this.chatOwner.keys().next().value;
      if (oldest !== undefined) this.chatOwner.delete(oldest);
    }
    this.chatOwner.delete(key);
    this.chatOwner.set(key, { agentId, at: Date.now() });
  }

  /** Recent turns of the chat, without the message being answered (it is stored before hooks run). */
  private async history(sessionId: string, chatId: string, current: string): Promise<ChatTurn[]> {
    const recent = await this.messageRepo.find({
      where: { sessionId, chatId },
      order: { createdAt: 'DESC' },
      take: HISTORY_TURNS + 1,
    });
    const turns = recent
      .reverse()
      .filter(m => m.body?.trim())
      .map<ChatTurn>(m => ({
        role: m.direction === MessageDirection.OUTGOING ? 'assistant' : 'user',
        content: m.body.trim(),
      }));
    const last = turns[turns.length - 1];
    if (last?.role === 'user' && last.content === current) turns.pop();
    return turns.slice(-HISTORY_TURNS);
  }

  // ── thinking ──

  private async replyFor(
    agent: AiAgent,
    message: string,
    history: ChatTurn[],
    chatId: string,
    sessionId: string,
  ): Promise<string> {
    if (agent.isExternal) return this.callExternal(agent, message, history, chatId, sessionId);
    const { content } = await this.complete(
      [{ role: 'system', content: systemFor(agent) }, ...history, { role: 'user', content: message }],
      { model: agent.model, temperature: agent.temperature, maxTokens: 600 },
    );
    const reply = content.trim();
    if (!reply) throw new BadGatewayException('The AI returned an empty reply');
    return reply.slice(0, MAX_REPLY_CHARS);
  }

  private async complete(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: { model?: string; temperature: number; maxTokens: number },
  ): Promise<{ content: string }> {
    try {
      return await this.ai.complete(messages, { ...options, reasoningEffort: 'low' });
    } catch (err) {
      throw new BadGatewayException(`The AI did not answer: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async callExternal(
    agent: AiAgent,
    message: string,
    history: ChatTurn[],
    chatId: string,
    sessionId: string,
  ): Promise<string> {
    if (!agent.externalWebhookUrl) throw new BadRequestException('This external agent has no webhook URL');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const auth = agent.externalAuthToken?.trim();
    if (auth) {
      // "X-Api-Key: abc" sets that header; anything else is the Authorization value.
      const named = /^([A-Za-z0-9-]+):\s*(.+)$/.exec(auth);
      if (named && !/^bearer|^basic/i.test(auth)) headers[named[1]] = named[2];
      else headers.Authorization = auth;
    }
    const body = requestBody(agent.externalPlatform, message, history, chatId, sessionId);
    let response: { ok: boolean; status: number; text: string };
    try {
      response = await withSafeFetch(
        agent.externalWebhookUrl,
        { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) },
        async res => ({ ok: res.ok, status: res.status, text: await res.text() }),
        { guard: isSsrfProtectionEnabled() },
      );
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        throw new BadRequestException(redactSsrfError(err, this.logger, 'an external AI agent call'));
      }
      const reason =
        err instanceof Error && err.name === 'TimeoutError' ? 'it did not answer within 20 s' : String(err);
      throw new BadGatewayException(`Could not reach the external agent: ${reason}`);
    }
    if (!response.ok) throw new BadGatewayException(`The external agent answered HTTP ${response.status}`);
    const reply = extractReply(response.text, agent.responseJsonPath);
    if (!reply) {
      throw new BadGatewayException(
        `No reply text found in the external agent's answer${agent.responseJsonPath ? ` at "${agent.responseJsonPath}"` : ''}`,
      );
    }
    return reply.slice(0, MAX_REPLY_CHARS);
  }
}

function systemFor(agent: AiAgent): string {
  const base = agent.systemPrompt?.trim() || `You are ${agent.name}, ${agent.role}.`;
  return `${base}

You are chatting with a customer on WhatsApp as ${agent.name} (${agent.role}).
- Reply in the customer's language, in 1 to 4 short sentences of plain text (no markdown, no lists).
- Never invent prices, stock, policies or order details. If you do not know, say a team member will follow up.`;
}

/** Each platform expects its own request shape; "custom" gets every common field. */
function requestBody(
  platform: string | null,
  message: string,
  history: ChatTurn[],
  chatId: string,
  sessionId: string,
): Record<string, unknown> {
  switch (platform) {
    case 'dify':
      return { inputs: {}, query: message, response_mode: 'blocking', user: chatId };
    case 'flowise':
      return {
        question: message,
        history: history.map(h => ({ role: h.role === 'user' ? 'userMessage' : 'apiMessage', content: h.content })),
        overrideConfig: { sessionId: chatId },
      };
    default:
      return { message, text: message, chatId, sessionId, history };
  }
}

/** The reply text at `path` ("output.text", "data.0.reply"), or the usual fields, or a plain-text body. */
export function extractReply(raw: string, path: string | null): string | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw.trim() || null;
  }
  if (Array.isArray(data) && data.length === 1) data = data[0]; // n8n answers with a one-item array
  const pick = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
  if (path?.trim()) {
    let cur: unknown = data;
    for (const part of path.trim().split('.')) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[part];
      else return null;
    }
    return pick(cur);
  }
  if (typeof data === 'string') return pick(data);
  const obj = (data ?? {}) as Record<string, unknown>;
  for (const field of ['text', 'answer', 'output', 'reply', 'message', 'response']) {
    const found = pick(obj[field]);
    if (found) return found;
  }
  return null;
}

/** The first JSON object in a model answer, or {}. */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}
