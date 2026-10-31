import { Injectable, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfig, AiProvider } from './entities/ai-config.entity';
import { KnowledgeDocument, DocumentStatus } from './entities/knowledge-document.entity';
import { UpdateAiConfigDto, CreateKnowledgeDocumentDto, UpdateKnowledgeDocumentDto } from './dto/ai.dto';
import { createLogger } from '../../common/services/logger.service';
import { BusinessService } from '../business/business.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { Message, MessageDirection } from '../message/entities/message.entity';

const MAX_DOCUMENT_CONTENT_LENGTH = 500_000;
const MAX_DOCUMENTS_PER_BUSINESS = 100;

// Prompt budget: long stored messages (bot menus, agent cards) once pushed a request to ~65k tokens
// against an 8k tokens-per-minute plan, so every message is capped and the history has a total cap.
const MAX_HISTORY_MESSAGE_CHARS = 800;
const MAX_HISTORY_CHARS = 6000;
const MAX_USER_MESSAGE_CHARS = 2000;
const FALLBACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FALLBACK_MEMORY_MAX = 5000;

export type AutoReplyOutcome = 'skipped' | 'replied' | 'handoff' | 'failed';

/** A provider error that would repeat on every key (request too large, malformed). */
class NonRetryableAiError extends Error {}

/** Newest-first within the budget, returned in chronological order. */
function trimHistory<T extends { content: string }>(history: T[]): T[] {
  const kept: T[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const content = history[i].content.slice(0, MAX_HISTORY_MESSAGE_CHARS);
    if (total + content.length > MAX_HISTORY_CHARS) break;
    total += content.length;
    kept.unshift({ ...history[i], content });
  }
  return kept;
}

export interface AiChatRequest {
  businessId: string;
  sessionId: string;
  chatId: string;
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AiChatResponse {
  reply: string;
  handoff: boolean;
  confidence: 'high' | 'medium' | 'low';
  sourceDocs?: string[];
  tokensUsed?: number;
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = createLogger('AiService');
  private readonly lastFallbackAt = new Map<string, number>();
  private groqKeyIndex = 0;

  constructor(
    @InjectRepository(AiConfig, 'data')
    private readonly configRepo: Repository<AiConfig>,
    @InjectRepository(KnowledgeDocument, 'data')
    private readonly docRepo: Repository<KnowledgeDocument>,
    @InjectRepository(Message, 'data')
    private readonly messageRepo: Repository<Message>,
    private readonly businessService: BusinessService,
    private readonly engines: EngineRegistry,
  ) {}

  onModuleInit(): void {
    const keysCount = this.getGroqApiKeys().length;
    this.logger.log(`AI Assistant initialized with ${keysCount} Groq API key(s) in pool`);
  }

  /**
   * Auto-reply to a customer message no workflow took. The caller (the workflow trigger, which
   * already filtered to fresh one-to-one chats) acts on the outcome: 'handoff' and 'failed' mean a
   * person should pick the conversation up.
   */
  async autoReply(sessionId: string, businessId: string, msg: IncomingMessage): Promise<AutoReplyOutcome> {
    if (!msg.body?.trim()) return 'skipped';

    const config = await this.getConfig(businessId);
    if (!config.enabled) return 'skipped';
    if (config.sessionScopes && config.sessionScopes.length > 0 && !config.sessionScopes.includes(sessionId)) {
      return 'skipped';
    }

    const engine = this.engines.get(sessionId);
    if (!engine) return 'skipped';

    if (this.shouldHandoff(msg.body, config)) {
      await engine.sendTextMessage(msg.chatId, 'Connecting you with a human agent. Please wait.');
      return 'handoff';
    }

    // Retrieve previous conversation messages for multi-turn context
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
    try {
      const historyLimit = config.maxContextMessages ?? 10;
      const recent = await this.messageRepo.find({
        where: { sessionId, chatId: msg.chatId },
        order: { createdAt: 'DESC' },
        take: historyLimit,
      });
      if (recent && recent.length > 0) {
        recent.reverse();
        conversationHistory = recent
          .filter(m => m.body && m.body.trim())
          .map(m => ({
            role: m.direction === MessageDirection.OUTGOING ? ('assistant' as const) : ('user' as const),
            content: m.body.trim(),
          }));
      }
    } catch {
      // Non-critical: continue without history if query fails
    }

    const request: AiChatRequest = {
      businessId,
      sessionId,
      chatId: msg.chatId,
      message: msg.body,
      conversationHistory,
    };
    let reply: string;
    try {
      reply = (await this.generateReply(config, request)).reply;
    } catch (err) {
      this.logger.error(
        `AI auto-reply failed for business=${businessId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // One apology per chat per day; the conversation is handed to the team either way.
      const key = `${sessionId}:${msg.chatId}`;
      const last = this.lastFallbackAt.get(key) ?? 0;
      if (Date.now() - last > FALLBACK_COOLDOWN_MS) {
        this.rememberFallback(key);
        await engine.sendTextMessage(
          msg.chatId,
          config.fallbackMessage ?? 'Thanks for your message! Our team will get back to you shortly.',
        );
      }
      return 'failed';
    }

    if (!reply?.trim()) return 'failed';
    await engine.sendTextMessage(msg.chatId, reply);
    this.logger.log(`AI Assistant sent auto-reply to chat=${msg.chatId} session=${sessionId}`);
    return 'replied';
  }

  private rememberFallback(key: string): void {
    if (this.lastFallbackAt.size >= FALLBACK_MEMORY_MAX) {
      const oldest = this.lastFallbackAt.keys().next().value;
      if (oldest !== undefined) this.lastFallbackAt.delete(oldest);
    }
    this.lastFallbackAt.delete(key);
    this.lastFallbackAt.set(key, Date.now());
  }

  // ── Config ──

  async getConfig(businessId: string | null): Promise<AiConfig> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    let config = await this.configRepo.findOne({ where: { businessId: targetBusinessId } });
    if (!config) {
      // Off until a person turns it on: an auto-created config used to start answering customers
      // the first time anything read the settings.
      config = this.configRepo.create({
        businessId: targetBusinessId,
        enabled: false,
        provider: AiProvider.GROQ,
        model: process.env.GROQ_DEFAULT_MODEL || 'openai/gpt-oss-120b',
        systemPrompt:
          'You are a helpful and polite WhatsApp customer support assistant. Answer concisely and accurately.',
      });
      config = await this.configRepo.save(config);
    }
    return config;
  }

  async updateConfig(businessId: string | null, dto: UpdateAiConfigDto, apiKeyId?: string): Promise<AiConfig> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    const config = await this.getConfig(targetBusinessId);

    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.provider !== undefined) config.provider = dto.provider;
    if (dto.model !== undefined) config.model = dto.model ?? null;
    if (dto.apiEndpoint !== undefined) config.apiEndpoint = dto.apiEndpoint ?? null;
    if (dto.systemPrompt !== undefined) config.systemPrompt = dto.systemPrompt ?? null;
    if (dto.maxTokens !== undefined) config.maxTokens = dto.maxTokens;
    if (dto.maxContextMessages !== undefined) config.maxContextMessages = dto.maxContextMessages;
    if (dto.useKnowledgeBase !== undefined) config.useKnowledgeBase = dto.useKnowledgeBase;
    if (dto.autoHandoff !== undefined) config.autoHandoff = dto.autoHandoff;
    if (dto.handoffKeywords !== undefined) config.handoffKeywords = dto.handoffKeywords ?? null;
    if (dto.fallbackMessage !== undefined) config.fallbackMessage = dto.fallbackMessage ?? null;
    if (dto.sessionScopes !== undefined) config.sessionScopes = dto.sessionScopes ?? null;
    config.updatedBy = apiKeyId ?? null;

    return this.configRepo.save(config);
  }

  // ── Knowledge Documents ──

  async findAllDocuments(
    businessId: string | null,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<KnowledgeDocument[]> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    const qb = this.docRepo.createQueryBuilder('d');
    qb.where('d.businessId = :businessId', { businessId: targetBusinessId });
    qb.orderBy('d.updatedAt', 'DESC').take(opts.limit ?? 50);
    if (opts.offset) qb.skip(opts.offset);
    return qb.getMany();
  }

  async findOneDocument(id: string, businessId: string | null): Promise<KnowledgeDocument> {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Knowledge document not found');
    if (businessId && doc.businessId !== businessId) throw new ForbiddenException('Not authorized for this document');
    return doc;
  }

  async createDocument(
    businessId: string | null,
    dto: CreateKnowledgeDocumentDto,
    apiKeyId?: string,
  ): Promise<KnowledgeDocument> {
    const targetBusinessId = businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    if (dto.content.length > MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new BadRequestException(
        `Document content exceeds maximum length of ${String(MAX_DOCUMENT_CONTENT_LENGTH)} characters`,
      );
    }

    const count = await this.docRepo.count({ where: { businessId: targetBusinessId } });
    if (count >= MAX_DOCUMENTS_PER_BUSINESS) {
      throw new BadRequestException(`Maximum of ${String(MAX_DOCUMENTS_PER_BUSINESS)} documents per business reached`);
    }

    const allowedTypes = ['text', 'markdown', 'faq', 'csv', 'json', 'product', 'guideline', 'custom'];
    const resolvedFileType = dto.fileType || dto.type || 'faq';
    if (!allowedTypes.includes(resolvedFileType)) {
      throw new BadRequestException(
        `File type "${resolvedFileType}" not supported. Allowed: ${allowedTypes.join(', ')}`,
      );
    }

    const doc = this.docRepo.create({
      businessId: targetBusinessId,
      title: dto.title,
      fileType: resolvedFileType,
      content: dto.content,
      status: DocumentStatus.READY,
      uploadedBy: apiKeyId ?? null,
    });
    return this.docRepo.save(doc);
  }

  async updateDocument(
    id: string,
    businessId: string | null,
    dto: UpdateKnowledgeDocumentDto,
    apiKeyId?: string,
  ): Promise<KnowledgeDocument> {
    const doc = await this.findOneDocument(id, businessId);

    if (dto.title !== undefined) doc.title = dto.title;
    const resolvedFileType = dto.fileType || dto.type;
    if (resolvedFileType !== undefined) doc.fileType = resolvedFileType;
    if (dto.content !== undefined) {
      if (dto.content.length > MAX_DOCUMENT_CONTENT_LENGTH) {
        throw new BadRequestException(
          `Document content exceeds maximum length of ${String(MAX_DOCUMENT_CONTENT_LENGTH)} characters`,
        );
      }
      doc.content = dto.content;
    }
    doc.uploadedBy = apiKeyId ?? null;

    return this.docRepo.save(doc);
  }

  async deleteDocument(id: string, businessId: string | null): Promise<void> {
    const doc = await this.findOneDocument(id, businessId);
    await this.docRepo.remove(doc);
  }

  // ── Chat (provider-agnostic interface) ──

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const targetBusinessId = request.businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    const config = await this.getConfig(targetBusinessId);

    if (!config.enabled) {
      return {
        reply: config.fallbackMessage ?? 'AI assistance is not enabled for this business.',
        handoff: false,
        confidence: 'low',
      };
    }

    if (config.sessionScopes && config.sessionScopes.length > 0) {
      if (!config.sessionScopes.includes(request.sessionId)) {
        return {
          reply: config.fallbackMessage ?? 'AI assistance is not available on this channel.',
          handoff: false,
          confidence: 'low',
        };
      }
    }

    if (this.shouldHandoff(request.message, config)) {
      return {
        reply: 'Connecting you with a human agent. Please wait.',
        handoff: true,
        confidence: 'high',
      };
    }

    try {
      return await this.generateReply(config, { ...request, businessId: targetBusinessId });
    } catch (err) {
      this.logger.error(
        `AI provider error for business=${request.businessId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        reply:
          config.fallbackMessage ??
          'I apologize, but I am unable to assist right now. Let me connect you with a human agent.',
        handoff: config.autoHandoff,
        confidence: 'low',
      };
    }
  }

  /** Knowledge lookup plus provider call. Throws on failure; callers choose how to fall back. */
  private async generateReply(config: AiConfig, request: AiChatRequest): Promise<AiChatResponse> {
    const knowledgeContext = config.useKnowledgeBase
      ? await this.retrieveRelevantKnowledge(request.businessId, request.message)
      : '';
    return this.callProvider(config, request, knowledgeContext);
  }

  private shouldHandoff(message: string, config: AiConfig): boolean {
    if (!config.handoffKeywords) return false;
    const keywords = config.handoffKeywords.split(',').map(k => k.trim().toLowerCase());
    const lower = message.toLowerCase();
    return keywords.some(k => k && lower.includes(k));
  }

  async retrieveRelevantKnowledge(businessId: string, query: string): Promise<string> {
    const docs = await this.docRepo.find({
      where: { businessId, status: DocumentStatus.READY },
      select: { id: true, title: true, content: true },
    });

    if (docs.length === 0) return '';

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    const scored = docs.map(doc => {
      const contentLower = doc.content.toLowerCase();
      const titleLower = doc.title.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 3;
        if (contentLower.includes(word)) score += 1;
      }
      return { doc, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const relevant = scored.filter(s => s.score > 0).slice(0, 3);

    if (relevant.length === 0) return '';

    const chunks = relevant.map(r => {
      const preview = r.doc.content.substring(0, 2000);
      return `[${r.doc.title}]\n${preview}`;
    });

    return chunks.join('\n\n---\n\n');
  }

  private getGroqApiKeys(): string[] {
    const rawKeys = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4,
      process.env.GROQ_API_KEY_5,
      process.env.GROQ_API_KEY_6,
    ].filter((k): k is string => typeof k === 'string' && k.trim().length > 0);

    return Array.from(new Set(rawKeys.map(k => k.trim())));
  }

  private async callGroq(config: AiConfig, request: AiChatRequest, knowledgeContext: string): Promise<AiChatResponse> {
    const systemParts: string[] = [];
    if (config.systemPrompt) systemParts.push(config.systemPrompt);
    if (knowledgeContext) {
      systemParts.push(
        'Use the following knowledge base documents to answer. If the answer is not in the documents, say so honestly and offer to connect with a human agent.\n\n' +
          knowledgeContext,
      );
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (systemParts.length > 0) {
      messages.push({ role: 'system', content: systemParts.join('\n\n') });
    }

    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const historyLimit = config.maxContextMessages ?? 10;
      const validHistory = request.conversationHistory
        .slice(-historyLimit)
        .filter(m => m && typeof m.content === 'string' && m.content.trim())
        .map(m => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content.trim(),
        }));
      messages.push(...trimHistory(validHistory));
    }

    messages.push({ role: 'user', content: request.message.slice(0, MAX_USER_MESSAGE_CHARS) });

    const { content, tokensUsed } = await this.complete(messages, {
      model: config.model?.trim() || undefined,
      maxTokens: config.maxTokens || 1000,
      temperature: 0.7,
    });

    return {
      reply: content,
      handoff: false,
      confidence: 'high',
      sourceDocs: knowledgeContext ? ['knowledge-base'] : undefined,
      tokensUsed,
    };
  }

  /**
   * Raw Groq chat completion over the rotating key pool. Throws when every key fails, so callers
   * can tell a real answer from a failure (unlike chat(), which returns the business fallback text).
   */
  async complete(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      reasoningEffort?: 'low' | 'medium' | 'high';
    } = {},
  ): Promise<{ content: string; tokensUsed?: number }> {
    const keys = this.getGroqApiKeys();
    if (keys.length === 0) {
      throw new Error('No Groq API keys configured. Set GROQ_API_KEY in .env or settings.');
    }

    const payload = {
      model: options.model || process.env.GROQ_DEFAULT_MODEL || 'openai/gpt-oss-120b',
      messages,
      max_tokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const keyIndex = (this.groqKeyIndex + attempt) % keys.length;
      const key = keys[keyIndex];

      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });

        if (response.status === 429) {
          this.logger.warn(`Groq rate limited (429) on key [${keyIndex + 1}/${keys.length}]. Rotating to next key.`);
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          // Too large / malformed fails identically on every key; rotating would only multiply the cost.
          if (response.status === 413 || response.status === 400) {
            throw new NonRetryableAiError(`Groq HTTP ${response.status}: ${errText}`);
          }
          throw new Error(`Groq HTTP ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };

        const content = data.choices?.[0]?.message?.content?.trim();
        if (!content) throw new Error('Groq returned empty reply');

        // Advance key index for round-robin distribution
        this.groqKeyIndex = (keyIndex + 1) % keys.length;

        return { content, tokensUsed: data.usage?.total_tokens };
      } catch (err) {
        if (err instanceof NonRetryableAiError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`Groq attempt ${attempt + 1} with key index ${keyIndex} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('All Groq keys failed to process request');
  }

  /** Speech to text (Groq Whisper) over the same key pool; used for WhatsApp voice notes. */
  async transcribe(audio: Buffer, mimetype: string, timeoutMs = 15000): Promise<string> {
    const keys = this.getGroqApiKeys();
    if (keys.length === 0) throw new Error('No Groq API keys configured. Set GROQ_API_KEY in .env or settings.');
    const ext = mimetype.includes('ogg')
      ? 'ogg'
      : mimetype.includes('mpeg')
        ? 'mp3'
        : mimetype.includes('mp4')
          ? 'm4a'
          : 'webm';

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const keyIndex = (this.groqKeyIndex + attempt) % keys.length;
      try {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(audio)], { type: mimetype.split(';')[0] }), `voice.${ext}`);
        form.append('model', process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo');
        form.append('response_format', 'json');
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${keys[keyIndex]}` },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 429) continue;
        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 413 || response.status === 400) {
            throw new NonRetryableAiError(`Groq HTTP ${response.status}: ${errText}`);
          }
          throw new Error(`Groq HTTP ${response.status}: ${errText}`);
        }
        this.groqKeyIndex = (keyIndex + 1) % keys.length;
        return (((await response.json()) as { text?: string }).text ?? '').trim();
      } catch (err) {
        if (err instanceof NonRetryableAiError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error('All Groq keys failed to transcribe');
  }

  /**
   * Streamed Groq chat completion over the same key pool. Yields text as it arrives; keys rotate only
   * before the first token, so a reply is never stitched together from two answers.
   */
  async *streamComplete(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      reasoningEffort?: 'low' | 'medium' | 'high';
      signal?: AbortSignal;
    } = {},
  ): AsyncGenerator<string> {
    const keys = this.getGroqApiKeys();
    if (keys.length === 0) {
      throw new Error('No Groq API keys configured. Set GROQ_API_KEY in .env or settings.');
    }
    const payload = {
      model: options.model || process.env.GROQ_DEFAULT_MODEL || 'openai/gpt-oss-120b',
      messages,
      max_tokens: options.maxTokens ?? 400,
      temperature: options.temperature ?? 0.7,
      stream: true,
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort, include_reasoning: false } : {}),
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const keyIndex = (this.groqKeyIndex + attempt) % keys.length;
      const signals = [AbortSignal.timeout(30000), ...(options.signal ? [options.signal] : [])];
      let response: Response;
      try {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${keys[keyIndex]}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.any(signals),
        });
      } catch (err) {
        if (options.signal?.aborted) return;
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      if (response.status === 429) {
        this.logger.warn(`Groq rate limited (429) on key [${keyIndex + 1}/${keys.length}]. Rotating to next key.`);
        continue;
      }
      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        if (response.status === 413 || response.status === 400) {
          throw new NonRetryableAiError(`Groq HTTP ${response.status}: ${errText}`);
        }
        lastError = new Error(`Groq HTTP ${response.status}: ${errText}`);
        continue;
      }

      this.groqKeyIndex = (keyIndex + 1) % keys.length;
      const decoder = new TextDecoder();
      let buffered = '';
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          buffered += decoder.decode(chunk, { stream: true });
          let newline: number;
          while ((newline = buffered.indexOf('\n')) >= 0) {
            const line = buffered.slice(0, newline).trim();
            buffered = buffered.slice(newline + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) yield text;
            } catch {
              // a keep-alive or partial line; the next chunk completes it
            }
          }
        }
      } catch (err) {
        if (options.signal?.aborted) return;
        throw err;
      }
      return;
    }
    throw lastError ?? new Error('All Groq keys failed to process request');
  }

  private async callProvider(
    config: AiConfig,
    request: AiChatRequest,
    knowledgeContext: string,
  ): Promise<AiChatResponse> {
    // Check if Groq provider or Groq keys available
    if (
      config.provider === AiProvider.GROQ ||
      config.provider === AiProvider.OPENAI ||
      this.getGroqApiKeys().length > 0
    ) {
      return this.callGroq(config, request, knowledgeContext);
    }

    if (config.provider === AiProvider.CUSTOM && config.apiEndpoint) {
      const messages = [
        ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
        { role: 'user', content: request.message },
      ];
      const res = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'default',
          messages,
          max_tokens: config.maxTokens || 1000,
        }),
      });
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        reply?: string;
        message?: string;
      };
      const reply = data.choices?.[0]?.message?.content || data.reply || data.message || 'No response';
      return {
        reply,
        handoff: false,
        confidence: 'medium',
      };
    }

    throw new Error('No AI provider configured. Set GROQ_API_KEY in .env or a custom endpoint in settings.');
  }

  getAvailableModels() {
    return [
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Groq Fast & Powerful)', provider: 'groq' },
      { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Groq Fast)', provider: 'groq' },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (Groq Ultra Fast)', provider: 'groq' },
      { id: 'allam-2-7b', name: 'Allam 2 7B (Groq)', provider: 'groq' },
      { id: 'canopylabs/orpheus-v1-english', name: 'Orpheus v1 English (Groq)', provider: 'groq' },
    ];
  }
}
