import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { HookManager, HookResult } from '../../core/hooks';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { AiService } from '../ai/ai.service';
import { BusinessService } from '../business/business.service';
import { ConsentStatus, ContactConsent } from '../campaign/entities/contact-consent.entity';
import { ConversationService } from '../conversation/conversation.service';
import { ConversationStatus } from '../conversation/entities/conversation.entity';
import { DND_TAG, isOptInMessage, OPT_OUT_KEYWORDS } from '../conversation/dnd';
import { MessageService } from '../message/message.service';
import { fence, UNTRUSTED_RULE } from '../sales-agent/sales-rules';
import { Session } from '../session/entities/session.entity';
import { isFreshPersonalMessage, WORKFLOW_MAX_MESSAGE_AGE_MS } from '../workflow/inbound-message-filter';
import { GrowthLink, GrowthSettings } from './entities/growth.entity';
import { parseIntent, parseRef } from './growth-rules';

export const VOICE_TAG = 'voice';
export const COMPLAINT_TAG = 'complaint';
export const BOOKING_TAG = 'booking';
const STOP_REPLY = 'You will not get any more messages from us. Send START anytime to hear from us again.';

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const pass = (): Promise<HookResult> => Promise.resolve({ continue: true });
const normalize = (body: string | undefined) =>
  (body ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, '');

/**
 * Reacts to inbound messages for the Growth features:
 *  - voice notes are transcribed into the message body (before every other bot sees it), then tagged by intent;
 *  - `[ref:xxx]` from a QR / widget link tags the chat with its source;
 *  - a bare STOP opts the customer out and keeps the other bots quiet.
 */
@Injectable()
export class GrowthInboundService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GrowthInboundService.name);
  private readonly hookIds: string[] = [];

  constructor(
    private readonly hookManager: HookManager,
    @InjectRepository(GrowthSettings, 'data') private readonly settingsRepo: Repository<GrowthSettings>,
    @InjectRepository(GrowthLink, 'data') private readonly links: Repository<GrowthLink>,
    @InjectRepository(Session, 'data') private readonly sessions: Repository<Session>,
    @InjectRepository(ContactConsent, 'data') private readonly consents: Repository<ContactConsent>,
    private readonly businessService: BusinessService,
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly ai: AiService,
  ) {}

  onModuleInit(): void {
    // Distinct plugin ids: HookManager ids are `${pluginId}:${event}:${Date.now()}`, so same-ms registrations would collide.
    // Voice runs first (800) so sales-agent (850), workflows (900) and lead capture (910) see the transcript.
    this.hookIds.push(
      this.hookManager.register(
        'growth-voice',
        'message:received',
        ctx => this.onVoice(ctx.sessionId, ctx.data as IncomingMessage),
        800,
      ),
      this.hookManager.register(
        'growth-stop',
        'message:received',
        ctx => this.onStop(ctx.sessionId, ctx.data as IncomingMessage),
        840,
      ),
      this.hookManager.register(
        'growth-ref',
        'message:received',
        ctx => {
          const msg = ctx.data as IncomingMessage;
          const ref = parseRef(msg.body);
          if (ref && ctx.sessionId && isFreshPersonalMessage(msg, WORKFLOW_MAX_MESSAGE_AGE_MS)) {
            void this.attribute(ctx.sessionId, msg, ref).catch(err =>
              this.logger.warn(`Link attribution failed: ${errMsg(err)}`),
            );
          }
          return pass();
        },
        920,
      ),
    );
  }

  onModuleDestroy(): void {
    for (const id of this.hookIds) this.hookManager.unregister(id);
  }

  private async context(sessionId: string): Promise<{ businessId: string; settings: GrowthSettings | null }> {
    const session = await this.sessions.findOne({ where: { id: sessionId }, select: { id: true, businessId: true } });
    const businessId = session?.businessId || (await this.businessService.getOrCreateDefaultBusiness()).id;
    return { businessId, settings: await this.settingsRepo.findOne({ where: { businessId } }) };
  }

  // ── Voice notes ──

  private async onVoice(sessionId: string | undefined, msg: IncomingMessage): Promise<HookResult> {
    if (!sessionId || (msg.type !== 'voice' && msg.type !== 'audio') || msg.body?.trim()) return pass();
    if (!msg.media?.data || msg.media.omitted || !isFreshPersonalMessage(msg, WORKFLOW_MAX_MESSAGE_AGE_MS))
      return pass();
    try {
      const { businessId, settings } = await this.context(sessionId);
      if (!settings?.voiceActionsEnabled) return pass();
      const transcript = await this.ai.transcribe(Buffer.from(msg.media.data, 'base64'), msg.media.mimetype);
      if (!transcript) return pass();
      void this.actOnVoice(businessId, sessionId, msg, transcript).catch(err =>
        this.logger.warn(`Voice action failed for ${msg.chatId}: ${errMsg(err)}`),
      );
      // Returning the changed message is what lets the chat history and every later bot read the words.
      return { continue: true, data: { ...msg, body: transcript } };
    } catch (err) {
      this.logger.warn(`Voice transcription failed for ${msg.chatId}: ${errMsg(err)}`);
      return pass();
    }
  }

  private async actOnVoice(businessId: string, sessionId: string, msg: IncomingMessage, transcript: string) {
    const { content } = await this.ai.complete(
      [
        {
          role: 'system',
          content: [
            'Classify what a customer wants from their WhatsApp voice message (already transcribed).',
            'lead = asking about a product, price or service; booking = wants an appointment, visit, slot or reservation;',
            'complaint = unhappy, a problem, refund or something went wrong; other = anything else.',
            'Reply with JSON only: {"intent":"lead|booking|complaint|other"}',
            UNTRUSTED_RULE,
          ].join('\n'),
        },
        { role: 'user', content: fence(transcript, 'voice-transcript') },
      ],
      { maxTokens: 60, temperature: 0, reasoningEffort: 'low' },
    );
    const intent = parseIntent(content);
    const conv = await this.conversationService.getOrCreateConversation(
      businessId,
      sessionId,
      msg.chatId,
      msg.contact?.pushName || msg.contact?.name,
    );
    const extra = intent === 'complaint' ? [COMPLAINT_TAG] : intent === 'booking' ? [BOOKING_TAG] : [];
    const tags = [...new Set([...(conv.tags ?? []), VOICE_TAG, ...extra])];
    await this.conversationService.updateConversation(conv.id, businessId, {
      tags,
      // A complaint waits for a human; lead capture already handles `lead`.
      ...(intent === 'complaint' ? { status: ConversationStatus.PENDING } : {}),
    });
  }

  // ── Link / QR attribution ──

  private async attribute(sessionId: string, msg: IncomingMessage, ref: string): Promise<void> {
    const { businessId } = await this.context(sessionId);
    const link = await this.links.findOne({ where: { ref, businessId } });
    if (!link) return;
    const conv = await this.conversationService.getOrCreateConversation(
      businessId,
      sessionId,
      msg.chatId,
      msg.contact?.pushName || msg.contact?.name,
    );
    const tag = `src:${link.name}`.slice(0, 60);
    if ((conv.tags ?? []).includes(tag)) return;
    await this.conversationService.updateConversation(conv.id, businessId, { tags: [...(conv.tags ?? []), tag] });
    await this.links.increment({ id: link.id }, 'chats', 1);
  }

  // ── Auto STOP / START ──

  private async onStop(sessionId: string | undefined, msg: IncomingMessage): Promise<HookResult> {
    const body = normalize(msg.body);
    const isStop = OPT_OUT_KEYWORDS.includes(body);
    if (
      !sessionId ||
      (!isStop && !isOptInMessage(msg.body)) ||
      !isFreshPersonalMessage(msg, WORKFLOW_MAX_MESSAGE_AGE_MS)
    ) {
      return pass();
    }
    try {
      const { businessId, settings } = await this.context(sessionId);
      if (!settings?.autoStopEnabled) return pass();
      const phone = msg.chatId.replace(/@.*$/, '');
      const consent =
        (await this.consents.findOne({
          where: { businessId, waContactId: In([msg.chatId, phone, `${phone}@c.us`]), channel: 'whatsapp' },
        })) ??
        this.consents.create({ businessId, waContactId: msg.chatId, channel: 'whatsapp', source: 'whatsapp reply' });

      if (!isStop) {
        // START: the workflow trigger already clears the DND tag; undo our consent opt-out too.
        if (consent.id && consent.status === ConsentStatus.OPTED_OUT) {
          consent.status = ConsentStatus.OPTED_IN;
          consent.consentedAt = new Date();
          consent.revokedAt = null;
          await this.consents.save(consent);
        }
        return pass();
      }

      // Keeps `source` untouched: that is the opt-in proof the compliance page shows.
      consent.status = ConsentStatus.OPTED_OUT;
      consent.revokedAt = new Date();
      await this.consents.save(consent);
      const conv = await this.conversationService.getOrCreateConversation(businessId, sessionId, msg.chatId);
      if (!(conv.tags ?? []).includes(DND_TAG)) {
        await this.conversationService.updateConversation(conv.id, businessId, {
          tags: [...(conv.tags ?? []), DND_TAG],
        });
      }
      await this.messageService.sendText(sessionId, { chatId: msg.chatId, text: STOP_REPLY }).catch(() => undefined);
      // Claim the message so no bot answers a STOP.
      return { continue: false };
    } catch (err) {
      this.logger.warn(`Auto-STOP failed for ${msg.chatId}: ${errMsg(err)}`);
      return pass();
    }
  }
}
