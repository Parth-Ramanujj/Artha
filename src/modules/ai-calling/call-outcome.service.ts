import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiCall, AiCallOutcome } from './entities/ai-call.entity';
import { AiCallBatch } from './entities/ai-call-batch.entity';
import { VoiceAgent } from './entities/voice-agent.entity';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { ConversationService } from '../conversation/conversation.service';
import { DND_TAG } from '../conversation/dnd';
import { AiService } from '../ai/ai.service';
import { LeadService } from '../workflow/lead.service';
import { LeadClassifiedBy, LeadInterest, LeadTemperature } from '../workflow/entities/lead.entity';
import { MessageService } from '../message/message.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { analysisPrompt, CallAnalysis, fillTemplate, parseAnalysis } from './call-brain';
import { chatIdFor } from './contacts';
import { AiCallingService } from './ai-calling.service';
import { createLogger } from '../../common/services/logger.service';

const INTERESTS: Record<string, LeadInterest> = {
  insurance: LeadInterest.INSURANCE,
  mutual_fund: LeadInterest.MUTUAL_FUND,
  claim_support: LeadInterest.CLAIM_SUPPORT,
  general: LeadInterest.GENERAL,
};

/** What happens after a call: analysis, the lead, opt-outs and the WhatsApp follow-up. */
@Injectable()
export class CallOutcomeService {
  private readonly logger = createLogger('AiCallOutcome');

  constructor(
    @InjectRepository(AiCall, 'data') private readonly callRepo: Repository<AiCall>,
    @InjectRepository(AiCallBatch, 'data') private readonly batchRepo: Repository<AiCallBatch>,
    @InjectRepository(VoiceAgent, 'data') private readonly agentRepo: Repository<VoiceAgent>,
    @InjectRepository(Session, 'data') private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Conversation, 'data') private readonly conversationRepo: Repository<Conversation>,
    private readonly calling: AiCallingService,
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly leads?: LeadService,
    @Optional() private readonly messages?: MessageService,
    @Optional() private readonly conversations?: ConversationService,
    @Optional() private readonly engines?: EngineRegistry,
  ) {}

  async analyse(call: AiCall, agent: VoiceAgent, customerSpoke: boolean): Promise<CallAnalysis> {
    if (!customerSpoke || !this.ai) return parseAnalysis('', false);
    try {
      const { content } = await this.ai.complete(
        [
          { role: 'system', content: 'You analyse sales phone calls and answer with strict JSON only.' },
          { role: 'user', content: analysisPrompt(agent, call.transcript ?? []) },
        ],
        { model: agent.model, maxTokens: 900, temperature: 0.1, reasoningEffort: 'low' },
      );
      return parseAnalysis(content, true);
    } catch (err) {
      this.logger.warn(`Call analysis failed for ${call.id}: ${err instanceof Error ? err.message : String(err)}`);
      return { ...parseAnalysis('', true), summary: 'The call happened, but the automatic summary failed.' };
    }
  }

  /** Runs once per finished call. Test calls are analysed but never become leads or get messages. */
  async process(callId: string, customerSpoke: boolean): Promise<void> {
    const call = await this.callRepo.findOne({ where: { id: callId } });
    if (!call) return;
    const agent = await this.agentRepo.findOne({ where: { id: call.agentId } });
    if (!agent) return;

    const analysis = await this.analyse(call, agent, customerSpoke);
    call.summary = analysis.summary;
    call.sentiment = analysis.sentiment;
    call.outcome = analysis.outcome;
    call.extracted = analysis.extracted;
    call.isVerifiedLead = analysis.isVerifiedLead;
    call.leadTemperature = analysis.temperature;
    if (!call.contactName && analysis.extracted.name) call.contactName = analysis.extracted.name;
    await this.callRepo.save(call);
    if (call.channel !== 'phone') return;

    if (analysis.outcome === AiCallOutcome.DO_NOT_CALL) await this.markDoNotCall(call, agent);
    if (analysis.isVerifiedLead) {
      await this.saveLead(call, agent, analysis);
      const batch = call.batchId ? await this.batchRepo.findOne({ where: { id: call.batchId } }) : null;
      if (batch?.sendWhatsapp || agent.whatsappFollowup) {
        await this.sendWhatsapp(call.businessId, call.id).catch(err =>
          this.logger.warn(
            `WhatsApp follow-up for call ${call.id} failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
  }

  private async saveLead(call: AiCall, agent: VoiceAgent, analysis: CallAnalysis): Promise<void> {
    if (!this.leads) return;
    try {
      const x = analysis.extracted;
      const interest = INTERESTS[x.interest ?? 'general'] ?? LeadInterest.GENERAL;
      const lead = await this.leads.createOrUpdateLead({
        businessId: call.businessId,
        chatId: chatIdFor(call.phone),
        customerPhone: call.phone.replace(/\D/g, ''),
        customerName: x.name ?? call.contactName ?? undefined,
        mainService:
          interest === LeadInterest.MUTUAL_FUND
            ? 'mutual_fund'
            : interest === LeadInterest.GENERAL
              ? 'general'
              : 'insurance',
        selectedService: 'ai_call',
        issueDescription:
          [x.need, x.callbackTime ? `Call back: ${x.callbackTime}` : null, x.notes].filter(Boolean).join(' · ') ||
          undefined,
        pincode: x.pincode ?? '',
        city: x.city ?? undefined,
        metadata: { source: 'ai_call', callId: call.id, agentId: agent.id, summary: analysis.summary },
      });
      await this.leads.applyAutoClassification(lead.id, {
        temperature: analysis.temperature as LeadTemperature,
        interest,
        classifiedBy: LeadClassifiedBy.AI,
        reason: `AI call: ${analysis.summary}`.slice(0, 300),
      });
      call.leadId = lead.id;
      await this.callRepo.save(call);
    } catch (err) {
      this.logger.warn(`Could not save lead for call ${call.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Tags every WhatsApp chat with this number "dnd", so campaigns and follow-ups skip it too. */
  private async markDoNotCall(call: AiCall, agent: VoiceAgent): Promise<void> {
    const chatId = chatIdFor(call.phone);
    const chats = await this.conversationRepo.find({ where: { businessId: call.businessId, chatId } });
    if (chats.length === 0 && this.conversations) {
      const sessionId = await this.whatsappSession(call.businessId, agent);
      if (sessionId) chats.push(await this.conversations.getOrCreateConversation(call.businessId, sessionId, chatId));
    }
    for (const chat of chats) {
      if (!(chat.tags ?? []).includes(DND_TAG)) {
        await this.conversationRepo.update(chat.id, { tags: [...(chat.tags ?? []), DND_TAG] });
      }
    }
  }

  /** The agent's WhatsApp number if set, otherwise the business's first connected one. */
  private async whatsappSession(businessId: string, agent: VoiceAgent): Promise<string | null> {
    if (agent.whatsappSessionId) return agent.whatsappSessionId;
    const sessions = await this.sessionRepo.find({
      where: { businessId, status: In([SessionStatus.READY]) },
      select: { id: true },
      order: { updatedAt: 'DESC' },
    });
    const live = sessions.find(s => !this.engines || this.engines.get(s.id));
    return live?.id ?? null;
  }

  /** Sends the agent's WhatsApp message to a verified lead; also used by the dashboard button. */
  async sendWhatsapp(businessId: string, callId: string): Promise<AiCall> {
    const call = await this.calling.getCall(businessId, callId);
    if (call.channel !== 'phone') throw new BadRequestException('Test calls have no WhatsApp number');
    if (call.whatsappSentAt) throw new BadRequestException('The WhatsApp message was already sent');
    if (await this.calling.isDoNotCall(businessId, call.phone)) {
      throw new BadRequestException('This contact opted out (DND); no message was sent');
    }
    const agent = await this.calling.getAgent(businessId, call.agentId);
    const template = agent.whatsappMessage?.trim();
    if (!template) throw new BadRequestException('Write the WhatsApp message in the agent settings first');
    const sessionId = await this.whatsappSession(businessId, agent);
    if (!sessionId || !this.messages) throw new BadRequestException('No connected WhatsApp number to send from');
    const text = fillTemplate(template, {
      name: call.extracted?.name ?? call.contactName,
      persona: agent.personaName,
      company: agent.companyName,
    });
    await this.messages.sendText(sessionId, { chatId: chatIdFor(call.phone), text });
    call.whatsappSentAt = new Date();
    return this.callRepo.save(call);
  }
}
