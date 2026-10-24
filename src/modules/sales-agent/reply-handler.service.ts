import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import {
  SalesActivity,
  SalesAgentConfig,
  SalesChannelName,
  SalesConversation,
  SalesOutboxItem,
  SalesProspect,
} from './entities/sales-agent.entity';
import type { InboundReply } from './channels/sales-channel';
import {
  fence,
  Intent,
  INTENTS,
  isEscalation,
  isOptOut,
  looksLikeMetaReply,
  nextStage,
  parseIntent,
  preSendProblems,
  UNTRUSTED_RULE,
} from './sales-rules';
import { SalesWriterService } from './writer.service';

const REPLY_GUIDE: Partial<Record<Intent, string>> = {
  interested:
    'They are interested. Answer briefly and move to the goal (suggest a time or share the booking link). Under 80 words.',
  objection:
    'They raised an objection. Acknowledge it, answer honestly with one point, ask one question. Under 100 words.',
  question:
    'They asked a question. Answer it directly and truthfully from what you know, then one light next step. Under 100 words.',
  wrong_person: 'You reached the wrong person. Thank them and ask who handles this. Under 50 words.',
};

export type HandleOutcome =
  'duplicate' | 'opted_out' | 'escalated' | 'lost' | 'ooo' | 'drafted' | 'needs_human' | 'held';

@Injectable()
export class SalesReplyHandlerService {
  private readonly logger = new Logger(SalesReplyHandlerService.name);

  constructor(
    private readonly ai: AiService,
    private readonly writer: SalesWriterService,
    @InjectRepository(SalesProspect, 'data') private readonly prospects: Repository<SalesProspect>,
    @InjectRepository(SalesConversation, 'data') private readonly conversations: Repository<SalesConversation>,
    @InjectRepository(SalesOutboxItem, 'data') private readonly outbox: Repository<SalesOutboxItem>,
    @InjectRepository(SalesActivity, 'data') private readonly activity: Repository<SalesActivity>,
  ) {}

  /** Records a prospect's reply, stops their sequence, classifies it and drafts an answer when one is due. */
  async handle(
    config: SalesAgentConfig,
    prospect: SalesProspect,
    channel: SalesChannelName,
    reply: InboundReply,
    onOptOut?: () => Promise<void>,
  ): Promise<HandleOutcome> {
    const conv =
      (await this.conversations.findOne({ where: { prospectId: prospect.id } })) ??
      this.conversations.create({
        businessId: config.businessId,
        prospectId: prospect.id,
        channel,
        thread: [],
        stage: 'initial_outreach',
        status: 'open',
      });
    if (conv.thread.some(e => e.ref === reply.ref)) return 'duplicate';
    conv.thread = [
      ...conv.thread,
      { from: 'prospect', text: reply.text, at: new Date().toISOString(), ref: reply.ref },
    ];

    if (prospect.status === 'opted_out') {
      // Still recorded, never answered; a legal threat still needs a person.
      if (isEscalation(reply.text)) conv.status = 'needs_human';
      await this.conversations.save(conv);
      return isEscalation(reply.text) ? 'escalated' : 'opted_out';
    }

    // Stop-on-reply: nothing scheduled goes out once they have answered.
    await this.outbox.update(
      { prospectId: prospect.id, status: In(['pending_review', 'approved']) },
      { status: 'cancelled', error: 'stopped: the prospect replied' },
    );
    prospect.status = 'replied';

    if (conv.status === 'needs_human') {
      await this.prospects.save(prospect);
      await this.conversations.save(conv);
      return 'needs_human';
    }

    const intent = await this.classify(reply.text);
    conv.intent = intent;
    conv.stage = nextStage(conv.stage, intent, reply.text);
    let outcome: HandleOutcome;

    if (intent === 'unsubscribe') {
      prospect.status = 'opted_out';
      conv.status = 'closed';
      await this.log(config.businessId, 'opt_out', { prospectId: prospect.id, channel, message: reply.text });
      await onOptOut?.().catch(err => this.logger.warn(`Opt-out hook failed: ${String(err)}`));
      outcome = 'opted_out';
    } else if (intent === 'escalate') {
      conv.status = 'needs_human';
      await this.log(config.businessId, 'escalation', { prospectId: prospect.id, message: reply.text });
      outcome = 'escalated';
    } else if (intent === 'not_interested') {
      prospect.status = 'lost';
      conv.status = 'closed';
      outcome = 'lost';
    } else if (intent === 'ooo') {
      outcome = 'ooo';
    } else {
      conv.status = 'open';
      outcome = await this.draftReply(config, prospect, conv, intent, reply);
    }

    await this.prospects.save(prospect);
    await this.conversations.save(conv);
    return outcome;
  }

  private async classify(text: string): Promise<Intent> {
    if (isOptOut(text)) return 'unsubscribe';
    if (isEscalation(text)) return 'escalate';
    try {
      const { content } = await this.ai.complete(
        [
          {
            role: 'system',
            content: `Classify a prospect's reply to sales outreach. Answer with exactly one label: ${INTENTS.join(', ')}. When unsure prefer unsubscribe over not_interested, and escalate over anything else. ${UNTRUSTED_RULE}`,
          },
          { role: 'user', content: fence(text, 'prospect-reply') },
        ],
        { maxTokens: 20, temperature: 0 },
      );
      return parseIntent(content);
    } catch (err) {
      this.logger.warn(`Reply classification failed: ${err instanceof Error ? err.message : String(err)}`);
      return 'escalate';
    }
  }

  private async draftReply(
    config: SalesAgentConfig,
    prospect: SalesProspect,
    conv: SalesConversation,
    intent: Intent,
    reply: InboundReply,
  ): Promise<HandleOutcome> {
    const history = conv.thread
      .slice(-6)
      .map(e => `${e.from === 'agent' ? 'You' : 'Prospect'}: ${e.text}`)
      .join('\n');
    const objections = Object.entries(config.product.objectionResponses ?? {})
      .filter(([trigger]) => reply.text.toLowerCase().includes(trigger.toLowerCase()))
      .map(([trigger, answer]) => `If they say "${trigger}": ${answer}`)
      .join('\n');
    const style =
      conv.channel === 'whatsapp'
        ? 'This is WhatsApp: short, conversational, no subject, no sign-off block.'
        : 'This is email: plain text, no subject line in the body.';

    let body = '';
    try {
      const { content } = await this.ai.complete(
        [
          { role: 'system', content: this.writer.systemPrompt(config) },
          {
            role: 'user',
            content: [
              `Conversation stage: ${conv.stage}. Their intent: ${intent}.`,
              REPLY_GUIDE[intent] ?? '',
              style,
              'Rules: one "no" is enough, never push after a refusal. Never invent facts, prices or promises. No em dashes, no exclamation marks.',
              objections ? `Owner's answers to objections:\n${objections}` : '',
              `Conversation so far:\n${fence(history, 'conversation')}`,
              'Write ONLY the reply text.',
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        { maxTokens: 400, temperature: 0.6 },
      );
      body = content.trim();
    } catch (err) {
      this.logger.warn(`Reply drafting failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const subject = conv.channel === 'email' ? `Re: ${(reply.subject || 'your message').replace(/^re:\s*/i, '')}` : '';
    if (!body || looksLikeMetaReply(body) || preSendProblems(conv.channel, 'reply', { subject, body }).length) {
      conv.status = 'needs_human';
      return 'needs_human';
    }
    await this.outbox.save(
      this.outbox.create({
        businessId: config.businessId,
        prospectId: prospect.id,
        channel: conv.channel,
        kind: 'reply',
        step: 0,
        subject: subject.slice(0, 200),
        body,
        inReplyTo: reply.ref.slice(0, 300),
        status: config.requireApproval ? 'pending_review' : 'approved',
        approvedBy: config.requireApproval ? '' : 'autopilot',
        sendAt: new Date(),
      }),
    );
    return config.requireApproval ? 'held' : 'drafted';
  }

  private async log(businessId: string, type: string, details: Record<string, unknown>) {
    await this.activity.save(this.activity.create({ businessId, type, details }));
  }
}
