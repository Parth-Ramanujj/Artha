import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { HookManager } from '../../core/hooks';
import { EngineRegistry } from '../../engine/engine-registry.service';
import type { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';
import { Session } from '../session/entities/session.entity';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Lead } from '../workflow/entities/lead.entity';
import { AiCall } from '../ai-calling/entities/ai-call.entity';
import { AiService } from '../ai/ai.service';
import { AiCallingService } from '../ai-calling/ai-calling.service';
import { MessageService } from '../message/message.service';
import { isFreshPersonalMessage, LEAD_MAX_MESSAGE_AGE_MS } from '../workflow/inbound-message-filter';
import { AssistantLink, AssistantTurn, CustomerCareSetting } from './entities/customer-care.entity';
import { CustomerCareService, fillCare, senderE164 } from './customer-care.service';
import { CallRunnerService } from '../ai-calling/call-runner.service';
import { BROWSER_STREAM_PATH } from '../ai-calling/media-gateway.service';

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TURNS = 60;
const MAX_MESSAGE_CHARS = 1000;
const MAX_VOICE_CALLS = 5;

/**
 * The "keep chatting here or talk to the assistant" offer on WhatsApp, and the web assistant behind
 * the link, which knows who the customer is, which of our numbers they wrote to and what was said.
 */
@Injectable()
export class AssistantService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('CustomerCareAssistant');
  private hookId?: string;
  private timer?: NodeJS.Timeout;
  /** businessId → assistant enabled; refreshed every minute and on save. */
  private enabled = new Map<string, CustomerCareSetting['assistant']>();
  /** Chats being offered right now, so two quick messages do not both get the offer. */
  private readonly offering = new Set<string>();
  private readonly voiceStarts = new Map<string, number>();

  constructor(
    @InjectRepository(AssistantLink, 'data') private readonly linkRepo: Repository<AssistantLink>,
    @InjectRepository(CustomerCareSetting, 'data') private readonly settingsRepo: Repository<CustomerCareSetting>,
    @InjectRepository(Session, 'data') private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Message, 'data') private readonly messageRepo: Repository<Message>,
    @InjectRepository(Conversation, 'data') private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Lead, 'data') private readonly leadRepo: Repository<Lead>,
    @InjectRepository(AiCall, 'data') private readonly callRepo: Repository<AiCall>,
    private readonly hookManager: HookManager,
    private readonly engines: EngineRegistry,
    private readonly ai: AiService,
    private readonly calling: AiCallingService,
    private readonly messages: MessageService,
    private readonly care: CustomerCareService,
    private readonly runner: CallRunnerService,
  ) {}

  onModuleInit() {
    void this.refresh().catch(() => undefined);
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), 60_000);
    this.timer.unref();
    this.hookId = this.hookManager.register(
      'customer-care-assistant-offer',
      'message:received',
      ctx => {
        const msg = ctx.data as IncomingMessage;
        if (
          ctx.sessionId &&
          this.enabled.size &&
          msg.type !== 'call' &&
          isFreshPersonalMessage(msg, LEAD_MAX_MESSAGE_AGE_MS)
        ) {
          void this.maybeOffer(ctx.sessionId, msg).catch(err =>
            this.logger.warn(`Assistant offer failed: ${err instanceof Error ? err.message : String(err)}`),
          );
        }
        return Promise.resolve({ continue: true });
      },
      870,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.hookId) this.hookManager.unregister(this.hookId);
  }

  async refresh(): Promise<void> {
    const rows = await this.settingsRepo.find({ select: { businessId: true, assistant: true } });
    this.enabled = new Map(rows.filter(r => r.assistant?.enabled).map(r => [r.businessId, r.assistant]));
  }

  // ── the WhatsApp offer ──

  private async maybeOffer(sessionId: string, msg: IncomingMessage): Promise<void> {
    const key = `${sessionId}:${msg.chatId}`;
    if (this.offering.has(key)) return;
    this.offering.add(key);
    try {
      const session = await this.sessionRepo.findOne({
        where: { id: sessionId },
        select: { id: true, businessId: true },
      });
      const settings = session?.businessId ? this.enabled.get(session.businessId) : undefined;
      if (!session?.businessId || !settings) return;
      if (settings.sessionId && settings.sessionId !== sessionId) return;
      const recent = await this.linkRepo.exists({
        where: {
          sessionId,
          chatId: msg.chatId,
          createdAt: MoreThan(new Date(Date.now() - settings.cooldownHours * 60 * 60 * 1000)),
        },
      });
      if (recent) return;
      const publicUrl = await this.calling.getPublicUrl();
      if (!publicUrl) {
        this.logger.warn('Assistant link not sent: set the public URL in AI Calling setup first');
        return;
      }
      const link = await this.linkRepo.save(
        this.linkRepo.create({
          token: randomBytes(24).toString('base64url'),
          businessId: session.businessId,
          sessionId,
          chatId: msg.chatId,
          phone: await senderE164(this.engines, sessionId, msg),
          transcript: [],
          expiresAt: new Date(Date.now() + LINK_TTL_MS),
        }),
      );
      await this.messages.sendText(sessionId, {
        chatId: msg.chatId,
        text: `${settings.message}\n${publicUrl.replace(/\/+$/, '')}/assistant/${link.token}`,
      });
    } finally {
      this.offering.delete(key);
    }
  }

  // ── the web assistant ──

  private async open(token: string): Promise<AssistantLink> {
    const link =
      typeof token === 'string' && token.length <= 64 ? await this.linkRepo.findOne({ where: { token } }) : null;
    if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
      throw new NotFoundException('This link has expired. Send us a message on WhatsApp for a new one.');
    }
    return link;
  }

  /** What the public page shows: who we are and the chat so far. Never the customer's stored data. */
  async view(token: string): Promise<{ title: string; transcript: AssistantTurn[] }> {
    const link = await this.open(token);
    const settings = await this.care.getSettings(link.businessId);
    return { title: settings.ownerName || 'AI Assistant', transcript: link.transcript };
  }

  async chat(token: string, message: string): Promise<{ reply: string; transcript: AssistantTurn[] }> {
    const link = await this.open(token);
    const text = (typeof message === 'string' ? message : '').trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text) throw new BadRequestException('Write a message first');
    if (link.transcript.length >= MAX_TURNS) {
      return {
        reply: 'This chat is full. Please continue on WhatsApp and we will help you there.',
        transcript: link.transcript,
      };
    }
    const system = await this.systemPrompt(link, text);
    const history = link.transcript.slice(-20).map(t => ({ role: t.role, content: t.content }));
    let reply: string;
    try {
      const { content } = await this.ai.complete(
        [{ role: 'system', content: system }, ...history, { role: 'user', content: text }],
        { maxTokens: 700, temperature: 0.5, reasoningEffort: 'low' },
      );
      reply = content.trim().slice(0, 3000) || 'Sorry, I could not answer that. Please try again.';
    } catch (err) {
      this.logger.warn(`Assistant reply failed: ${err instanceof Error ? err.message : String(err)}`);
      reply = 'Sorry, I am having trouble right now. Please continue on WhatsApp and we will help you.';
    }
    const at = new Date().toISOString();
    link.transcript = [
      ...link.transcript,
      { role: 'user', content: text, at },
      { role: 'assistant', content: reply, at },
    ];
    await this.linkRepo.update(link.id, { transcript: link.transcript });
    return { reply, transcript: link.transcript };
  }

  /**
   * Starts a voice conversation in the customer's browser: the AI calling voice engine, briefed with
   * everything we know about them. Returns what the page needs to open the audio websocket.
   */
  async startVoice(token: string): Promise<{ callId: string; token: string; path: string }> {
    const link = await this.open(token);
    // shortcut: in-memory per-link cap (resets on restart); move to a column if links get abused.
    const used = this.voiceStarts.get(link.id) ?? 0;
    if (used >= MAX_VOICE_CALLS) {
      throw new BadRequestException('Voice limit reached for this link. Please continue on WhatsApp.');
    }
    this.voiceStarts.set(link.id, used + 1);
    const settings = await this.care.getSettings(link.businessId);
    const [conversation, lastInbound] = await Promise.all([
      this.conversationRepo.findOne({ where: { sessionId: link.sessionId, chatId: link.chatId } }),
      this.messageRepo.findOne({
        where: { sessionId: link.sessionId, chatId: link.chatId, direction: MessageDirection.INCOMING },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const name = conversation?.chatName ?? null;
    const agent = await this.calling.getAgent(link.businessId, settings.missedCall.voiceAgentId || null);
    const call = await this.calling.createTestCall(link.businessId, agent.id, {
      contactName: name,
      greeting: fillCare(settings.assistant.voiceGreeting, { name, owner: settings.ownerName || agent.companyName }),
      briefing: await this.systemPrompt(link, lastInbound?.body ?? '', 'voice'),
    });
    return { callId: call.id, token: this.runner.tokens.issue(call.id, 60_000), path: BROWSER_STREAM_PATH };
  }

  /** Everything we know about this customer, so the assistant can serve them without asking again. */
  private async systemPrompt(link: AssistantLink, question: string, mode: 'chat' | 'voice' = 'chat'): Promise<string> {
    const settings = await this.care.getSettings(link.businessId);
    const owner = settings.ownerName || 'the business';
    const [session, conversation, lead, lastCall, recent, knowledge] = await Promise.all([
      this.sessionRepo.findOne({
        where: { id: link.sessionId },
        select: { id: true, name: true, phone: true, pushName: true },
      }),
      this.conversationRepo.findOne({ where: { sessionId: link.sessionId, chatId: link.chatId } }),
      this.leadRepo.findOne({
        where: { businessId: link.businessId, chatId: link.chatId },
        order: { createdAt: 'DESC' },
      }),
      link.phone
        ? this.callRepo.findOne({
            where: { businessId: link.businessId, phone: link.phone },
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve(null),
      this.messageRepo.find({
        where: { sessionId: link.sessionId, chatId: link.chatId },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.ai.retrieveRelevantKnowledge(link.businessId, question).catch(() => ''),
    ]);

    const facts: string[] = [];
    if (link.phone) facts.push(`Their phone / WhatsApp number: ${link.phone}`);
    if (conversation?.chatName) facts.push(`Name on WhatsApp: ${conversation.chatName}`);
    if (conversation?.tags?.length) facts.push(`Tags: ${conversation.tags.join(', ')}`);
    if (lead) {
      const l = lead;
      facts.push(
        `Lead record: ${[
          l.customerName && `name ${l.customerName}`,
          l.mainService && `service ${l.mainService}`,
          l.selectedService && `need ${l.selectedService}`,
          l.subProduct && `product ${l.subProduct}`,
          l.insuranceCompany && `insurer ${l.insuranceCompany}`,
          l.issueDescription && `issue: ${l.issueDescription}`,
          l.city && `city ${l.city}`,
          l.pincode && `pincode ${l.pincode}`,
          l.status && `status ${l.status}`,
        ]
          .filter(Boolean)
          .join('; ')}`,
      );
    }
    if (lastCall?.summary)
      facts.push(`Last phone call with us (${lastCall.createdAt.toISOString().slice(0, 10)}): ${lastCall.summary}`);

    const chat = recent
      .reverse()
      .filter(m => m.body?.trim())
      .map(m => `${m.direction === MessageDirection.OUTGOING ? 'Us' : 'Customer'}: ${m.body.trim().slice(0, 400)}`)
      .join('\n');

    return [
      mode === 'chat'
        ? `You are the AI assistant of ${owner}, chatting with a customer on a web page they opened from WhatsApp.`
        : `You are the voice AI assistant of ${owner}. The customer opened your link from WhatsApp and is talking to you by voice in their browser; nobody dialled them. Help them with whatever they need.`,
      `They came from WhatsApp, writing to our number ${session?.phone ?? ''}${session?.pushName ? ` (${session.pushName})` : ''}.`,
      'Use what we already know below so the customer never has to repeat themselves. Greet them by name when you know it.',
      mode === 'chat'
        ? 'Reply in the language and script the customer writes in (Gujarati, Hindi or English). Keep replies short and clear.'
        : '',
      `If you cannot solve something, say that ${owner} will follow up on WhatsApp. Never invent prices, policies or promises that are not in the knowledge below.`,
      'Never ask for OTPs, passwords, card or bank details.',
      settings.assistant.instructions ? `\n## Instructions from ${owner}\n${settings.assistant.instructions}` : '',
      facts.length ? `\n## What we know about this customer\n${facts.join('\n')}` : '',
      chat ? `\n## Their recent WhatsApp chat with us (oldest first)\n${chat}` : '',
      knowledge ? `\n## Knowledge base\n${knowledge}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
